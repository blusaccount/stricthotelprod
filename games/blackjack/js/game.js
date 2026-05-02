// Blackjack client. Single player vs. dealer. Server holds the shoe and game state.
(() => {
    'use strict';

    const socket = io();
    window.__strictAchievementSocket = socket;

    const SUITS = ['♠', '♥', '♦', '♣'];
    function rankLabel(rank) {
        if (rank === 1) return 'A';
        if (rank === 11) return 'J';
        if (rank === 12) return 'Q';
        if (rank === 13) return 'K';
        return String(rank);
    }
    function isRedSuit(suit) { return suit === 1 || suit === 2; }

    // ---------- DOM ---------- //
    const dealerHandEl = document.getElementById('dealer-hand');
    const playerHandEl = document.getElementById('player-hand');
    const dealerTotalEl = document.getElementById('dealer-total');
    const playerTotalEl = document.getElementById('player-total');
    const balanceEl = document.getElementById('balance-display');
    const statusEl = document.getElementById('status');
    const dealBtn = document.getElementById('deal-btn');
    const hitBtn = document.getElementById('hit-btn');
    const standBtn = document.getElementById('stand-btn');
    const doubleBtn = document.getElementById('double-btn');
    const betButtons = Array.from(document.querySelectorAll('.bet-btn'));
    const banner = document.getElementById('result-banner');
    const bannerText = document.getElementById('result-text');
    const bannerAmount = document.getElementById('result-amount');
    const historyList = document.getElementById('history-list');

    let selectedBet = null;
    let currentBalance = null;
    let inHand = false;
    let history = [];

    // ---------- Audio ---------- //
    let audioCtx = null;
    let masterGain = null;
    function ensureAudio() {
        if (audioCtx) return;
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return;
        audioCtx = new C();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.35;
        masterGain.connect(audioCtx.destination);
    }
    function tone({ freq, dur = 0.06, type = 'square', vol = 0.18, when = 0 }) {
        if (!audioCtx) return;
        const t0 = audioCtx.currentTime + when;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(vol, t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g).connect(masterGain);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
    }
    function playDeal() { ensureAudio(); tone({ freq: 880, dur: 0.04, type: 'square', vol: 0.10 }); }
    function playWin() {
        ensureAudio();
        const seq = [60, 64, 67, 72];
        for (let i = 0; i < seq.length; i++) {
            tone({ freq: 440 * Math.pow(2, (seq[i] - 69) / 12), dur: 0.08, type: 'triangle', vol: 0.18, when: i * 0.06 });
        }
    }
    function playLose() { ensureAudio(); tone({ freq: 110, dur: 0.18, type: 'sawtooth', vol: 0.06 }); tone({ freq: 92,  dur: 0.18, type: 'sawtooth', vol: 0.05, when: 0.06 }); }
    function playPush() { ensureAudio(); tone({ freq: 440, dur: 0.08, type: 'triangle', vol: 0.12 }); }
    function playBlackjack() {
        ensureAudio();
        const seq = [60, 64, 67, 72, 76, 79, 84];
        for (let i = 0; i < seq.length; i++) {
            tone({ freq: 440 * Math.pow(2, (seq[i] - 69) / 12), dur: 0.08, type: 'square', vol: 0.16, when: i * 0.05 });
        }
    }

    // ---------- Render ---------- //
    function renderHand(el, hand) {
        el.innerHTML = '';
        for (const card of hand) {
            const div = document.createElement('div');
            if (card.hidden) {
                div.className = 'card face-down';
                div.innerHTML = `<div class="center">🎰</div>`;
            } else {
                const red = isRedSuit(card.suit);
                div.className = 'card' + (red ? ' red' : '');
                const r = rankLabel(card.rank);
                const s = SUITS[card.suit];
                div.innerHTML = `
                    <div class="corner tl">${r}<br>${s}</div>
                    <div class="center">${s}</div>
                    <div class="corner bl">${r}<br>${s}</div>
                `;
            }
            el.appendChild(div);
        }
    }

    function renderTotal(el, total, soft, finished, bust, bj) {
        el.classList.remove('bust', 'win', 'bj');
        if (bj) {
            el.classList.add('bj');
            el.textContent = 'BJ!';
            return;
        }
        if (bust) {
            el.classList.add('bust');
            el.textContent = `BUST ${total}`;
            return;
        }
        if (typeof total === 'number') {
            el.textContent = soft && total <= 21 ? `${total - 10}/${total}` : String(total);
        } else {
            el.textContent = '—';
        }
    }

    function setStatus(text, kind = 'info') {
        statusEl.textContent = text;
        statusEl.setAttribute('data-kind', kind);
    }

    function setBalance(v) {
        if (typeof v !== 'number') return;
        currentBalance = v;
        balanceEl.textContent = String(Math.floor(v));
        updateBetButtons();
    }
    function updateBetButtons() {
        if (currentBalance === null) return;
        for (const btn of betButtons) {
            const v = Number(btn.getAttribute('data-bet'));
            btn.classList.toggle('insufficient', v > currentBalance);
            btn.disabled = inHand;
        }
    }

    function setBetActive(btn) {
        if (inHand) return;
        const v = Number(btn.getAttribute('data-bet'));
        if (!Number.isInteger(v)) return;
        selectedBet = v;
        for (const b of betButtons) b.classList.remove('active');
        btn.classList.add('active');
        dealBtn.disabled = false;
    }

    function applyState(state) {
        if (!state || state.idle) {
            // No active hand on server — ready for a new deal.
            inHand = false;
            dealerHandEl.innerHTML = '';
            playerHandEl.innerHTML = '';
            renderTotal(dealerTotalEl, null);
            renderTotal(playerTotalEl, null);
            updateButtons();
            return;
        }
        renderHand(dealerHandEl, state.dealerHand || []);
        renderHand(playerHandEl, state.playerHand || []);

        const pTotal = state.playerTotal;
        const playerBJ = state.playerHand?.length === 2 && pTotal?.total === 21;
        const playerBust = pTotal?.total > 21;
        renderTotal(playerTotalEl, pTotal?.total, pTotal?.soft, state.finished, playerBust, playerBJ);

        const dTotal = state.dealerTotal;
        const dealerBJ = state.finished && state.dealerHand?.length === 2 && dTotal?.total === 21;
        const dealerBust = state.finished && dTotal?.total > 21;
        renderTotal(dealerTotalEl, dTotal?.total, dTotal?.soft, state.finished, dealerBust, dealerBJ);

        inHand = !state.finished;
        if (state.finished) {
            showResult(state);
            history.unshift({
                outcome: state.outcome,
                bet: state.bet,
                payout: state.payout
            });
            if (history.length > 7) history.length = 7;
            renderHistory();
        } else {
            banner.hidden = true;
        }
        updateButtons(state);
    }

    function showResult(state) {
        const o = state.outcome;
        banner.hidden = false;
        banner.classList.remove('bj', 'win', 'loss', 'push');
        banner.classList.add(o === 'blackjack' ? 'bj' : o);
        const labels = { blackjack: 'BLACKJACK!', win: 'YOU WIN', lose: 'DEALER WINS', push: 'PUSH' };
        bannerText.textContent = labels[o] || 'WIN';
        const net = state.payout - state.bet;
        if (o === 'push') {
            bannerAmount.textContent = `Bet returned: ${state.bet} SC`;
            playPush();
        } else if (state.payout > 0) {
            bannerAmount.textContent = `+${net} SC`;
            o === 'blackjack' ? playBlackjack() : playWin();
        } else {
            bannerAmount.textContent = `−${state.bet} SC`;
            playLose();
        }
        setStatus(labels[o] || '—', o === 'lose' ? 'loss' : (o === 'push' ? 'push' : (o === 'blackjack' ? 'bj' : 'win')));
        setTimeout(() => { banner.hidden = true; }, 2500);
    }

    function renderHistory() {
        historyList.innerHTML = '';
        for (const h of history) {
            const row = document.createElement('div');
            row.className = 'history-row';
            const o = document.createElement('div');
            o.className = `history-outcome ${h.outcome === 'lose' ? 'loss' : (h.outcome === 'blackjack' ? 'bj' : h.outcome)}`;
            o.textContent = (h.outcome === 'blackjack') ? 'BJ!' : h.outcome.toUpperCase();
            const b = document.createElement('div');
            b.className = 'history-bet';
            b.textContent = `${h.bet} SC`;
            const pay = document.createElement('div');
            pay.className = `history-pay ${h.payout > h.bet ? 'win' : (h.payout === h.bet ? 'push' : 'loss')}`;
            const net = h.payout - h.bet;
            pay.textContent = h.payout === h.bet ? '±0' : (net > 0 ? `+${net}` : `−${Math.abs(net)}`);
            row.appendChild(o); row.appendChild(b); row.appendChild(pay);
            historyList.appendChild(row);
        }
    }

    function updateButtons(state) {
        const ready = !inHand;
        dealBtn.disabled = !ready || selectedBet === null;
        const inProgress = !!state && !state.finished;
        hitBtn.disabled = !inProgress;
        standBtn.disabled = !inProgress;
        // Double only on first action (2 player cards) and bet ≤ balance.
        const canDoubleAfford = state && currentBalance !== null && currentBalance >= state.bet;
        doubleBtn.disabled = !inProgress || !state.canDouble || !canDoubleAfford;
        for (const b of betButtons) {
            b.disabled = !ready;
        }
        updateBetButtons();
    }

    // ---------- Wire ---------- //
    for (const b of betButtons) b.addEventListener('click', () => setBetActive(b));
    dealBtn.addEventListener('click', () => {
        if (inHand || selectedBet === null) return;
        playDeal();
        socket.emit('bj-deal', { bet: selectedBet });
    });
    hitBtn.addEventListener('click', () => { playDeal(); socket.emit('bj-hit'); });
    standBtn.addEventListener('click', () => socket.emit('bj-stand'));
    doubleBtn.addEventListener('click', () => { playDeal(); socket.emit('bj-double'); });

    function registerPlayer() {
        const name = window.StrictHotelSocket?.getPlayerName?.();
        if (!name) {
            setStatus('Not logged in. Set a name in the lobby first.', 'loss');
            return;
        }
        window.StrictHotelSocket.registerPlayer(socket, 'blackjack');
        socket.emit('get-balance');
        socket.emit('bj-state');
    }

    socket.on('connect', registerPlayer);
    socket.on('balance-update', (data) => {
        if (data && typeof data.balance === 'number') setBalance(data.balance);
    });
    socket.on('bj-state-result', applyState);
    socket.on('bj-error', (data) => {
        setStatus(data?.message || 'Error', 'loss');
    });
})();
