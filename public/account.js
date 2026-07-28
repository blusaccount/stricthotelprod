// ============================================================
// ACCOUNT — optional Discord sign-in.
//
// Signing in is not required for anything. Guests keep the owner-token
// identity they always had and every game works without an account. What an
// account buys is an identity that survives clearing site data and moving to
// another device.
//
// This module owns the top-bar control and nothing else. The server decides
// which name a signed-in player gets; when that differs from what this browser
// asked for, `account-identity` arrives over the socket and localStorage is
// corrected to match.
// ============================================================

(function () {
    'use strict';

    var pill = document.getElementById('account-pill');
    if (!pill) return;

    var state = { configured: false, discord: null };

    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ---------- rendering ----------

    function render() {
        if (!state.configured) {
            // Nothing to offer — hide rather than show a button that 503s.
            pill.hidden = true;
            return;
        }
        pill.hidden = false;

        if (state.discord) {
            pill.innerHTML =
                '<span class="account-badge" title="Angemeldet via Discord">🔗</span>' +
                '<span class="account-name">' + esc(state.discord.username || 'Discord') + '</span>' +
                '<button class="account-btn" id="account-logout" type="button">ABMELDEN</button>';
            var out = document.getElementById('account-logout');
            if (out) out.addEventListener('click', logout);
        } else {
            pill.innerHTML =
                '<a class="account-btn account-btn-primary" href="/auth/discord">' +
                'MIT DISCORD ANMELDEN</a>';
        }
    }

    function logout() {
        fetch('/auth/discord/logout', { method: 'POST' })
            .then(function () {
                state.discord = null;
                render();
                // The socket registered under the account's identity, so the
                // page has to re-register as a guest. A reload is the honest
                // way to get every panel back in sync.
                window.location.reload();
            })
            .catch(function () { /* leaving the pill as-is is fine */ });
    }

    // ---------- toast for the redirect back from Discord ----------

    function toast(message, kind) {
        var el = document.createElement('div');
        el.className = 'account-toast' + (kind ? ' account-toast-' + kind : '');
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(function () { el.classList.add('visible'); }, 20);
        setTimeout(function () {
            el.classList.remove('visible');
            setTimeout(function () { el.remove(); }, 400);
        }, 5000);
    }

    function consumeLoginResult() {
        var params = new URLSearchParams(window.location.search);
        var login = params.get('login');
        if (!login) return;

        if (login === 'ok') {
            toast('Angemeldet. Dein Spielstand ist jetzt an dein Discord-Konto gebunden.', 'ok');
        } else {
            var reason = params.get('reason') || 'unbekannt';
            toast('Anmeldung fehlgeschlagen (' + reason + ').', 'error');
        }

        // Clean the query string so a reload does not repeat the toast.
        params.delete('login');
        params.delete('reason');
        var qs = params.toString();
        window.history.replaceState({}, '',
            window.location.pathname + (qs ? '?' + qs : ''));
    }

    // ---------- server-assigned identity ----------

    function getSocket() {
        return (window.StrictHotelLobby && window.StrictHotelLobby.socket) ||
               window.StrictHotelLobbySocket || null;
    }

    /**
     * Ask the server to register us under the signed-in account.
     *
     * The lobby only registers when the player types a name or the socket
     * reconnects, so after the redirect back from Discord nothing would happen
     * until the next interaction — the sign-in would appear to do nothing.
     *
     * The name is sent as whatever this browser has, which may be empty on a
     * fresh device. The server resolves the account's own name in that case.
     */
    function registerAsAccount() {
        var socket = getSocket();
        if (!socket) return;
        var S = window.StrictHotelSocket;
        if (!S) return;

        var emit = function () {
            socket.emit('register-player', {
                name: S.getPlayerName(),
                character: S.getCharacterData(),
                game: 'lobby',
                ownerToken: S.getOwnerToken()
            });
        };
        if (socket.connected) emit();
        else socket.once('connect', emit);
    }

    function bindSocket() {
        var socket = getSocket();
        if (!socket) return;

        socket.on('account-identity', function (data) {
            if (!data || typeof data.name !== 'string' || !data.name) return;

            // The account decides the name. If this browser asked for a
            // different one — fresh device, cleared storage — correct the
            // stored name and the input rather than letting them disagree
            // with the server for the rest of the session.
            try {
                localStorage.setItem(window.StrictHotelSocket.NAME_KEY, data.name);
            } catch (e) { /* private mode */ }

            var input = document.getElementById('input-name');
            if (input && input.value !== data.name) {
                input.value = data.name;
                // Let the lobby run its own registration path so avatar,
                // balance and presence all follow the corrected name.
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }

            if (data.adopted) {
                toast('Willkommen zurück, ' + data.name + '. Spielstand aus deinem Konto geladen.', 'ok');
            } else if (data.bound) {
                toast('"' + data.name + '" gehört jetzt zu deinem Discord-Konto.', 'ok');
            }
        });
    }

    // ---------- init ----------

    consumeLoginResult();

    fetch('/api/account', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
            if (!data) return;
            state.configured = Boolean(data.configured);
            state.discord = data.discord || null;
            render();
            if (state.discord) registerAsAccount();
        })
        .catch(function () { /* stay hidden */ });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindSocket);
    } else {
        bindSocket();
    }
})();
