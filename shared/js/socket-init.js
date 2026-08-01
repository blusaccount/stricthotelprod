// ============================
// STRICTHOTEL - Socket.IO Initialization Helpers
// ============================
// Shared utilities for Socket.IO connection, player registration, and common helpers.
// Use via window.StrictHotelSocket global (vanilla JS, no ES modules).

(function () {
    'use strict';

    // Storage keys
    var NAME_KEY = 'stricthotel-name';
    var CHAR_KEY = 'stricthotel-character';
    var OWNER_TOKEN_KEY = 'stricthotel-owner-token';

    // ============================
    // DISCORD ACTIVITY BOOTSTRAP
    // ============================
    // Discord always appends ?frame_id=... to the URL it loads an Activity
    // at (see discord.html, which handles the initial OAuth handshake and
    // sets this sessionStorage flag before redirecting back into the app).
    // When active, every Socket.IO connection in the app must be routed
    // through Discord's fixed /.proxy/ alias for the request to reach our
    // backend at all — patching the shared `io` global here covers every
    // game's own `io()` call site without editing each one individually.
    // A complete no-op outside Discord.
    var IN_DISCORD_ACTIVITY = (function () {
        try {
            if (/(?:^|[?&])frame_id=/.test(location.search)) return true;
            return sessionStorage.getItem('sh-discord-activity') === '1';
        } catch (e) { return false; }
    })();

    if (IN_DISCORD_ACTIVITY) {
        try { sessionStorage.setItem('sh-discord-activity', '1'); } catch (e) {}
        // document.write from a synchronously-executing classic script still
        // inserts into the parse stream ahead of later <script> tags (e.g.
        // the game's own script that calls io()) — that ordering is why this
        // has to be document.write rather than a deferred/async load.
        document.write('<script src="/vendor/discord-embedded-app-sdk.js"><\/script>');
        document.write(
            '<script>' +
            // Socket.IO: every game constructs its own socket via io() with
            // no path override, so the default handshake path needs the
            // /.proxy/ alias injected centrally.
            'if (typeof window.io === "function") {' +
            'var shOrigIo = window.io;' +
            'window.io = function (uri, opts) {' +
            'if (typeof uri === "object" && uri !== null) { opts = uri; uri = undefined; }' +
            'opts = opts || {};' +
            'if (!opts.path) opts.path = "/.proxy/socket.io/";' +
            'return uri !== undefined ? shOrigIo(uri, opts) : shOrigIo(opts);' +
            '};' +
            '}' +
            // fetch: several games call our own REST endpoints (stocks
            // quotes, turkish completion, watch party) with plain relative
            // paths. Every fetch in this app targets our own origin, so a
            // blanket same-origin rewrite is safe — external calls, if any
            // are ever added, would need to bypass this explicitly.
            'if (typeof window.fetch === "function") {' +
            'var shOrigFetch = window.fetch;' +
            'window.fetch = function (input, init) {' +
            'try {' +
            'if (typeof input === "string" && input.charAt(0) === "/" && input.indexOf("/.proxy/") !== 0) {' +
            'input = "/.proxy" + input;' +
            '} else if (input && input.url && new URL(input.url, location.href).origin === location.origin) {' +
            'var p = new URL(input.url, location.href);' +
            'if (p.pathname.indexOf("/.proxy/") !== 0) {' +
            'input = new Request("/.proxy" + p.pathname + p.search, input);' +
            '}' +
            '}' +
            '} catch (e) {}' +
            'return shOrigFetch(input, init);' +
            '};' +
            '}' +
            '<\/script>'
        );
    }

    window.StrictHotelDiscord = {
        isActivity: IN_DISCORD_ACTIVITY,
        // Prefixes a same-origin API path for JS-initiated fetch/XHR calls,
        // which need the /.proxy/ alias same as Socket.IO does above. Not
        // needed for <script src>/<link href> — those load through the
        // page's own root mapping already.
        apiPath: function (path) {
            return IN_DISCORD_ACTIVITY ? '/.proxy' + path : path;
        }
    };

    /**
     * Get (or create) a long-lived owner token for this browser. The server
     * uses it as a Trust-On-First-Use guard so a name claimed from this
     * browser can't be hijacked by another browser later.
     */
    function getOwnerToken() {
        var t = localStorage.getItem(OWNER_TOKEN_KEY);
        if (t && /^[A-Za-z0-9_-]{8,128}$/.test(t)) return t;
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            t = window.crypto.randomUUID().replace(/-/g, '');
        } else {
            // RFC 4122-ish fallback for older runtimes.
            var bytes = new Uint8Array(16);
            (window.crypto || window.msCrypto).getRandomValues(bytes);
            t = Array.from(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
        }
        localStorage.setItem(OWNER_TOKEN_KEY, t);
        return t;
    }

    /**
     * Get the player name from localStorage
     * @returns {string} Player name or empty string
     */
    function getPlayerName() {
        return localStorage.getItem(NAME_KEY) || '';
    }

    /**
     * Get character data from localStorage or Creator
     * @returns {object|null} Character object or null
     */
    function getCharacterData() {
        var Creator = window.MaexchenCreator || window.StrictHotelCreator;
        if (Creator && Creator.hasCharacter()) {
            return Creator.getCharacter();
        }
        
        // Fallback: try to parse from localStorage
        var charJSON = localStorage.getItem(CHAR_KEY);
        if (charJSON) {
            try {
                var parsed = JSON.parse(charJSON);
                // localStorage stores raw pixel grid (2D array); wrap it into
                // a proper character object with a dataURL so the server receives
                // both the pixel data and a renderable image.
                if (Array.isArray(parsed)) {
                    var dataURL = renderPixelGridToDataURL(parsed);
                    return { pixels: parsed, dataURL: dataURL };
                }
                return parsed;
            } catch (e) {
                return null;
            }
        }
        
        return null;
    }

    /**
     * Render a 2D pixel grid to a canvas data URL.
     * Used as fallback when the Creator module is not loaded.
     */
    function renderPixelGridToDataURL(pixels) {
        try {
            var size = 64;
            var gridSize = pixels.length || 16;
            var canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            var ctx = canvas.getContext('2d');
            var pixelSize = size / gridSize;
            for (var y = 0; y < gridSize; y++) {
                var row = pixels[y];
                if (!Array.isArray(row)) continue;
                for (var x = 0; x < row.length; x++) {
                    if (row[x]) {
                        ctx.fillStyle = row[x];
                        ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
                    }
                }
            }
            return canvas.toDataURL();
        } catch (e) {
            return null;
        }
    }

    /**
     * Register player with server (emits 'register-player' event)
     * @param {object} socket - Socket.IO socket instance
     * @param {string} game - Game identifier (e.g., 'lobby', 'shop', 'maexchen')
     */
    function registerPlayer(socket, game) {
        var name = getPlayerName();
        if (!name) return;

        var character = getCharacterData();
        socket.emit('register-player', {
            name: name,
            character: character,
            game: game,
            ownerToken: getOwnerToken()
        });

        // Surface name-collision errors so the user knows why nothing works.
        // Once-only attachment per socket to avoid duplicate alerts.
        if (!socket._stricthotelRegisterErrorBound) {
            socket._stricthotelRegisterErrorBound = true;
            socket.on('register-player-error', function (data) {
                var msg = (data && data.message) || 'Registrierung fehlgeschlagen.';
                try {
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({ type: 'stricthotel-toast', message: msg, level: 'error' }, '*');
                    }
                } catch (_) {}
                if (typeof window !== 'undefined' && window.alert) window.alert(msg);
            });
        }
    }

    /**
     * Escape HTML to prevent XSS attacks
     * @param {string} str - String to escape
     * @returns {string} HTML-escaped string
     */
    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Export as global
    window.StrictHotelSocket = {
        NAME_KEY: NAME_KEY,
        CHAR_KEY: CHAR_KEY,
        OWNER_TOKEN_KEY: OWNER_TOKEN_KEY,
        getPlayerName: getPlayerName,
        getCharacterData: getCharacterData,
        getOwnerToken: getOwnerToken,
        registerPlayer: registerPlayer,
        escapeHtml: escapeHtml
    };
})();
