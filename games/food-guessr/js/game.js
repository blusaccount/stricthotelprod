// ============================================================
// Food Guessr — Game Logic (multi-mode)
//
//   CLASSIC          : 3 rounds, guess the country, lives + hints
//   RATE             : Tinder-style smash/pass on every dish
//   SCRANDLE WIKI    : Higher/lower on Wikipedia pageviews
//   SCRANDLE COMMUNITY: Higher/lower on StrictHotel like-rate
// ============================================================

(function () {
    'use strict';

    var COUNTRIES = window.FG_COUNTRIES;
    var DISHES = window.FG_DISHES;

    // ─── Shared helpers ───
    function $(id) { return document.getElementById(id); }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }
    function shuffle(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }
    function showScreen(id) {
        var screens = document.querySelectorAll('.fg-screen');
        for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
        var el = $(id);
        if (el) el.classList.add('active');
    }
    function formatViews(n) {
        if (n == null) return '—';
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return Math.round(n / 1e3) + 'K';
        return String(n);
    }
    function communityScore(agg) {
        // Returns null when not enough data, otherwise an integer 0-100.
        if (!agg || (agg.total || 0) < 1) return null;
        return Math.round((agg.likes / agg.total) * 100);
    }

    // ─── Shared dish loader (used by every mode) ───

    // Most dish photos are Creative Commons, where naming the author and the
    // licence is a condition of use, so the credit rides along with the photo
    // in every mode rather than living only on the credits page.
    function renderPhotoCredit(imgEl, info) {
        var wrap = imgEl.parentElement;
        if (!wrap) return;
        var el = wrap.querySelector('.fg-credit');
        if (!info || (!info.artist && !info.licence)) {
            if (el) el.remove();
            return;
        }
        if (!el) {
            el = document.createElement('div');
            el.className = 'fg-credit';
            wrap.appendChild(el);
        }
        var who = info.artist
            ? (info.artistUrl
                ? '<a href="' + escapeHtml(info.artistUrl) + '" target="_blank" rel="noopener">' + escapeHtml(info.artist) + '</a>'
                : escapeHtml(info.artist))
            : 'Unknown';
        var lic = info.licence
            ? (info.licenceUrl
                ? ' · <a href="' + escapeHtml(info.licenceUrl) + '" target="_blank" rel="noopener">' + escapeHtml(info.licence) + '</a>'
                : ' · ' + escapeHtml(info.licence))
            : '';
        var src = info.source
            ? ' · <a href="' + escapeHtml(info.source) + '" target="_blank" rel="noopener">Wikimedia</a>'
            : '';
        el.innerHTML = '📷 ' + who + lic + src;
    }

    async function attachDishImage(dish, imgEl, fallbackEl, loadingText) {
        imgEl.style.display = 'none';
        imgEl.removeAttribute('src');
        renderPhotoCredit(imgEl, null);
        fallbackEl.style.display = 'flex';
        fallbackEl.innerHTML = '<div class="fg-fallback-emoji">' + dish.emoji + '</div>' +
                               '<div class="fg-fallback-loading">' + escapeHtml(loadingText || 'Loading…') + '</div>';
        var info = await window.FG_fetchDishImage(dish.wikiTitle);
        if (info && info.src) {
            return new Promise(function (resolve) {
                imgEl.onload = function () {
                    imgEl.style.display = 'block';
                    fallbackEl.style.display = 'none';
                    renderPhotoCredit(imgEl, info);
                    resolve(true);
                };
                imgEl.onerror = function () {
                    fallbackEl.innerHTML = '<div class="fg-fallback-emoji">' + dish.emoji + '</div>' +
                                           '<div class="fg-fallback-loading">Photo unavailable</div>';
                    resolve(false);
                };
                imgEl.src = info.src;
            });
        } else {
            fallbackEl.innerHTML = '<div class="fg-fallback-emoji">' + dish.emoji + '</div>' +
                                   '<div class="fg-fallback-loading">Photo unavailable</div>';
            return false;
        }
    }

    // ─── Server connection (community ratings + leaderboards) ───
    var socket = null;
    var communityAggregates = {};   // dishKey -> { likes, dislikes, total }
    var myVotes = {};               // dishKey -> 1 | -1
    var leaderboards = { classic: [], scrandleWiki: [], scrandleCommunity: [], myStats: { classic: null, scrandle: {} } };
    var ratingListeners = [];

    function onRatingsChange() {
        for (var i = 0; i < ratingListeners.length; i++) {
            try { ratingListeners[i](); } catch (e) {}
        }
    }

    function renderLeaderboardRows(rows, formatter) {
        if (!rows || !rows.length) return '<div class="fg-lb-empty">No entries yet — be the first!</div>';
        return rows.map(function (r, i) {
            return '<div class="fg-lb-row">' +
                '<span class="fg-lb-rank">#' + (i + 1) + '</span>' +
                '<span class="fg-lb-name">' + escapeHtml(r.name) + '</span>' +
                '<span class="fg-lb-val">' + formatter(r) + '</span>' +
                '</div>';
        }).join('');
    }

    function renderLeaderboards() {
        var classicFmt = function (r) { return r.best + ' pts'; };
        var streakFmt = function (r) { return r.best + (r.best === 1 ? ' streak' : ' streaks'); };

        var elClassic = $('fg-lb-classic');
        if (elClassic) elClassic.innerHTML = renderLeaderboardRows(leaderboards.classic, classicFmt);
        var elWiki = $('fg-lb-scrandle-wiki');
        if (elWiki) elWiki.innerHTML = renderLeaderboardRows(leaderboards.scrandleWiki, streakFmt);
        var elComm = $('fg-lb-scrandle-community');
        if (elComm) elComm.innerHTML = renderLeaderboardRows(leaderboards.scrandleCommunity, streakFmt);

        // Menu-screen top-3 teasers
        var top3 = function (rows, fmt) {
            if (!rows || !rows.length) return '<span class="fg-lb-teaser-empty">no entries yet</span>';
            return rows.slice(0, 3).map(function (r, i) {
                var medal = ['🥇', '🥈', '🥉'][i] || '·';
                return '<span class="fg-lb-teaser-row">' + medal + ' ' +
                    escapeHtml(r.name) + ' <em>' + fmt(r) + '</em></span>';
            }).join('');
        };
        var t1 = $('fg-lb-teaser-classic');
        if (t1) t1.innerHTML = top3(leaderboards.classic, classicFmt);
        var t2 = $('fg-lb-teaser-wiki');
        if (t2) t2.innerHTML = top3(leaderboards.scrandleWiki, streakFmt);
        var t3 = $('fg-lb-teaser-community');
        if (t3) t3.innerHTML = top3(leaderboards.scrandleCommunity, streakFmt);
    }

    function connectSocket() {
        try {
            socket = io();
            socket.on('connect', function () {
                // Register player so the server associates votes with a name.
                var name = (window.StrictHotelSocket && window.StrictHotelSocket.getPlayerName) ?
                    window.StrictHotelSocket.getPlayerName() :
                    (localStorage.getItem('stricthotel-name') || '');
                var hasName = Boolean(name);
                if (hasName) {
                    // Via the shared helper, which supplies the owner token.
                    // Emitting by hand omitted it, and the server rejects a
                    // guest without one — Food Guessr presence never worked.
                    window.StrictHotelSocket.registerPlayer(socket, 'food-guessr');
                }
                // Defer the rating-state request slightly so register-player's
                // async DB write finishes first (it sets onlinePlayers, which the
                // food-rating-state handler reads to filter myVotes by name).
                setTimeout(function () {
                    socket.emit('food-rating-state');
                    socket.emit('food-leaderboards');
                }, hasName ? 200 : 0);
            });
            socket.on('food-rating-state', function (data) {
                communityAggregates = (data && data.aggregates) || {};
                myVotes = (data && data.myVotes) || {};
                onRatingsChange();
            });
            socket.on('food-rating-update', function (data) {
                if (!data || !data.dishKey) return;
                communityAggregates[data.dishKey] = data.agg || { likes: 0, dislikes: 0, total: 0 };
                onRatingsChange();
            });
            socket.on('food-rating-vote-ack', function (data) {
                if (!data || !data.dishKey) return;
                myVotes[data.dishKey] = data.rating;
                onRatingsChange();
            });
            socket.on('food-leaderboards-data', function (data) {
                if (!data) return;
                leaderboards = {
                    classic: data.classic || [],
                    scrandleWiki: data.scrandleWiki || [],
                    scrandleCommunity: data.scrandleCommunity || [],
                    myStats: data.myStats || { classic: null, scrandle: {} }
                };
                renderLeaderboards();
            });
        } catch (err) {
            console.warn('FoodGuessr: socket connection failed —', err.message || err);
        }
    }

    function fetchLeaderboards() {
        if (socket && socket.connected) socket.emit('food-leaderboards');
    }

    function emitVote(dishKey, rating) {
        if (!socket || !socket.connected) {
            // Optimistic local update so UI feels responsive even without server
            myVotes[dishKey] = rating;
            if (!communityAggregates[dishKey]) communityAggregates[dishKey] = { likes: 0, dislikes: 0, total: 0 };
            var agg = communityAggregates[dishKey];
            if (rating === 1) agg.likes++; else agg.dislikes++;
            agg.total = agg.likes + agg.dislikes;
            onRatingsChange();
            return;
        }
        socket.emit('food-rating-vote', { dishKey: dishKey, rating: rating });
    }

    // =========================================================
    // MODE: CLASSIC (3 rounds, guess the country)
    // =========================================================
    var Classic = (function () {
        var ROUNDS_PER_GAME = 3;
        var MAX_LIVES = 3;
        var SCORE_BY_LIVES = { 3: 1000, 2: 600, 1: 300, 0: 0 };

        var rounds = [];
        var roundIdx = 0;
        var lives = MAX_LIVES;
        var totalScore = 0;
        var roundScores = [];
        var currentDish = null;
        var hintsRevealed = 0;
        var guessedCountries = [];
        var roundActive = false;

        function distanceLabel(km) {
            if (km < 250)   return { icon: '🔥🔥', text: 'BURNING HOT', cls: 'fg-temp-burn' };
            if (km < 1000)  return { icon: '🔥',   text: 'VERY HOT',    cls: 'fg-temp-hot' };
            if (km < 2500)  return { icon: '♨️',   text: 'HOT',         cls: 'fg-temp-warm' };
            if (km < 5000)  return { icon: '🌤️',   text: 'WARM',        cls: 'fg-temp-mild' };
            if (km < 9000)  return { icon: '❄️',   text: 'COLD',        cls: 'fg-temp-cold' };
            return            { icon: '🧊',         text: 'FREEZING',    cls: 'fg-temp-freeze' };
        }

        function compassBearing(from, to) {
            var toRad = function (d) { return d * Math.PI / 180; };
            var toDeg = function (r) { return r * 180 / Math.PI; };
            var dLng = toRad(to.lng - from.lng);
            var y = Math.sin(dLng) * Math.cos(toRad(to.lat));
            var x = Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
                    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLng);
            var brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
            var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
            var arrows = { N: '⬆️', NE: '↗️', E: '➡️', SE: '↘️', S: '⬇️', SW: '↙️', W: '⬅️', NW: '↖️' };
            return { arrow: arrows[dirs[Math.round(brng / 45) % 8]] };
        }

        function renderLives() {
            var el = $('fg-lives');
            var s = '';
            for (var i = 0; i < MAX_LIVES; i++) {
                s += '<span class="fg-life' + (i < lives ? '' : ' lost') + '">' +
                     (i < lives ? '❤️' : '🖤') + '</span>';
            }
            el.innerHTML = s;
        }

        function renderHints() {
            var box = $('fg-hints');
            var country = window.FG_findCountry(currentDish.country);
            var rows = [];
            if (hintsRevealed >= 1) {
                rows.push('<div class="fg-hint-row"><span class="fg-hint-label">DISH</span>' +
                          '<span class="fg-hint-value">' + escapeHtml(currentDish.name) + '</span></div>');
                rows.push('<div class="fg-hint-desc">' + escapeHtml(currentDish.description) + '</div>');
            }
            if (hintsRevealed >= 2 && country) {
                rows.push('<div class="fg-hint-row"><span class="fg-hint-label">CONTINENT</span>' +
                          '<span class="fg-hint-value">' + escapeHtml(country.continent) + '</span></div>');
            }
            if (hintsRevealed >= 3 && country) {
                rows.push('<div class="fg-hint-row"><span class="fg-hint-label">REGION</span>' +
                          '<span class="fg-hint-value">' + escapeHtml(country.region) + '</span></div>');
            }
            if (!rows.length) {
                rows.push('<div class="fg-hint-placeholder">Just the photo so far. Take a guess!</div>');
            }
            box.innerHTML = rows.join('');
        }

        function renderSuggestions(query) {
            var box = $('fg-suggestions');
            var q = String(query || '').trim().toLowerCase();
            if (!q) { box.innerHTML = ''; box.classList.remove('open'); return; }
            var matches = [];
            for (var i = 0; i < COUNTRIES.length; i++) {
                var name = COUNTRIES[i].name;
                if (name.toLowerCase().indexOf(q) !== -1) matches.push(name);
                if (matches.length >= 8) break;
            }
            if (!matches.length) {
                box.innerHTML = '<div class="fg-suggestion fg-suggestion-empty">No match</div>';
                box.classList.add('open');
                return;
            }
            box.innerHTML = matches.map(function (n) {
                return '<div class="fg-suggestion" data-name="' + escapeHtml(n) + '">' + escapeHtml(n) + '</div>';
            }).join('');
            box.classList.add('open');
        }

        function flashInputError(msg) {
            var inp = $('fg-input');
            inp.classList.add('fg-input-error');
            var box = $('fg-suggestions');
            box.innerHTML = '<div class="fg-suggestion fg-suggestion-empty">' + escapeHtml(msg) + '</div>';
            box.classList.add('open');
            setTimeout(function () { inp.classList.remove('fg-input-error'); }, 600);
        }

        function appendGuessLog(guess, km, compass, correct) {
            var log = $('fg-guess-log');
            var row = document.createElement('div');
            row.className = 'fg-guess-row' + (correct ? ' fg-guess-correct' : '');
            if (correct) {
                row.innerHTML =
                    '<span class="fg-guess-country">' + escapeHtml(guess.name) + '</span>' +
                    '<span class="fg-guess-result fg-temp-correct">✓ CORRECT</span>';
            } else {
                var temp = distanceLabel(km);
                row.innerHTML =
                    '<span class="fg-guess-country">' + escapeHtml(guess.name) + '</span>' +
                    '<span class="fg-guess-dist">' + Math.round(km).toLocaleString() + ' km ' + (compass ? compass.arrow : '') + '</span>' +
                    '<span class="fg-guess-result ' + temp.cls + '">' + temp.icon + ' ' + temp.text + '</span>';
            }
            log.appendChild(row);
        }

        function submitGuess() {
            if (!roundActive) return;
            var raw = String($('fg-input').value || '').trim();
            if (!raw) return;
            var guess = window.FG_findCountry(raw);
            if (!guess) { flashInputError('Pick a country from the suggestions'); return; }
            if (guessedCountries.indexOf(guess.name) !== -1) { flashInputError('Already tried that one'); return; }
            guessedCountries.push(guess.name);

            var target = window.FG_findCountry(currentDish.country);
            if (!target) { console.error('Target country not found:', currentDish.country); return; }

            if (guess.name === target.name) {
                var earned = SCORE_BY_LIVES[lives] || 0;
                totalScore += earned;
                roundScores.push({ dish: currentDish, guessed: guess.name, livesLeft: lives, earned: earned, correct: true });
                $('fg-total-score').textContent = String(totalScore);
                appendGuessLog(guess, 0, null, true);
                roundActive = false;
                $('fg-input').disabled = true;
                $('fg-btn-submit').disabled = true;
                $('fg-suggestions').classList.remove('open');
                setTimeout(function () { showRoundResult(true, earned); }, 600);
                return;
            }

            var km = window.FG_distanceKm(guess.lat, guess.lng, target.lat, target.lng);
            var compass = compassBearing(guess, target);
            appendGuessLog(guess, km, compass, false);
            lives -= 1;
            renderLives();
            $('fg-input').value = '';
            $('fg-suggestions').classList.remove('open');

            if (lives <= 0) {
                roundScores.push({ dish: currentDish, guessed: guess.name, livesLeft: 0, earned: 0, correct: false });
                roundActive = false;
                $('fg-input').disabled = true;
                $('fg-btn-submit').disabled = true;
                setTimeout(function () { showRoundResult(false, 0); }, 800);
            } else {
                hintsRevealed = Math.min(3, hintsRevealed + 1);
                renderHints();
                $('fg-input').focus();
            }
        }

        function showRoundResult(correct, earned) {
            var target = window.FG_findCountry(currentDish.country);
            $('fg-result-emoji').textContent = correct ? '🎉' : '😵';
            $('fg-result-title').textContent = correct ? 'CORRECT!' : 'OUT OF LIVES';
            $('fg-result-dish').innerHTML =
                '<div class="fg-result-dish-name">' + escapeHtml(currentDish.name) + '</div>' +
                '<div class="fg-result-dish-desc">' + escapeHtml(currentDish.description) + '</div>';
            $('fg-result-country').innerHTML =
                '<span class="fg-result-label">FROM</span> ' +
                '<span class="fg-result-country-name">' + escapeHtml(currentDish.country) + '</span>' +
                (target ? ' <span class="fg-result-region">(' + escapeHtml(target.region) + ')</span>' : '');
            $('fg-result-score').innerHTML =
                '<span class="fg-result-score-num">+' + earned + '</span>' +
                '<span class="fg-result-score-label">points</span>';
            $('fg-btn-next').textContent = (roundIdx + 1 >= ROUNDS_PER_GAME) ? 'SEE FINAL SCORE ▶' : 'NEXT ROUND ▶';
            showScreen('fg-screen-result');
        }

        function nextRound() {
            roundIdx += 1;
            if (roundIdx >= ROUNDS_PER_GAME) showFinalScore();
            else startRound();
        }

        async function startRound() {
            currentDish = rounds[roundIdx];
            lives = MAX_LIVES;
            hintsRevealed = 0;
            guessedCountries = [];
            roundActive = true;

            $('fg-round-number').textContent = 'ROUND ' + (roundIdx + 1) + ' / ' + ROUNDS_PER_GAME;
            $('fg-total-score').textContent = String(totalScore);
            renderLives();
            renderHints();
            $('fg-guess-log').innerHTML = '';
            $('fg-input').value = '';
            $('fg-input').disabled = false;
            $('fg-btn-submit').disabled = false;
            $('fg-suggestions').innerHTML = '';
            $('fg-suggestions').classList.remove('open');

            showScreen('fg-screen-round');
            $('fg-input').focus();

            var ok = await attachDishImage(currentDish, $('fg-dish-image'), $('fg-dish-fallback'),
                                           'Loading photo…');
            if (!ok) {
                hintsRevealed = Math.max(hintsRevealed, 1);
                renderHints();
            }
        }

        function showFinalScore() {
            $('fg-final-score').textContent = String(totalScore);
            var max = ROUNDS_PER_GAME * 1000;
            var pct = Math.round(totalScore / max * 100);
            var verdict;
            if (pct === 100)      verdict = '👑 PERFECT — Foodie Royalty';
            else if (pct >= 80)   verdict = '🌟 World-Class Palate';
            else if (pct >= 60)   verdict = '🍽️ Well-Travelled Eater';
            else if (pct >= 40)   verdict = '🥢 Curious Diner';
            else if (pct >= 20)   verdict = '🍞 Bread-and-Butter';
            else                  verdict = '🥄 Try Again, Hungry Traveller';
            $('fg-final-verdict').textContent = verdict;
            $('fg-final-max').textContent = '/ 3000';

            var list = $('fg-final-rounds');
            list.innerHTML = roundScores.map(function (r, i) {
                return '<div class="fg-final-row">' +
                    '<span class="fg-final-num">' + (i + 1) + '.</span>' +
                    '<span class="fg-final-dish">' + escapeHtml(r.dish.name) + '</span>' +
                    '<span class="fg-final-country">' + escapeHtml(r.dish.country) + '</span>' +
                    '<span class="fg-final-pts">' + (r.correct ? '+' : '') + r.earned + '</span>' +
                    '</div>';
            }).join('');
            showScreen('fg-screen-final');

            // Persist score on server and refresh leaderboard
            if (socket && socket.connected) {
                socket.emit('food-classic-finish', { score: totalScore, perfect: pct === 100 });
            }
        }

        async function start() {
            rounds = shuffle(DISHES).slice(0, ROUNDS_PER_GAME);
            roundIdx = 0;
            totalScore = 0;
            roundScores = [];
            await startRound();
        }

        function wire() {
            $('fg-btn-play-again').addEventListener('click', start);
            $('fg-btn-next').addEventListener('click', nextRound);
            $('fg-btn-submit').addEventListener('click', submitGuess);

            var input = $('fg-input');
            input.addEventListener('input', function () { renderSuggestions(input.value); });
            input.addEventListener('focus', function () { if (input.value) renderSuggestions(input.value); });
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    var box = $('fg-suggestions');
                    var first = box.querySelector('.fg-suggestion:not(.fg-suggestion-empty)');
                    if (first && first.dataset.name && input.value.toLowerCase() !== first.dataset.name.toLowerCase()) {
                        input.value = first.dataset.name;
                    }
                    submitGuess();
                } else if (e.key === 'Escape') {
                    $('fg-suggestions').classList.remove('open');
                }
            });
            $('fg-suggestions').addEventListener('mousedown', function (e) {
                var t = e.target;
                if (t && t.classList.contains('fg-suggestion') && t.dataset.name) {
                    input.value = t.dataset.name;
                    $('fg-suggestions').classList.remove('open');
                    input.focus();
                }
            });
            document.addEventListener('click', function (e) {
                if (e.target === input) return;
                if (e.target.closest && e.target.closest('#fg-suggestions')) return;
                $('fg-suggestions').classList.remove('open');
            });
        }

        return { start: start, wire: wire };
    })();

    // =========================================================
    // MODE: RATE (Tinder-style smash/pass)
    // =========================================================
    var Rate = (function () {
        var queue = [];          // dishes the player hasn't voted on yet
        var currentDish = null;
        var animating = false;

        function rebuildQueue() {
            var voted = myVotes || {};
            var pending = DISHES.filter(function (d) {
                return !Object.prototype.hasOwnProperty.call(voted, d.wikiTitle);
            });
            queue = shuffle(pending);
        }

        function updateProgress() {
            var total = DISHES.length;
            var done = total - queue.length - (currentDish ? 1 : 0);
            if (done < 0) done = 0;
            $('fg-rate-progress').textContent = done + ' / ' + total + ' voted';
            $('fg-rate-progress-bar').style.width = Math.round((done / total) * 100) + '%';
        }

        async function showNext() {
            if (animating) return;
            if (!queue.length) {
                showDone();
                return;
            }
            currentDish = queue.shift();
            var card = $('fg-rate-card');
            card.classList.remove('fg-rate-fly-left', 'fg-rate-fly-right');
            card.style.transform = '';
            card.style.opacity = '1';

            $('fg-rate-name').textContent = currentDish.name;
            $('fg-rate-desc').textContent = currentDish.description;
            $('fg-rate-country').textContent = currentDish.country;
            var agg = communityAggregates[currentDish.wikiTitle];
            var score = communityScore(agg);
            $('fg-rate-comm').textContent = agg && agg.total > 0
                ? (score + '% love (' + agg.total + ' votes)')
                : 'no votes yet — be the first!';
            updateProgress();
            await attachDishImage(currentDish, $('fg-rate-image'), $('fg-rate-fallback'), 'Loading…');
        }

        function showDone() {
            currentDish = null;
            updateProgress();
            $('fg-rate-done-count').textContent = String(Object.keys(myVotes || {}).length);
            showScreen('fg-screen-rate-done');
        }

        function castVote(rating) {
            if (!currentDish || animating) return;
            var dish = currentDish;
            animating = true;
            var card = $('fg-rate-card');
            card.classList.add(rating === 1 ? 'fg-rate-fly-right' : 'fg-rate-fly-left');
            emitVote(dish.wikiTitle, rating);
            // Optimistically mark as voted so it doesn't reappear if queue gets rebuilt
            myVotes[dish.wikiTitle] = rating;
            setTimeout(function () {
                animating = false;
                showNext();
            }, 320);
        }

        async function start() {
            rebuildQueue();
            showScreen('fg-screen-rate');
            await showNext();
        }

        function wire() {
            $('fg-rate-smash').addEventListener('click', function () { castVote(1); });
            $('fg-rate-pass').addEventListener('click', function () { castVote(-1); });
            $('fg-rate-skip').addEventListener('click', function () {
                if (!currentDish || animating) return;
                // Skip without voting — push back to the end of queue
                queue.push(currentDish);
                currentDish = null;
                showNext();
            });
            $('fg-rate-done-again').addEventListener('click', function () {
                // Clear local "already voted" state for re-rating (votes stay on server)
                myVotes = {};
                start();
            });
            // Keyboard: ← pass, → smash
            document.addEventListener('keydown', function (e) {
                var screen = document.querySelector('.fg-screen.active');
                if (!screen || screen.id !== 'fg-screen-rate') return;
                if (e.key === 'ArrowRight') { e.preventDefault(); castVote(1); }
                else if (e.key === 'ArrowLeft') { e.preventDefault(); castVote(-1); }
            });
        }

        return { start: start, wire: wire };
    })();

    // =========================================================
    // MODE: SCRANDLE (Higher/Lower)
    //   variant: 'wiki' (Wikipedia pageviews) or 'community' (StrictHotel like-rate)
    // =========================================================
    var Scrandle = (function () {
        var variant = 'wiki';      // 'wiki' | 'community'
        var streak = 0;
        var best = parseInt(localStorage.getItem('fg-scrandle-best') || '0', 10) || 0;
        var leftDish = null, leftValue = null;
        var rightDish = null, rightValue = null;
        var pool = [];
        var busy = false;

        function variantLabel() {
            return variant === 'wiki' ? 'WIKI PAGEVIEWS / MONTH' : '% COMMUNITY LIKES';
        }
        function variantSub() {
            return variant === 'wiki'
                ? 'Higher monthly Wikipedia views wins.'
                : 'Higher StrictHotel like-rate wins. Tap the right card.';
        }
        function variantBadge() {
            return variant === 'wiki' ? '📚 WIKI MODE' : '👥 COMMUNITY MODE';
        }

        // Returns the metric to compare, or null when unavailable.
        async function fetchValue(dish) {
            if (variant === 'wiki') {
                return await window.FG_fetchDishViews(dish.wikiTitle);
            } else {
                var agg = communityAggregates[dish.wikiTitle];
                if (!agg || agg.total < 1) return null;
                return communityScore(agg);
            }
        }

        function pickDish(exclude) {
            for (var i = 0; i < 50; i++) {
                var d = pool[Math.floor(Math.random() * pool.length)];
                if (!exclude || d.wikiTitle !== exclude.wikiTitle) return d;
            }
            return pool[0];
        }

        function formatValue(v) {
            if (v == null) return '???';
            return variant === 'wiki' ? formatViews(v) + ' views/mo' : v + '% liked';
        }

        async function loadCard(slot, dish) {
            var prefix = slot === 'left' ? 'fg-sc-left' : 'fg-sc-right';
            $(prefix + '-name').textContent = dish.name;
            $(prefix + '-country').textContent = dish.country;
            // Image
            await attachDishImage(dish, $(prefix + '-image'), $(prefix + '-fallback'), 'Loading…');
        }

        function paintLeft() {
            $('fg-sc-left-value').textContent = formatValue(leftValue);
            $('fg-sc-left-value').classList.remove('fg-sc-value-hidden');
            $('fg-sc-left-value-label').textContent = variantLabel();
        }
        function hideRightValue() {
            $('fg-sc-right-value').textContent = '???';
            $('fg-sc-right-value').classList.add('fg-sc-value-hidden');
            $('fg-sc-right-value-label').textContent = variantLabel();
        }
        function revealRightValue() {
            $('fg-sc-right-value').textContent = formatValue(rightValue);
            $('fg-sc-right-value').classList.remove('fg-sc-value-hidden');
        }

        function updateScoreboard() {
            $('fg-sc-streak').textContent = String(streak);
            $('fg-sc-best').textContent = String(best);
            $('fg-sc-mode-badge').textContent = variantBadge();
            $('fg-sc-sub').textContent = variantSub();
        }

        async function freshPair() {
            // Reset state and pick two valid dishes (with non-null values)
            $('fg-sc-feedback').textContent = '';
            $('fg-sc-feedback').className = 'fg-sc-feedback';
            $('fg-sc-buttons').style.display = 'flex';
            $('fg-sc-next').style.display = 'none';
            busy = true;

            // Pick a left card with a known value
            var attempts = 0;
            while (attempts++ < 50) {
                leftDish = pickDish(null);
                leftValue = await fetchValue(leftDish);
                if (leftValue != null) break;
            }
            attempts = 0;
            while (attempts++ < 50) {
                rightDish = pickDish(leftDish);
                rightValue = await fetchValue(rightDish);
                if (rightValue != null) break;
            }

            if (leftValue == null || rightValue == null) {
                $('fg-sc-feedback').textContent = 'Not enough data for this mode yet — try Wiki mode or vote in Rate first.';
                $('fg-sc-feedback').className = 'fg-sc-feedback fg-sc-feedback-warn';
                $('fg-sc-buttons').style.display = 'none';
                busy = false;
                return;
            }

            await Promise.all([loadCard('left', leftDish), loadCard('right', rightDish)]);
            paintLeft();
            hideRightValue();
            busy = false;
        }

        async function guess(direction) {
            if (busy) return;
            busy = true;

            // Determine correctness. Ties count as correct.
            var correct;
            if (direction === 'higher') correct = rightValue >= leftValue;
            else correct = rightValue <= leftValue;

            revealRightValue();
            $('fg-sc-buttons').style.display = 'none';

            if (correct) {
                streak++;
                if (streak > best) {
                    best = streak;
                    localStorage.setItem('fg-scrandle-best', String(best));
                }
                $('fg-sc-feedback').textContent = '✓ CORRECT — streak ' + streak;
                $('fg-sc-feedback').className = 'fg-sc-feedback fg-sc-feedback-good';
                updateScoreboard();
                $('fg-sc-next').style.display = 'inline-block';
                busy = false;
            } else {
                $('fg-sc-feedback').textContent = '✗ WRONG — streak broken at ' + streak;
                $('fg-sc-feedback').className = 'fg-sc-feedback fg-sc-feedback-bad';
                setTimeout(showGameOver, 1400);
            }
        }

        async function advance() {
            // Right card becomes left card, then load a new right card
            leftDish = rightDish;
            leftValue = rightValue;
            var leftPrefix = 'fg-sc-left', rightPrefix = 'fg-sc-right';
            $(leftPrefix + '-name').textContent = leftDish.name;
            $(leftPrefix + '-country').textContent = leftDish.country;
            // Copy image from right to left
            var rImg = $(rightPrefix + '-image');
            var lImg = $(leftPrefix + '-image');
            if (rImg.src) {
                lImg.src = rImg.src;
                lImg.style.display = 'block';
                $(leftPrefix + '-fallback').style.display = 'none';
            } else {
                $(leftPrefix + '-fallback').innerHTML = $(rightPrefix + '-fallback').innerHTML;
                $(leftPrefix + '-fallback').style.display = 'flex';
                lImg.style.display = 'none';
            }
            paintLeft();

            // Pick a fresh right card
            busy = true;
            $('fg-sc-feedback').textContent = '';
            $('fg-sc-feedback').className = 'fg-sc-feedback';
            $('fg-sc-next').style.display = 'none';
            hideRightValue();

            var attempts = 0;
            while (attempts++ < 50) {
                rightDish = pickDish(leftDish);
                rightValue = await fetchValue(rightDish);
                if (rightValue != null) break;
            }
            if (rightValue == null) {
                $('fg-sc-feedback').textContent = 'Ran out of valid dishes — game over.';
                showGameOver();
                return;
            }
            await loadCard('right', rightDish);
            $('fg-sc-buttons').style.display = 'flex';
            busy = false;
        }

        function showGameOver() {
            $('fg-sc-over-streak').textContent = String(streak);
            $('fg-sc-over-best').textContent = String(best);
            $('fg-sc-over-mode').textContent = variantBadge();
            showScreen('fg-screen-scrandle-over');

            // Persist streak on server and refresh leaderboard
            if (socket && socket.connected) {
                socket.emit('food-scrandle-finish', { variant: variant, streak: streak });
            }
        }

        async function start(_variant) {
            variant = _variant === 'community' ? 'community' : 'wiki';
            streak = 0;
            pool = DISHES.slice();
            updateScoreboard();
            showScreen('fg-screen-scrandle');
            await freshPair();
        }

        function wire() {
            $('fg-sc-higher').addEventListener('click', function () { guess('higher'); });
            $('fg-sc-lower').addEventListener('click', function () { guess('lower'); });
            $('fg-sc-next').addEventListener('click', advance);
            $('fg-sc-over-again-wiki').addEventListener('click', function () { start('wiki'); });
            $('fg-sc-over-again-community').addEventListener('click', function () { start('community'); });
        }

        return { start: start, wire: wire };
    })();

    // =========================================================
    // Mode menu / shared wiring
    // =========================================================
    function goToMenu() {
        showScreen('fg-screen-menu');
    }

    function wireMenu() {
        $('fg-menu-classic').addEventListener('click', function () { Classic.start(); });
        $('fg-menu-rate').addEventListener('click', function () { Rate.start(); });
        $('fg-menu-scrandle-wiki').addEventListener('click', function () { Scrandle.start('wiki'); });
        $('fg-menu-scrandle-community').addEventListener('click', function () { Scrandle.start('community'); });

        // "Back to menu" buttons (present on every screen)
        var backs = document.querySelectorAll('[data-fg-menu]');
        for (var i = 0; i < backs.length; i++) {
            backs[i].addEventListener('click', goToMenu);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        connectSocket();
        wireMenu();
        Classic.wire();
        Rate.wire();
        Scrandle.wire();
        showScreen('fg-screen-menu');
    });
})();
