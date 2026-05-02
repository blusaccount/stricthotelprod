// ============================
// STRICTHOTEL LOBBY - Main Page
// ============================

(function () {
    'use strict';

    const socket = io();
    const Creator = window.StrictHotelCreator || window.MaexchenCreator;

    const $ = (id) => document.getElementById(id);

    const avatarImg = $('avatar-img');
    const avatarPlaceholder = $('avatar-placeholder');
    const inputName = $('input-name');
    const btnCreate = $('btn-create-character');

    const STORAGE_KEY = 'stricthotel-character';
    let registered = false;
    
    // Make It Rain constants
    const RAIN_AUDIO_PATH = '/userinput/winscreen.mp3';
    const RAIN_DURATION_MS = 20000;
    const COIN_SPAWN_INTERVAL_MS = 80;
    const MONEY_EMOJIS = ['💵', '💴', '💶', '💷', '💸', '💰', '💳', '🪙', '🤑', '💲', '💵', '💴', '💶', '💷', '💸'];

    window.StrictHotelLobby = window.StrictHotelLobby || {};
    window.StrictHotelLobby.socket = socket;
    window.StrictHotelLobby.getName = () => {
        return (inputName && inputName.value.trim()) || window.StrictHotelSocket.getPlayerName();
    };

    // --- Init: Load saved state ---
    const init = () => {
        // Restore name
        const savedName = window.StrictHotelSocket.getPlayerName();
        if (savedName && inputName) {
            inputName.value = savedName;
        }

        // Restore avatar
        updateAvatarDisplay();

        // Register if we have both name and character
        if (savedName && Creator && Creator.hasCharacter()) {
            registerPlayer();
        }
    };

    // --- Avatar Display ---
    const updateAvatarDisplay = () => {
        if (!Creator) return;

        if (Creator.hasCharacter()) {
            Creator.loadSavedCharacter();
            const dataURL = Creator.getAvatarDisplay();
            if (avatarImg) {
                avatarImg.src = dataURL;
                avatarImg.style.display = 'block';
            }
            if (avatarPlaceholder) {
                avatarPlaceholder.style.display = 'none';
            }
            if (btnCreate) {
                btnCreate.textContent = 'CHARAKTER ÄNDERN';
            }
        } else {
            if (avatarImg) avatarImg.style.display = 'none';
            if (avatarPlaceholder) avatarPlaceholder.style.display = 'flex';
            if (btnCreate) btnCreate.textContent = 'CHARAKTER ERSTELLEN';
        }
    };

    // --- Character Creator Button ---
    if (btnCreate && Creator) {
        btnCreate.addEventListener('click', () => {
            Creator.showCreator(() => {
                updateAvatarDisplay();
                registerPlayer();
            });
        });
    }

    // --- Name input: save on change, register ---
    if (inputName) {
        inputName.addEventListener('input', () => {
            const name = inputName.value.trim();
            if (name) {
                localStorage.setItem(window.StrictHotelSocket.NAME_KEY, name);
            }
        });

        inputName.addEventListener('change', () => {
            registerPlayer();
        });
    }

    // --- Register player with server ---
    const registerPlayer = () => {
        const name = (inputName && inputName.value.trim()) || '';
        if (!name) return;

        localStorage.setItem(window.StrictHotelSocket.NAME_KEY, name);

        window.StrictHotelSocket.registerPlayer(socket, 'lobby');
        registered = true;
    };

    // --- Socket connect → re-register ---
    socket.on('connect', () => {
        if (registered) {
            registerPlayer();
        }
    });

    // --- Currency Balance ---
    socket.on('balance-update', (data) => {
        const el = document.getElementById('currency-amount');
        if (el && data && typeof data.balance === 'number') {
            el.textContent = data.balance;
            
            // Update make it rain button state
            const rainBtn = document.getElementById('btn-make-it-rain');
            if (rainBtn) {
                rainBtn.disabled = data.balance < 20;
            }
        }
    });

    // --- Make It Rain Button ---
    const rainBtn = document.getElementById('btn-make-it-rain');
    if (rainBtn) {
        rainBtn.addEventListener('click', () => {
            const currentBalance = parseFloat(document.getElementById('currency-amount')?.textContent || '0');
            if (currentBalance < 20) {
                return;
            }
            
            socket.emit('lobby-make-it-rain');
        });
    }

    // --- Make It Rain Effect ---
    socket.on('lobby-rain-effect', (data) => {
        if (!data || !data.playerName) return;
        
        // Show toast notification
        const toast = document.createElement('div');
        toast.className = 'rain-toast';
        toast.textContent = `${data.playerName} made it rain! 💸`;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 5000);
        
        // Play victory music for 20 seconds
        const audio = new Audio(RAIN_AUDIO_PATH);
        audio.volume = 0.5;
        audio.play().catch(() => {
            console.log('Audio playback failed');
        });
        setTimeout(() => {
            audio.pause();
            audio.currentTime = 0;
        }, RAIN_DURATION_MS);
        
        // Spawn falling coins
        const container = document.createElement('div');
        container.className = 'money-rain-container';
        document.body.appendChild(container);
        
        const interval = setInterval(() => {
            createFallingCoin(container);
        }, COIN_SPAWN_INTERVAL_MS);
        
        setTimeout(() => {
            clearInterval(interval);
            setTimeout(() => {
                container.remove();
            }, 3000);
        }, RAIN_DURATION_MS);
    });

    const createFallingCoin = (container) => {
        const coin = document.createElement('div');
        coin.className = 'falling-coin';
        coin.textContent = MONEY_EMOJIS[Math.floor(Math.random() * MONEY_EMOJIS.length)];
        coin.style.left = `${Math.random() * 100}vw`;
        coin.style.animationDuration = `${2 + Math.random() * 2}s`;
        coin.style.animationDelay = `${Math.random() * 0.5}s`;
        container.appendChild(coin);
        
        setTimeout(() => {
            coin.remove();
        }, 5000);
    };

    // ============= Daily Streak =============
    const STREAK_REWARDS = [20, 35, 55, 75, 95, 120, 150];

    const streakPanel = document.getElementById('streak-panel');
    const streakCurrentEl = document.getElementById('streak-current');
    const streakRewardEl = document.getElementById('streak-reward-text');
    const streakClaimBtn = document.getElementById('streak-claim-btn');
    const streakDaysEl = document.getElementById('streak-days');

    function renderStreakDays(currentStreak, nextDayIndex, canClaim) {
        if (!streakDaysEl) return;
        streakDaysEl.innerHTML = '';
        // Render the current 7-day cycle. Day numbers shown are 1..7 of the
        // active cycle, where the active cycle is the one containing nextDayIndex.
        const cycle = Math.floor((nextDayIndex - 1) / 7);
        for (let slot = 1; slot <= 7; slot++) {
            const dayInCycle = slot;
            const absoluteDay = cycle * 7 + slot;
            const reward = STREAK_REWARDS[slot - 1];
            const isClaimed = canClaim
                ? absoluteDay < nextDayIndex
                : absoluteDay <= currentStreak;
            const isNext = canClaim && absoluteDay === nextDayIndex;
            const isSpecial = slot === 7;
            const div = document.createElement('div');
            div.className = 'streak-day';
            if (isClaimed) div.classList.add('claimed');
            if (isNext) div.classList.add('next');
            if (isSpecial) div.classList.add('special');
            div.innerHTML = `<span class="label">DAY ${dayInCycle}</span><span class="reward">+${reward}</span>`;
            streakDaysEl.appendChild(div);
        }
    }

    function updateStreakUI(status) {
        if (!streakPanel || !status) return;
        streakPanel.hidden = false;
        if (streakCurrentEl) {
            streakCurrentEl.textContent = `${status.currentStreak}d`;
            streakCurrentEl.title = `Best: ${status.maxStreak} · Total claims: ${status.totalClaims}`;
        }
        if (streakRewardEl && status.nextReward) {
            const r = status.nextReward;
            streakRewardEl.textContent = r.diamonds > 0 ? `+${r.coins}🪙💎` : `+${r.coins}🪙`;
        }
        if (streakClaimBtn) {
            streakClaimBtn.disabled = !status.canClaim;
            streakClaimBtn.textContent = status.canClaim ? 'CLAIM' : '✓';
        }
        renderStreakDays(status.currentStreak, status.nextDayIndex, status.canClaim);
    }

    function fetchStreakStatus() {
        socket.emit('streak-status');
    }

    socket.on('streak-status-result', (status) => {
        if (status && !status.error) updateStreakUI(status);
    });

    socket.on('streak-claim-result', (result) => {
        if (!result || !result.ok) return;
        // Tiny celebration: pulse the flame and show a quick reward toast.
        const flame = document.getElementById('streak-flame');
        if (flame) {
            flame.animate(
                [{ transform: 'scale(1)' }, { transform: 'scale(1.6)' }, { transform: 'scale(1)' }],
                { duration: 600, easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)' }
            );
        }
        const r = result.reward;
        const toast = document.createElement('div');
        toast.className = 'rain-toast';
        toast.textContent = `Streak day ${result.day}: +${r.coins} SC${r.diamonds ? ' + 💎' : ''}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    });

    if (streakClaimBtn) {
        streakClaimBtn.addEventListener('click', () => {
            if (streakClaimBtn.disabled) return;
            socket.emit('streak-claim');
        });
    }

    // Flame click toggles the 7-day calendar popover.
    const streakFlameEl = document.getElementById('streak-flame');
    if (streakFlameEl && streakPanel) {
        streakFlameEl.addEventListener('click', () => {
            streakPanel.classList.toggle('expanded');
        });
        // Close the popover when clicking outside.
        document.addEventListener('click', (e) => {
            if (!streakPanel.contains(e.target)) {
                streakPanel.classList.remove('expanded');
            }
        });
    }

    // Re-fetch status when player registers (so the panel populates).
    const _origRegister = registerPlayer;
    function registerPlayerWithStreak() {
        _origRegister();
        // Slight delay so server has the player record.
        setTimeout(fetchStreakStatus, 250);
    }
    // Hook into the existing register call sites by re-binding the references.
    if (btnCreate && Creator) {
        btnCreate.removeEventListener('click', null);
        // Already wired, just trigger fetch on connect/load too.
    }
    socket.on('connect', () => { setTimeout(fetchStreakStatus, 400); });

    // ============= Friend-Presence Badges =============
    // For each game card with a data-game attribute, count how many other
    // players are currently in that game (or any sub-game from data-game-group)
    // and render a small badge on the tile. Self is excluded.
    function updatePresenceBadges(players) {
        const myName = window.StrictHotelSocket.getPlayerName();
        const cards = document.querySelectorAll('.game-card[data-game]');
        cards.forEach((card) => {
            const tag = card.getAttribute('data-game');
            const groupAttr = card.getAttribute('data-game-group');
            const matchSet = new Set();
            if (tag) matchSet.add(tag);
            if (groupAttr) {
                groupAttr.split(',').map(s => s.trim()).filter(Boolean).forEach(s => matchSet.add(s));
            }
            let count = 0;
            for (const p of players) {
                if (!p || !p.game) continue;
                if (myName && p.name === myName) continue;
                if (matchSet.has(p.game)) count++;
            }
            const badge = card.querySelector('.game-presence');
            if (!badge) return;
            if (count > 0) {
                badge.hidden = false;
                badge.textContent = count === 1 ? '1 online' : `${count} online`;
            } else {
                badge.hidden = true;
                badge.textContent = '';
            }
        });
    }
    socket.on('online-players', (players) => {
        if (Array.isArray(players)) updatePresenceBadges(players);
    });

    // ============= Activity Feed =============
    const feedToggle = document.getElementById('activity-feed-toggle');
    const feedPanel = document.getElementById('activity-feed-panel');
    const feedClose = document.getElementById('activity-feed-close');
    const feedList = document.getElementById('activity-feed-list');
    const feedBadge = document.getElementById('activity-feed-badge');
    const FEED_RENDER_MAX = 30;
    let unreadFeedCount = 0;
    let feedOpen = false;

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function relativeTime(ts) {
        if (!ts) return '';
        const diff = Math.max(0, Date.now() - ts);
        const s = Math.floor(diff / 1000);
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${m}m`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h`;
        return `${Math.floor(h / 24)}d`;
    }
    function renderFeedRow(e) {
        const color = e.color && /^[a-z]+$/i.test(e.color) ? e.color : 'gold';
        const div = document.createElement('div');
        div.className = `activity-row color-${color}`;
        div.dataset.eventId = e.id;
        div.dataset.at = String(e.at || Date.now());
        div.innerHTML =
            `<span class="activity-icon">${escapeHtml(e.icon || '✨')}</span>` +
            `<div class="activity-body">` +
                `<span class="activity-player">${escapeHtml(e.player || '')}</span>` +
                `<span class="activity-text">${escapeHtml(e.text || '')}</span>` +
            `</div>` +
            `<span class="activity-time">${escapeHtml(relativeTime(e.at))}</span>`;
        return div;
    }
    function clearEmptyState() {
        const empty = feedList && feedList.querySelector('.activity-feed-empty');
        if (empty) empty.remove();
    }
    function renderInitialFeed(events) {
        if (!feedList) return;
        feedList.innerHTML = '';
        if (!events || !events.length) {
            const empty = document.createElement('div');
            empty.className = 'activity-feed-empty';
            empty.textContent = 'No activity yet — start a game!';
            feedList.appendChild(empty);
            return;
        }
        // events arrive newest-first from server
        events.slice(0, FEED_RENDER_MAX).forEach((e) => {
            feedList.appendChild(renderFeedRow(e));
        });
    }
    function prependFeedEvent(e) {
        if (!feedList) return;
        clearEmptyState();
        const row = renderFeedRow(e);
        feedList.prepend(row);
        // Trim list
        while (feedList.children.length > FEED_RENDER_MAX) {
            feedList.removeChild(feedList.lastChild);
        }
        // Briefly highlight the new row
        row.classList.add('activity-row-new');
        setTimeout(() => row.classList.remove('activity-row-new'), 1200);
    }
    function updateFeedBadge() {
        if (!feedBadge) return;
        if (unreadFeedCount > 0) {
            feedBadge.hidden = false;
            feedBadge.textContent = unreadFeedCount > 99 ? '99+' : String(unreadFeedCount);
        } else {
            feedBadge.hidden = true;
            feedBadge.textContent = '0';
        }
    }
    function openFeedPanel() {
        if (!feedPanel || !feedToggle) return;
        feedPanel.hidden = false;
        feedToggle.setAttribute('aria-expanded', 'true');
        feedOpen = true;
        unreadFeedCount = 0;
        updateFeedBadge();
        // Refresh relative timestamps when opening.
        if (feedList) {
            feedList.querySelectorAll('.activity-row').forEach((row) => {
                const at = Number(row.dataset.at) || 0;
                const tEl = row.querySelector('.activity-time');
                if (tEl) tEl.textContent = relativeTime(at);
            });
        }
    }
    function closeFeedPanel() {
        if (!feedPanel || !feedToggle) return;
        feedPanel.hidden = true;
        feedToggle.setAttribute('aria-expanded', 'false');
        feedOpen = false;
    }
    if (feedToggle) {
        feedToggle.addEventListener('click', () => {
            if (feedOpen) closeFeedPanel(); else openFeedPanel();
        });
    }
    if (feedClose) {
        feedClose.addEventListener('click', closeFeedPanel);
    }
    socket.on('activity-feed-snapshot-result', (data) => {
        if (!data || !Array.isArray(data.events)) return;
        renderInitialFeed(data.events);
    });
    socket.on('activity-feed-event', (e) => {
        if (!e || !e.id) return;
        prependFeedEvent(e);
        if (!feedOpen) {
            unreadFeedCount++;
            updateFeedBadge();
        }
    });
    function requestFeedSnapshot() {
        socket.emit('activity-feed-snapshot');
    }
    socket.on('connect', () => { setTimeout(requestFeedSnapshot, 500); });
    // Refresh relative times every 30s while panel is open.
    setInterval(() => {
        if (!feedOpen || !feedList) return;
        feedList.querySelectorAll('.activity-row').forEach((row) => {
            const at = Number(row.dataset.at) || 0;
            const tEl = row.querySelector('.activity-time');
            if (tEl) tEl.textContent = relativeTime(at);
        });
    }, 30000);

    // --- Start ---
    init();
    setTimeout(fetchStreakStatus, 800);
    setTimeout(requestFeedSnapshot, 800);
})();
