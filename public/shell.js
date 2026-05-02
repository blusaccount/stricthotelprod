// ============================================================================
// SHELL ROUTER — sidebar nav + iframe app loader + History API.
//
// Responsibilities:
//   - Listen on sidebar [data-shell-link] clicks; load the corresponding app
//     into the main iframe (with ?embed=1 so the server middleware serves
//     the bare page) and pushState the path for clean URLs.
//   - On initial load, parse location.pathname and either show the home
//     view (path === '/') or load the matching iframe.
//   - On popstate (browser back/forward), reload the right iframe.
//   - Highlight the active sidebar item.
//   - Toggle sidebar / right rail on mobile.
//
// Runs BEFORE lobby.js so the home-view-only chrome is in place before the
// lobby script binds its listeners.
// ============================================================================

(function () {
    'use strict';

    const HOME_PATH = '/';
    const main = document.getElementById('shell-main');
    const frame = document.getElementById('shell-frame');
    const home = document.getElementById('shell-home');
    const sidebar = document.getElementById('shell-sidebar');
    const rail = document.getElementById('shell-rail');
    const menuToggle = document.getElementById('shell-menu-toggle');
    const railToggle = document.getElementById('shell-rail-toggle');

    if (!main || !frame || !home) return;

    // Build a path → sidebar item map for quick lookup.
    const navItems = Array.from(document.querySelectorAll('.shell-nav-item[data-shell-link]'));

    function normalizePath(p) {
        if (!p) return HOME_PATH;
        // Strip query/hash for matching purposes.
        const i = p.search(/[?#]/);
        if (i !== -1) p = p.slice(0, i);
        // Trailing slash normalization: keep one if path is a directory route.
        return p || HOME_PATH;
    }

    // Extract a "game token" from a path so casino sub-games (plinko, crash,
    // blackjack, roulette, maexchen, strictly7s) can map back to the casino
    // sidebar entry via its data-game-group attribute.
    function gameTokenFromPath(p) {
        const m = p.match(/^\/games\/([^\/?#]+)/);
        if (m) return m[1];
        if (p === '/shop.html') return 'shop';
        if (p === '/achievements.html') return 'achievements';
        return null;
    }

    function matchNavItem(path) {
        const p = normalizePath(path);
        let exact = null;
        let prefix = null;
        let groupHit = null;
        const token = gameTokenFromPath(p);
        for (const item of navItems) {
            const target = normalizePath(item.getAttribute('data-shell-link'));
            if (target === p) { exact = item; break; }
            if (target !== HOME_PATH && p.startsWith(target)) {
                if (!prefix || target.length > prefix.getAttribute('data-shell-link').length) {
                    prefix = item;
                }
            }
            // data-game-group-based match: sidebar entry with a group string
            // matches any sub-game in that group (used for Casino).
            if (token && !groupHit) {
                const group = (item.getAttribute('data-game-group') || '')
                    .split(',').map(s => s.trim()).filter(Boolean);
                if (group.includes(token)) groupHit = item;
            }
        }
        return exact || prefix || groupHit;
    }

    function setActiveItem(item) {
        navItems.forEach((el) => el.classList.toggle('active', el === item));
    }

    function showHome() {
        main.dataset.mode = 'home';
        frame.removeAttribute('src');
        frame.hidden = true;
        home.style.display = '';
    }

    function loadApp(path, item) {
        const p = normalizePath(path);
        if (p === HOME_PATH) { showHome(); return; }
        main.dataset.mode = 'frame';
        home.style.display = 'none';
        frame.hidden = false;
        // Add ?embed=1 so the server middleware serves the bare page.
        const sep = p.includes('?') ? '&' : '?';
        frame.src = p + sep + 'embed=1';
        // Scroll iframe area to top
        try { main.scrollTop = 0; } catch (_) {}
        // Active highlight
        const matched = item || matchNavItem(p);
        if (matched) setActiveItem(matched);
    }

    function navigate(path, opts) {
        const p = normalizePath(path);
        const isSame = window.location.pathname === p;
        const item = matchNavItem(p);
        if (p === HOME_PATH) {
            setActiveItem(item || navItems.find(i => i.classList.contains('shell-nav-home')));
            showHome();
        } else {
            loadApp(p, item);
        }
        if (!opts || !opts.replace) {
            // Don't push duplicate states (avoids stacking history when
            // clicking the same item).
            if (!isSame) {
                history.pushState({ path: p }, '', p);
            } else {
                history.replaceState({ path: p }, '', p);
            }
        } else {
            history.replaceState({ path: p }, '', p);
        }
        // Close mobile drawers after a navigation.
        if (sidebar) sidebar.classList.remove('open');
    }

    // Switch sound on nav click (mirrors the legacy game-card UX).
    let switchSound = null;
    function playSwitchSound() {
        try {
            if (!switchSound) {
                switchSound = new Audio('/userinput/switch.mp3');
                switchSound.volume = 0.25;
                switchSound.preload = 'auto';
            }
            switchSound.currentTime = 0;
            switchSound.play().catch(() => {});
        } catch (_) {}
    }

    // Click handler — delegate from the document so dynamically added items
    // also work, and so we capture nav-item clicks on their inner spans too.
    document.addEventListener('click', (e) => {
        const link = e.target.closest('[data-shell-link]');
        if (!link) return;
        // Let cmd/ctrl-click open in new tab as a normal navigation.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        playSwitchSound();
        navigate(link.getAttribute('data-shell-link'));
    });

    // Browser back/forward.
    window.addEventListener('popstate', (e) => {
        const p = (e.state && e.state.path) || window.location.pathname;
        navigate(p, { replace: true });
    });

    // Mobile toggles.
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
            if (rail) rail.classList.remove('open');
        });
    }
    if (railToggle && rail) {
        railToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            rail.classList.toggle('open');
            if (sidebar) sidebar.classList.remove('open');
        });
    }
    // Click-outside to close drawers on mobile.
    document.addEventListener('click', (e) => {
        if (window.innerWidth > 960) return;
        if (sidebar && sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== menuToggle) {
            sidebar.classList.remove('open');
        }
        if (rail && rail.classList.contains('open') && !rail.contains(e.target) && e.target !== railToggle) {
            rail.classList.remove('open');
        }
    });

    // Listen for navigation messages from inside the iframe.
    window.addEventListener('message', (e) => {
        const msg = e.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'sh-navigate' && typeof msg.path === 'string') {
            navigate(msg.path);
        }
        // Iframe just finished loading at a given path. Sync URL bar +
        // sidebar highlight. Don't reload the iframe — it's already there.
        if (msg.type === 'sh-iframe-loaded' && typeof msg.path === 'string') {
            const p = normalizePath(msg.path);
            if (p === HOME_PATH) return;
            const item = matchNavItem(p);
            if (item) setActiveItem(item);
            if (window.location.pathname !== p) {
                history.replaceState({ path: p }, '', p);
            }
        }
    });

    // ----- Initial dispatch ----- //
    const initialPath = normalizePath(window.location.pathname);
    if (initialPath === HOME_PATH) {
        const homeItem = navItems.find(i => i.classList.contains('shell-nav-home'));
        if (homeItem) setActiveItem(homeItem);
        showHome();
        history.replaceState({ path: HOME_PATH }, '', HOME_PATH);
    } else {
        navigate(initialPath, { replace: true });
    }

    // Public API for other scripts.
    window.StrictHotelShell = {
        navigate,
        getCurrentPath: () => normalizePath(window.location.pathname)
    };
})();
