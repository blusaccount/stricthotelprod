// ============================================================
// Food Guessr — Game Logic
// 3 rounds. Each round: a dish photo from Wikipedia.
// Player has 3 lives. Type a country (autocomplete) → submit.
// Each wrong guess: hot/cold feedback + a new hint revealed.
// Scoring: 1000 / 600 / 300 / 0 by lives remaining when right.
// ============================================================

(function () {
    'use strict';

    var COUNTRIES = window.FG_COUNTRIES;
    var DISHES = window.FG_DISHES;
    var ROUNDS_PER_GAME = 3;
    var MAX_LIVES = 3;
    var SCORE_BY_LIVES = { 3: 1000, 2: 600, 1: 300, 0: 0 };

    // ─── State ───
    var rounds = [];       // currently selected 3 dishes
    var roundIdx = 0;
    var lives = MAX_LIVES;
    var totalScore = 0;
    var roundScores = [];
    var currentDish = null;
    var hintsRevealed = 0; // 0 = none, 1 = name+desc, 2 = +continent, 3 = +region
    var guessedCountries = [];
    var roundActive = false;

    // ─── DOM ───
    function $(id) { return document.getElementById(id); }

    // ─── Helpers ───
    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, function (c) {
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

    // ─── Distance / Hot-Cold ───
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
        var dir = dirs[Math.round(brng / 45) % 8];
        return { dir: dir, arrow: arrows[dir] };
    }

    // ─── Round Setup ───
    function pickRounds() {
        var pool = shuffle(DISHES);
        return pool.slice(0, ROUNDS_PER_GAME);
    }

    async function startGame() {
        rounds = pickRounds();
        roundIdx = 0;
        totalScore = 0;
        roundScores = [];
        await startRound();
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

        // Loading image
        var img = $('fg-dish-image');
        var fallback = $('fg-dish-fallback');
        img.style.display = 'none';
        img.removeAttribute('src');
        fallback.style.display = 'flex';
        fallback.innerHTML = '<div class="fg-fallback-emoji">' + currentDish.emoji + '</div>' +
                             '<div class="fg-fallback-loading">Loading photo from Wikipedia…</div>';

        showScreen('fg-screen-round');
        $('fg-input').focus();

        // Async image load via Wikipedia REST API
        var src = await window.FG_fetchDishImage(currentDish.wikiTitle);
        if (src) {
            img.onload = function () {
                img.style.display = 'block';
                fallback.style.display = 'none';
            };
            img.onerror = function () {
                img.style.display = 'none';
                fallback.style.display = 'flex';
                fallback.innerHTML = '<div class="fg-fallback-emoji">' + currentDish.emoji + '</div>' +
                                     '<div class="fg-fallback-loading">Photo unavailable</div>';
            };
            img.src = src;
        } else {
            fallback.innerHTML = '<div class="fg-fallback-emoji">' + currentDish.emoji + '</div>' +
                                 '<div class="fg-fallback-loading">Photo unavailable — guess from the dish name</div>';
            hintsRevealed = Math.max(hintsRevealed, 1); // unlock name if image missing
            renderHints();
        }
    }

    // ─── Lives & Hints UI ───
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

    // ─── Autocomplete ───
    function renderSuggestions(query) {
        var box = $('fg-suggestions');
        var q = String(query || '').trim().toLowerCase();
        if (!q) {
            box.innerHTML = '';
            box.classList.remove('open');
            return;
        }
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

    // ─── Submit Guess ───
    function submitGuess() {
        if (!roundActive) return;
        var raw = String($('fg-input').value || '').trim();
        if (!raw) return;
        var guess = window.FG_findCountry(raw);
        if (!guess) {
            flashInputError('Pick a country from the suggestions');
            return;
        }
        if (guessedCountries.indexOf(guess.name) !== -1) {
            flashInputError('Already tried that one');
            return;
        }
        guessedCountries.push(guess.name);

        var target = window.FG_findCountry(currentDish.country);
        if (!target) { console.error('Target country not found:', currentDish.country); return; }

        if (guess.name === target.name) {
            // Correct
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

        // Wrong
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
            // Reveal next hint
            hintsRevealed = Math.min(3, hintsRevealed + 1);
            renderHints();
            $('fg-input').focus();
        }
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

    // ─── Round / Game End ───
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
        var btn = $('fg-btn-next');
        btn.textContent = (roundIdx + 1 >= ROUNDS_PER_GAME) ? 'SEE FINAL SCORE ▶' : 'NEXT ROUND ▶';
        showScreen('fg-screen-result');
    }

    function nextRound() {
        roundIdx += 1;
        if (roundIdx >= ROUNDS_PER_GAME) {
            showFinalScore();
        } else {
            startRound();
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

        var max3 = 3000;
        $('fg-final-max').textContent = '/ ' + max3;

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
    }

    // ─── Wiring ───
    document.addEventListener('DOMContentLoaded', function () {
        // Start
        $('fg-btn-start').addEventListener('click', function () { startGame(); });
        $('fg-btn-play-again').addEventListener('click', function () { startGame(); });
        $('fg-btn-next').addEventListener('click', function () { nextRound(); });
        $('fg-btn-submit').addEventListener('click', submitGuess);

        // Input + autocomplete
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

        showScreen('fg-screen-start');
    });
})();
