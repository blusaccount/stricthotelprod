// Strict Casino hub — balance display + click-block on coming-soon tiles.
(() => {
    'use strict';

    const socket = io();
    const balanceEl = document.getElementById('balance-display');

    function setBalance(value) {
        if (typeof value !== 'number') return;
        balanceEl.textContent = String(Math.floor(value));
    }

    function registerPlayer() {
        const name = window.StrictHotelSocket?.getPlayerName?.();
        if (!name) {
            balanceEl.textContent = '—';
            return;
        }
        window.StrictHotelSocket.registerPlayer(socket, 'casino');
        socket.emit('get-balance');
    }

    socket.on('connect', registerPlayer);
    socket.on('balance-update', (data) => {
        if (data && typeof data.balance === 'number') setBalance(data.balance);
    });

    // Block clicks on coming-soon tiles + show a tiny status flicker.
    document.querySelectorAll('.casino-card.coming-soon').forEach(card => {
        card.addEventListener('click', (e) => {
            e.preventDefault();
            card.animate(
                [
                    { transform: 'translateX(0)' },
                    { transform: 'translateX(-4px)' },
                    { transform: 'translateX(4px)' },
                    { transform: 'translateX(0)' }
                ],
                { duration: 200, easing: 'ease-in-out' }
            );
        });
    });
})();
