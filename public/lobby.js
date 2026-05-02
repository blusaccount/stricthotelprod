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

    // --- Start ---
    init();
    setTimeout(fetchStreakStatus, 800);
})();
