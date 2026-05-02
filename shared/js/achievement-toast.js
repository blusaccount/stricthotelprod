// Shared achievement-unlocked toast. Drop into any page that has
// /socket.io/socket.io.js + /shared/js/socket-init.js. The page's own
// `io()` socket is reused via window.__strictAchievementSocket if set,
// otherwise this script opens its own connection.
//
// Toasts stack in the upper-right corner.

(() => {
    'use strict';
    if (window.__strictAchievementToastInstalled) return;
    window.__strictAchievementToastInstalled = true;
    // Inside the shell iframe, the parent shell already shows the toast.
    // Skip here to avoid double-rendering.
    if (window.IS_SHELL_IFRAME) return;

    // Inject CSS once.
    const css = `
        .ach-toast-container {
            position: fixed;
            top: 18px;
            right: 18px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            z-index: 99999;
            pointer-events: none;
        }
        .ach-toast {
            background: linear-gradient(180deg, rgba(20, 12, 32, 0.96) 0%, rgba(8, 5, 14, 0.96) 100%);
            border: 2px solid #ffcc33;
            box-shadow: 0 0 24px rgba(255, 204, 51, 0.5), 0 6px 18px rgba(0,0,0,0.5);
            padding: 12px 16px;
            display: flex;
            gap: 12px;
            align-items: center;
            min-width: 280px;
            max-width: 360px;
            font-family: 'Press Start 2P', monospace;
            font-size: 10px;
            color: #f6f6f6;
            animation: achToastIn 0.4s cubic-bezier(0.2, 1.4, 0.4, 1);
            position: relative;
            overflow: hidden;
        }
        .ach-toast.tier-bronze   { border-color: #b87333; }
        .ach-toast.tier-silver   { border-color: #c0c0c0; }
        .ach-toast.tier-platinum { border-color: #ff3ea5; box-shadow: 0 0 24px rgba(255, 62, 165, 0.55), 0 6px 18px rgba(0,0,0,0.5); }
        .ach-toast::before {
            content: "";
            position: absolute;
            inset: 0;
            background: radial-gradient(circle at 20% 50%, rgba(255, 204, 51, 0.18) 0%, transparent 60%);
            pointer-events: none;
        }
        .ach-toast > * { position: relative; z-index: 1; }
        .ach-toast .icon {
            font-size: 2.2rem;
            filter: drop-shadow(0 0 8px rgba(255, 204, 51, 0.7));
        }
        .ach-toast .body { display: flex; flex-direction: column; gap: 4px; flex: 1; }
        .ach-toast .label {
            font-size: 7px;
            letter-spacing: 2px;
            color: #9a8db0;
        }
        .ach-toast .title {
            font-size: 11px;
            color: #ffcc33;
            text-shadow: 0 0 8px rgba(255, 204, 51, 0.5);
            letter-spacing: 1px;
        }
        .ach-toast.tier-platinum .title { color: #ff3ea5; text-shadow: 0 0 8px rgba(255, 62, 165, 0.6); }
        .ach-toast .reward {
            font-size: 8px;
            color: #7cff8b;
            letter-spacing: 1px;
            margin-top: 2px;
        }
        @keyframes achToastIn {
            0%   { transform: translateX(120%); opacity: 0; }
            100% { transform: translateX(0);    opacity: 1; }
        }
        @keyframes achToastOut {
            0%   { transform: translateX(0);    opacity: 1; }
            100% { transform: translateX(120%); opacity: 0; }
        }
        .ach-toast.fading { animation: achToastOut 0.4s ease-in forwards; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    let container = null;
    function ensureContainer() {
        if (container) return container;
        container = document.createElement('div');
        container.className = 'ach-toast-container';
        document.body.appendChild(container);
        return container;
    }

    function rewardText(reward) {
        if (!reward) return '';
        const parts = [];
        if (reward.coins) parts.push(`+${reward.coins} SC`);
        if (reward.diamonds) parts.push(`+${reward.diamonds} 💎`);
        return parts.join(' · ');
    }

    function showUnlockToast(unlock) {
        const c = ensureContainer();
        const toast = document.createElement('div');
        toast.className = `ach-toast tier-${unlock.tier || 'silver'}`;
        const reward = unlock.reward || {};
        toast.innerHTML = `
            <div class="icon">${unlock.icon || '🏅'}</div>
            <div class="body">
                <div class="label">ACHIEVEMENT UNLOCKED</div>
                <div class="title">${(unlock.title || '').toUpperCase()}</div>
                <div class="reward">${rewardText(reward)}</div>
            </div>
        `;
        c.appendChild(toast);
        setTimeout(() => toast.classList.add('fading'), 5000);
        setTimeout(() => toast.remove(), 5500);
    }

    function attachToSocket(sock) {
        if (!sock) return;
        sock.on('achievement-unlocked', (data) => {
            if (!data || !Array.isArray(data.unlocks)) return;
            data.unlocks.forEach((u, i) => setTimeout(() => showUnlockToast(u), i * 250));
        });
    }

    // Try to find a socket to attach to. Pages with their own `io()` should
    // expose it on window.StrictHotelSocket via socket-init helpers; else we
    // open our own.
    function initialize() {
        // Look for an existing socket already established by another script.
        const existing = window.__strictAchievementSocket
            || (window.StrictHotelLobby && window.StrictHotelLobby.socket);
        if (existing) {
            attachToSocket(existing);
            return;
        }
        if (typeof window.io !== 'function') {
            // socket.io not loaded — nothing to do.
            return;
        }
        const sock = window.io();
        window.__strictAchievementSocket = sock;
        attachToSocket(sock);
        // We need to register so the server knows who we are; the page's own
        // socket-init script will do this for its primary socket. We piggy-
        // back on the existing registration by NOT registering with our own
        // — we just listen. The achievement-unlocked event is sent to ALL
        // sockets matching the player's name, so any connected socket
        // receives it (the primary page socket is already registered).
        // To make this work, the helper must be loaded AFTER the page's
        // primary socket has registered the player. The handler emits to
        // every socket whose onlinePlayers entry matches the name, so this
        // secondary socket only receives events if registered too. To avoid
        // missing toasts, we attempt to share the page's socket above.
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
