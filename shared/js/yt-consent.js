// ============== YOUTUBE CONSENT GATE ==============
// GDPR: embedding the YouTube IFrame API transmits the visitor's IP address
// and sets cookies on a Google domain. That needs prior, informed consent.
// Every place that injects https://www.youtube.com/iframe_api must await
// StrictConsent.youtube() first.
//
// Consent is stored in localStorage (not a cookie) under 'consent-youtube':
//   'granted'  -> load without asking again
//   'denied'   -> the visitor said no in this browser; ask again next time
//                 they actively try to start a video
// Nothing is stored until the visitor clicks a button.

(function () {
    'use strict';

    var STORAGE_KEY = 'consent-youtube';
    var apiPromise = null;
    var dialogPromise = null;

    function stored() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
    }

    function remember(value) {
        try { localStorage.setItem(STORAGE_KEY, value); } catch (_) {}
    }

    function forget() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    }

    // --- The dialog ---------------------------------------------------------
    function injectStyles() {
        if (document.getElementById('consent-styles')) return;
        var css = document.createElement('style');
        css.id = 'consent-styles';
        css.textContent = [
            '.consent-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.82);',
            'display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;}',
            '.consent-card{background:#12121c;border:2px solid #3effe1;max-width:520px;width:100%;',
            'padding:24px;color:#e8e8f0;font-family:inherit;line-height:1.6;box-shadow:0 0 40px rgba(62,255,225,0.25);}',
            '.consent-card h2{margin:0 0 12px;font-size:1rem;color:#3effe1;letter-spacing:1px;}',
            '.consent-card p{margin:0 0 12px;font-size:0.82rem;}',
            '.consent-card a{color:#3effe1;}',
            '.consent-remember{display:flex;align-items:center;gap:8px;font-size:0.78rem;margin:14px 0 18px;cursor:pointer;}',
            '.consent-actions{display:flex;gap:10px;flex-wrap:wrap;}',
            '.consent-btn{flex:1;min-width:150px;padding:11px 14px;border:2px solid #3effe1;background:transparent;',
            'color:#3effe1;cursor:pointer;font-family:inherit;font-size:0.78rem;letter-spacing:0.5px;}',
            '.consent-btn:hover{background:rgba(62,255,225,0.14);}',
            '.consent-btn.primary{background:#3effe1;color:#0a0a12;font-weight:bold;}',
            '.consent-btn.primary:hover{background:#7dffec;}',
            '.consent-btn.ghost{border-color:#555;color:#aaa;}',
            '.consent-btn.ghost:hover{background:rgba(255,255,255,0.06);}'
        ].join('');
        document.head.appendChild(css);
    }

    function ask() {
        if (dialogPromise) return dialogPromise;

        dialogPromise = new Promise(function (resolve) {
            injectStyles();

            var backdrop = document.createElement('div');
            backdrop.className = 'consent-backdrop';
            backdrop.setAttribute('role', 'dialog');
            backdrop.setAttribute('aria-modal', 'true');
            backdrop.innerHTML = [
                '<div class="consent-card">',
                '  <h2>YouTube laden?</h2>',
                '  <p>Um das Video abzuspielen, wird der YouTube-Player von Google geladen.',
                '     Dabei werden deine IP-Adresse und Geraeteinformationen an Google uebertragen',
                '     und Google kann Cookies setzen. Das passiert erst, wenn du zustimmst.</p>',
                '  <p>Mehr dazu in unserer <a href="/datenschutz.html" target="_blank" rel="noopener">Datenschutzerklaerung</a>.</p>',
                '  <label class="consent-remember">',
                '    <input type="checkbox" id="consent-remember" checked>',
                '    <span>Entscheidung in diesem Browser merken</span>',
                '  </label>',
                '  <div class="consent-actions">',
                '    <button class="consent-btn primary" id="consent-accept" type="button">YouTube laden</button>',
                '    <button class="consent-btn ghost" id="consent-decline" type="button">Nein danke</button>',
                '  </div>',
                '</div>'
            ].join('\n');

            document.body.appendChild(backdrop);

            var rememberBox = backdrop.querySelector('#consent-remember');

            function close(granted) {
                if (rememberBox && rememberBox.checked) {
                    remember(granted ? 'granted' : 'denied');
                }
                backdrop.remove();
                dialogPromise = null;
                resolve(granted);
            }

            backdrop.querySelector('#consent-accept').addEventListener('click', function () { close(true); });
            backdrop.querySelector('#consent-decline').addEventListener('click', function () { close(false); });
            backdrop.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') close(false);
            });
            backdrop.querySelector('#consent-accept').focus();
        });

        return dialogPromise;
    }

    // --- Public API ---------------------------------------------------------

    // Resolves once the YouTube IFrame API is loaded and window.YT is usable.
    // Rejects with Error('consent-denied') if the visitor says no, so callers
    // can keep their own UI in a sane state.
    function youtube() {
        if (stored() === 'granted') return loadApi();

        return ask().then(function (granted) {
            if (!granted) throw new Error('consent-denied');
            return loadApi();
        });
    }

    function loadApi() {
        if (window.YT && window.YT.Player) return Promise.resolve();
        if (apiPromise) return apiPromise;

        apiPromise = new Promise(function (resolve) {
            var previous = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = function () {
                if (typeof previous === 'function') previous();
                resolve();
            };
            var existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
            if (!existing) {
                var tag = document.createElement('script');
                tag.src = 'https://www.youtube.com/iframe_api';
                document.head.appendChild(tag);
            }
        });
        return apiPromise;
    }

    window.StrictConsent = {
        youtube: youtube,
        hasYouTubeConsent: function () { return stored() === 'granted'; },
        revokeYouTube: forget
    };
})();
