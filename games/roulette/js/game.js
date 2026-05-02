// Roulette client. Server picks the pocket; client animates wheel rotation
// to land on it.
(() => {
    'use strict';

    const socket = io();
    window.__strictAchievementSocket = socket;

    const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    function pocketColor(n) {
        if (n === 0) return 'green';
        if (RED_NUMBERS.has(n)) return 'red';
        return 'black';
    }

    // European wheel pocket order (clockwise from 0).
    const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    const POCKET_COUNT = WHEEL_ORDER.length;

    // ---------- DOM ---------- //
    const canvas = document.getElementById('wheel-canvas');
    const ctx = canvas.getContext('2d');
    const balanceEl = document.getElementById('balance-display');
    const statusEl = document.getElementById('status');
    const recentEl = document.getElementById('recent-row');
    const wheelResult = document.getElementById('wheel-result');
    const wheelResultNum = document.getElementById('wheel-result-num');
    const wheelResultLabel = document.getElementById('wheel-result-label');
    const chipBtns = Array.from(document.querySelectorAll('.bet-btn'));
    const numberGrid = document.getElementById('number-grid');
    const boardZero = document.querySelector('.board-zero');
    const outsideBtns = Array.from(document.querySelectorAll('.outside-btn'));
    const spinBtn = document.getElementById('spin-btn');
    const clearBtn = document.getElementById('clear-btn');
    const betCountEl = document.getElementById('bet-count');
    const betTotalEl = document.getElementById('bet-total');
    const betListEl = document.getElementById('bet-list');

    // ---------- State ---------- //
    let selectedChip = 10;
    let activeBets = []; // [{ type, value?, amount }]
    let currentBalance = null;
    let isSpinning = false;
    let wheelAngle = 0;
    let history = []; // recent pockets

    // ---------- Build number grid ===== //
    // The roulette table arranges numbers in 3 rows, with row 1 = 3,6,9,...,36 (top); row 2 = 2,5,8,...,35; row 3 = 1,4,7,...,34.
    function buildNumberGrid() {
        const order = [];
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 12; col++) {
                const n = col * 3 + (3 - row);
                order.push(n);
            }
        }
        for (const n of order) {
            const cell = document.createElement('div');
            cell.className = `num-cell ${pocketColor(n)}`;
            cell.dataset.bet = 'straight';
            cell.dataset.value = String(n);
            cell.textContent = String(n);
            cell.addEventListener('click', () => placeStraight(n));
            numberGrid.appendChild(cell);
        }
    }
    buildNumberGrid();

    boardZero.addEventListener('click', () => placeStraight(0));

    function placeStraight(n) {
        if (isSpinning) return;
        addBet({ type: 'straight', value: n, amount: selectedChip });
    }

    for (const btn of outsideBtns) {
        btn.addEventListener('click', () => {
            if (isSpinning) return;
            const t = btn.getAttribute('data-bet');
            addBet({ type: t, amount: selectedChip });
        });
    }

    function addBet(bet) {
        if (activeBets.length >= 12) {
            setStatus('Max 12 bets per round.', 'loss');
            return;
        }
        const totalAfter = activeBets.reduce((s, b) => s + b.amount, 0) + bet.amount;
        if (currentBalance !== null && totalAfter > currentBalance) {
            setStatus('Insufficient balance for that bet.', 'loss');
            return;
        }
        // If a bet of the same kind already exists, increment its amount instead.
        const existing = activeBets.find(b =>
            b.type === bet.type && (b.type !== 'straight' || b.value === bet.value)
        );
        if (existing) {
            existing.amount += bet.amount;
        } else {
            activeBets.push(bet);
        }
        renderActiveBets();
    }

    function clearBets() {
        if (isSpinning) return;
        activeBets = [];
        renderActiveBets();
    }

    function renderActiveBets() {
        // Update count + total
        const total = activeBets.reduce((s, b) => s + b.amount, 0);
        betCountEl.textContent = String(activeBets.length);
        betTotalEl.textContent = String(total);
        spinBtn.disabled = isSpinning || activeBets.length === 0;

        // Update visual badges on board cells.
        for (const cell of numberGrid.querySelectorAll('.num-cell')) {
            cell.classList.remove('has-bet');
            cell.removeAttribute('data-amount');
        }
        boardZero.classList.remove('has-bet');
        boardZero.removeAttribute('data-amount');
        for (const btn of outsideBtns) {
            btn.classList.remove('has-bet');
            btn.removeAttribute('data-amount');
        }

        for (const b of activeBets) {
            if (b.type === 'straight') {
                const cell = b.value === 0
                    ? boardZero
                    : numberGrid.querySelector(`.num-cell[data-value="${b.value}"]`);
                if (cell) {
                    cell.classList.add('has-bet');
                    cell.setAttribute('data-amount', String(b.amount));
                }
            } else {
                const btn = outsideBtns.find(o => o.getAttribute('data-bet') === b.type);
                if (btn) {
                    btn.classList.add('has-bet');
                    btn.setAttribute('data-amount', String(b.amount));
                }
            }
        }

        // List
        betListEl.innerHTML = '';
        for (const b of activeBets) {
            const row = document.createElement('div');
            row.className = 'bet-row';
            const label = b.type === 'straight' ? `STRAIGHT ${b.value}` : b.type.toUpperCase();
            row.innerHTML = `<span>${label}</span><span>${b.amount} SC</span>`;
            betListEl.appendChild(row);
        }
    }

    // ---------- Chip selection ---------- //
    for (const btn of chipBtns) {
        btn.addEventListener('click', () => {
            const v = Number(btn.getAttribute('data-bet'));
            if (!Number.isInteger(v)) return;
            selectedChip = v;
            for (const b of chipBtns) b.classList.remove('active');
            btn.classList.add('active');
        });
    }

    // ---------- Wheel rendering ---------- //
    function drawWheel() {
        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2, cy = H / 2;
        const outerR = Math.min(W, H) / 2 - 10;
        const innerR = outerR * 0.55;

        ctx.clearRect(0, 0, W, H);

        // Outer rim
        ctx.beginPath();
        ctx.arc(cx, cy, outerR + 6, 0, Math.PI * 2);
        ctx.fillStyle = '#704020';
        ctx.fill();

        // Pockets
        const sliceAngle = (Math.PI * 2) / POCKET_COUNT;
        for (let i = 0; i < POCKET_COUNT; i++) {
            const num = WHEEL_ORDER[i];
            const startA = i * sliceAngle - Math.PI / 2 + wheelAngle;
            const endA = startA + sliceAngle;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, outerR, startA, endA);
            ctx.closePath();
            ctx.fillStyle = num === 0 ? '#228822' : (RED_NUMBERS.has(num) ? '#c0202c' : '#161616');
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Number label
            const midA = startA + sliceAngle / 2;
            const labelR = outerR * 0.78;
            const lx = cx + Math.cos(midA) * labelR;
            const ly = cy + Math.sin(midA) * labelR;
            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(midA + Math.PI / 2);
            ctx.fillStyle = '#fff';
            ctx.font = '10px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(num), 0, 0);
            ctx.restore();
        }

        // Inner hub
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(cx - 20, cy - 20, 10, cx, cy, innerR);
        grad.addColorStop(0, '#a07060');
        grad.addColorStop(1, '#3a1810');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    drawWheel();

    function spinWheelTo(targetPocket, durationMs = 4000) {
        return new Promise(resolve => {
            const idx = WHEEL_ORDER.indexOf(targetPocket);
            // Final angle: rotate so pocket idx ends at the top (under the pointer).
            const sliceAngle = (Math.PI * 2) / POCKET_COUNT;
            // Currently pocket i is centered at angle  i*slice - PI/2 + wheelAngle.
            // We want it at -PI/2 (top), so wheelAngle target = -i*slice (mod 2PI).
            const baseTarget = -idx * sliceAngle;
            // Spin many extra turns for drama.
            const extraTurns = 5;
            const finalAngle = baseTarget - extraTurns * Math.PI * 2;
            const startAngle = wheelAngle;
            const totalDelta = finalAngle - ((startAngle - 2 * Math.PI * Math.floor(startAngle / (2 * Math.PI))));
            // Easing: ease-out cubic.
            const start = performance.now();
            function tick(ts) {
                const t = Math.min(1, (ts - start) / durationMs);
                const eased = 1 - Math.pow(1 - t, 3);
                wheelAngle = startAngle + (finalAngle - startAngle) * eased;
                drawWheel();
                if (t < 1) requestAnimationFrame(tick);
                else {
                    wheelAngle = finalAngle % (Math.PI * 2);
                    drawWheel();
                    resolve();
                }
            }
            requestAnimationFrame(tick);
        });
    }

    // ---------- Audio ---------- //
    let audioCtx = null;
    let masterGain = null;
    let tickOsc = null, tickGain = null;
    function ensureAudio() {
        if (audioCtx) return;
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return;
        audioCtx = new C();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.35;
        masterGain.connect(audioCtx.destination);
    }
    function playTickSequence(durMs) {
        if (!audioCtx) return;
        // Periodic clicks accelerating-then-decelerating across the spin.
        const start = audioCtx.currentTime;
        let t = 0;
        const ticks = [];
        // Slow start, fast middle, slow end (matching cubic ease-out: clicks slow as wheel slows).
        let tickGap = 0.07;
        while (t < durMs / 1000) {
            ticks.push(start + t);
            // Slow down toward the end.
            const progress = t / (durMs / 1000);
            tickGap = 0.05 + progress * 0.45;
            t += tickGap;
        }
        for (const at of ticks) {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = 'square';
            o.frequency.value = 1200;
            g.gain.setValueAtTime(0, at);
            g.gain.linearRampToValueAtTime(0.10, at + 0.002);
            g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
            o.connect(g).connect(masterGain);
            o.start(at); o.stop(at + 0.05);
        }
    }
    function playWin() {
        ensureAudio();
        const seq = [60, 64, 67, 72, 76];
        for (let i = 0; i < seq.length; i++) {
            const f = 440 * Math.pow(2, (seq[i] - 69) / 12);
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = 'triangle';
            o.frequency.value = f;
            const at = audioCtx.currentTime + i * 0.07;
            g.gain.setValueAtTime(0, at);
            g.gain.linearRampToValueAtTime(0.18, at + 0.005);
            g.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
            o.connect(g).connect(masterGain);
            o.start(at); o.stop(at + 0.12);
        }
    }
    function playLose() {
        ensureAudio();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(220, audioCtx.currentTime);
        o.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.5);
        g.gain.setValueAtTime(0.10, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
        o.connect(g).connect(masterGain);
        o.start();
        o.stop(audioCtx.currentTime + 0.55);
    }

    // ---------- Status / balance ---------- //
    function setStatus(text, kind = 'info') {
        statusEl.textContent = text;
        statusEl.setAttribute('data-kind', kind);
    }
    function setBalance(v) {
        if (typeof v !== 'number') return;
        currentBalance = v;
        balanceEl.textContent = String(Math.floor(v));
    }

    // ---------- Spin orchestration ---------- //
    async function handleSpin() {
        if (isSpinning || activeBets.length === 0) return;
        ensureAudio();
        isSpinning = true;
        spinBtn.disabled = true;
        clearBtn.disabled = true;
        wheelResult.hidden = true;
        setStatus('Spinning…', 'info');
        socket.emit('roulette-spin', { bets: activeBets });
    }

    async function handleResult(result) {
        playTickSequence(4000);
        await spinWheelTo(result.pocket, 4000);
        const color = result.color;
        wheelResult.classList.remove('green', 'red', 'black');
        wheelResult.classList.add(color);
        wheelResultNum.textContent = String(result.pocket);
        wheelResultLabel.textContent = color.toUpperCase();
        wheelResult.hidden = false;

        // Update history pills
        history.unshift({ pocket: result.pocket, color });
        if (history.length > 12) history.length = 12;
        renderRecent();

        // Update bet rows with win/loss
        const rows = betListEl.querySelectorAll('.bet-row');
        result.results.forEach((r, i) => {
            if (rows[i]) rows[i].classList.add(r.won ? 'win' : 'loss');
        });

        const net = result.net;
        if (net > 0) {
            setStatus(`${result.pocket} ${color.toUpperCase()} · +${net} SC`, 'win');
            playWin();
        } else if (net < 0) {
            setStatus(`${result.pocket} ${color.toUpperCase()} · ${net} SC`, 'loss');
            playLose();
        } else {
            setStatus(`${result.pocket} ${color.toUpperCase()} · break-even`, 'info');
        }

        setBalance(result.balance);
        setTimeout(() => {
            isSpinning = false;
            activeBets = [];
            renderActiveBets();
            clearBtn.disabled = false;
        }, 2200);
    }

    function renderRecent() {
        recentEl.innerHTML = '';
        for (const h of history) {
            const span = document.createElement('span');
            span.className = `recent-pill ${h.color}`;
            span.textContent = String(h.pocket);
            recentEl.appendChild(span);
        }
    }

    // ---------- Wire ---------- //
    spinBtn.addEventListener('click', handleSpin);
    clearBtn.addEventListener('click', clearBets);

    function registerPlayer() {
        const name = window.StrictHotelSocket?.getPlayerName?.();
        if (!name) {
            setStatus('Not logged in. Set a name in the lobby first.', 'loss');
            return;
        }
        window.StrictHotelSocket.registerPlayer(socket, 'roulette');
        socket.emit('get-balance');
    }

    socket.on('connect', registerPlayer);
    socket.on('balance-update', (data) => {
        if (data && typeof data.balance === 'number') setBalance(data.balance);
    });
    socket.on('roulette-result', handleResult);
    socket.on('roulette-error', (data) => {
        isSpinning = false;
        spinBtn.disabled = activeBets.length === 0;
        clearBtn.disabled = false;
        setStatus(data?.message || 'Error', 'loss');
    });
})();
