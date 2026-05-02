// ============================================================================
// IFRAME HELPER — included on every game page.
//
// Detects whether the page is being rendered inside the StrictHotel shell.
// When it is:
//   - Sets window.IS_SHELL_IFRAME = true (other scripts can branch on this).
//   - Hides redundant back-to-lobby links / home buttons (the sidebar is
//     the navigation now).
//   - Tags <html> with [data-shell-iframe] so CSS can react if needed.
//
// Detection is robust: ?embed=1 in URL OR window.parent !== window. We need
// both because (a) a deep-link load served by the shell middleware mounts
// the page with ?embed=1 even though the iframe-shell pattern relies on
// frame nesting too; (b) some games are reached via in-iframe navigation
// where the URL might not carry ?embed=1.
// ============================================================================

(function () {
    'use strict';

    var inIframe = false;
    try { inIframe = window.parent && window.parent !== window; } catch (e) { inIframe = true; }
    var hasEmbedParam = false;
    try {
        hasEmbedParam = new URLSearchParams(window.location.search).get('embed') === '1';
    } catch (e) {}

    var isShell = inIframe || hasEmbedParam;
    window.IS_SHELL_IFRAME = isShell;

    if (!isShell) return;

    document.documentElement.setAttribute('data-shell-iframe', '1');

    // Hide any of the various "home / back to lobby" controls each page bakes
    // into its header. Run on DOM ready (or immediately if already loaded).
    function hideHomeControls() {
        var selectors = [
            '.back-link',
            '#home-btn',
            '.brain-home',
            '.btn-home',
            '#test-back'
        ];
        selectors.forEach(function (sel) {
            document.querySelectorAll(sel).forEach(function (el) {
                el.style.display = 'none';
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hideHomeControls);
    } else {
        hideHomeControls();
    }

    // On every full iframe load, post the current path up to the parent shell
    // so it can update its URL bar + sidebar highlight. We send our pathname
    // (no ?embed=1) so the parent's pushState produces clean URLs.
    function postPathToShell() {
        try {
            if (!window.parent || window.parent === window) return;
            var path = window.location.pathname || '/';
            window.parent.postMessage({ type: 'sh-iframe-loaded', path: path }, '*');
        } catch (_) {}
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', postPathToShell);
    } else {
        postPathToShell();
    }
})();
