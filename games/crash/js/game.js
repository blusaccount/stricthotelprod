// Crash client — single global round, animated multiplier curve, cash-out anytime.
//
// The curve runs 0.00× → 1.00× → ∞. Below 1.00× a cash-out returns less than
// the stake, so every label in that zone is rendered as a loss, never as a win.
// Curve constants mirror server/handlers/crash.js — keep them in sync.
(() => {
    'use strict';

    const LAUNCH_MS = 3000;     // 0.00× → 1.00× ramp
    const GROWTH_RATE = 0.08;   // per second, flight phase only

    function multiplierAt(elapsedMs) {
        if (elapsedMs <= 0) return 0;
        if (elapsedMs < LAUNCH_MS) return elapsedMs / LAUNCH_MS;
        return Math.exp(GROWTH_RATE * ((elapsedMs - LAUNCH_MS) / 1000));
    }

    // Signed SC delta of a cash-out, formatted with an explicit sign.
    function signed(n) { return `${n >= 0 ? '+' : '−'}${Math.abs(n)}`; }

    const socket = io();
    window.__strictAchievementSocket = socket;

    // ---------- DOM ---------- //
    const canvas = document.getElementById('crash-curve');
    const ctx = canvas.getContext('2d');
    const statePill = document.getElementById('state-pill');
    const multDisp = document.getElementById('multiplier-display');
    const stateSub = document.getElementById('state-sub');
    const recentEl = document.getElementById('recent-crashes');
    const statusEl = document.getElementById('status');
    const balanceEl = document.getElementById('balance-display');
    const betInfo = document.getElementById('bet-info');
    const betButtons = Array.from(document.querySelectorAll('.bet-btn'));
    const autoInput = document.getElementById('auto-cashout');
    const placeBetBtn = document.getElementById('bet-btn');
    const cashoutBtn = document.getElementById('cashout-btn');
    const soundBtn = document.getElementById('sound-toggle');
    const playersList = document.getElementById('players-list');

    // ---------- State ---------- //
    let myName = '';
    let selectedBet = null;
    let audioEnabled = true;
    let currentBalance = null;

    // Round state mirrored from server.
    let roundState = 'betting';   // betting | running | reveal
    let roundId = 0;
    let displayMultiplier = 0;
    let lastTick = { elapsedMs: 0, multiplier: 0, atTime: performance.now() };
    let crashedAt = 0;
    let bettingEndsAt = 0;
    let revealEndsAt = 0;
    let recentCrashes = [];
    let players = [];               // public bet list mirrored from server
    let myBet = null;               // { bet, autoCashout, cashedAt, payout, lost }

    // Curve drawing buffer. On overflow it is resampled down to a uniform
    // spacing over the whole round rather than truncated, so it always still
    // reaches back to t = 0 — a plain shift() drops the head and the filled
    // area then draws a false chord up from the origin.
    const MAX_CURVE_POINTS = 800;
    const CURVE_POINTS_TARGET = 400;
    const curvePoints = [];

    // Uniform in time, so the 1.00x knee between the launch ramp and the flight
    // curve is never chorded across. (Halving the buffer instead degrades the
    // oldest samples geometrically and flattens the whole ramp into one line.)
    function resampleCurve() {
        const tip = curvePoints[curvePoints.length - 1];
        if (!tip || tip.t <= 0) return;
        const step = tip.t / (CURVE_POINTS_TARGET - 1);
        const out = [];
        let r = 0;
        for (let i = 0; i < CURVE_POINTS_TARGET - 1; i++) {
            const want = i * step;
            while (r + 1 < curvePoints.length && curvePoints[r + 1].t <= want) r++;
            out.push(curvePoints[r]);
        }
        out.push(tip);
        curvePoints.length = 0;
        for (const p of out) curvePoints.push(p);
    }

    // ---------- Canvas ---------- //
    const W = canvas.width;
    const H = canvas.height;

    function maxMultiplierForView() {
        // Auto-scale so the current multiplier sits at ~75% of canvas height,
        // with a minimum view height of 2x.
        const m = displayMultiplier;
        const fit = Math.max(2, m * 1.4);
        return fit;
    }

    // Y axis is piecewise: the 0 → 1.00× launch zone gets a fixed band at the
    // bottom, everything above 1.00× gets a log scale so ×10 and ×100 are
    // equal screen steps. Both branches meet at 1.00× — the break-even line.
    const LAUNCH_BAND = 0.28;   // share of plot height given to the launch zone

    function plotTop()    { return 30; }
    function plotBottom() { return H - 30; }
    function breakEvenY() { return plotBottom() - (plotBottom() - plotTop()) * LAUNCH_BAND; }

    function multToY(m, viewMax) {
        const bottom = plotBottom();
        const bandH = (bottom - plotTop()) * LAUNCH_BAND;
        if (m <= 1) return bottom - Math.max(0, m) * bandH;
        const ratio = Math.log(m) / Math.log(Math.max(1.01, viewMax));
        return breakEvenY() - Math.min(1, ratio) * (bottom - plotTop() - bandH);
    }
    // Auto-scale x-axis: pin the newest sample to 80% of width, never zoom in
    // past an 8s window. Derived from the tip once per frame — deriving it from
    // each point's own timestamp collapses every sample past 6.4s onto the same
    // x (t / 1.25t is constant), which drew the curve as a vertical line.
    function timeSpanForView(tipMs) {
        return Math.max(8000, tipMs * 1.25);
    }
    function timeToX(elapsedMs, totalShown) {
        return 30 + (elapsedMs / totalShown) * (W - 60);
    }

    function drawCurve() {
        ctx.clearRect(0, 0, W, H);

        // Background grid
        ctx.strokeStyle = 'rgba(154, 141, 176, 0.10)';
        ctx.lineWidth = 1;
        for (let y = 30; y < H; y += 50) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }
        for (let x = 30; x < W; x += 80) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }

        // Break-even line at 1.00×. Everything below it is the danger zone:
        // bailing out down there returns less than the stake.
        const beY = breakEvenY();
        ctx.fillStyle = 'rgba(255, 56, 56, 0.06)';
        ctx.fillRect(0, beY, W, plotBottom() - beY);
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = 'rgba(255, 204, 51, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, beY);
        ctx.lineTo(W, beY);
        ctx.stroke();
        ctx.restore();
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillStyle = 'rgba(255, 204, 51, 0.75)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('1.00× BREAK EVEN', 8, beY - 6);

        if (roundState === 'betting') {
            // Empty playfield with placeholder curve hint.
            return;
        }

        if (curvePoints.length < 2) return;

        const viewMax = maxMultiplierForView();
        const last = curvePoints[curvePoints.length - 1];
        const totalShown = timeSpanForView(last.t);

        // Filled area under curve
        ctx.beginPath();
        ctx.moveTo(timeToX(0, totalShown), multToY(0, viewMax));
        for (const p of curvePoints) {
            ctx.lineTo(timeToX(p.t, totalShown), multToY(p.m, viewMax));
        }
        ctx.lineTo(timeToX(last.t, totalShown), H);
        ctx.lineTo(timeToX(0, totalShown), H);
        ctx.closePath();
        const inProfit = displayMultiplier >= 1;
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        if (roundState === 'crashed' || roundState === 'reveal') {
            grad.addColorStop(0, 'rgba(255, 56, 56, 0.45)');
            grad.addColorStop(1, 'rgba(255, 56, 56, 0)');
        } else if (inProfit) {
            grad.addColorStop(0, 'rgba(124, 255, 139, 0.5)');
            grad.addColorStop(1, 'rgba(124, 255, 139, 0)');
        } else {
            // Still climbing through the danger zone — not green yet.
            grad.addColorStop(0, 'rgba(255, 204, 51, 0.45)');
            grad.addColorStop(1, 'rgba(255, 204, 51, 0)');
        }
        ctx.fillStyle = grad;
        ctx.fill();

        // Curve stroke
        ctx.beginPath();
        ctx.moveTo(timeToX(curvePoints[0].t, totalShown), multToY(curvePoints[0].m, viewMax));
        for (const p of curvePoints) {
            ctx.lineTo(timeToX(p.t, totalShown), multToY(p.m, viewMax));
        }
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (roundState === 'crashed' || roundState === 'reveal') {
            ctx.strokeStyle = '#ff3838';
            ctx.shadowColor = '#ff3838';
        } else if (inProfit) {
            ctx.strokeStyle = '#7cff8b';
            ctx.shadowColor = '#7cff8b';
        } else {
            ctx.strokeStyle = '#ffcc33';
            ctx.shadowColor = '#ffcc33';
        }
        ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Rocket / X marker at the end of the curve
        const tipX = timeToX(last.t, totalShown);
        const tipY = multToY(last.m, viewMax);
        ctx.font = '32px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(roundState === 'crashed' || roundState === 'reveal' ? '💥' : '🚀', tipX, tipY - 18);
    }

    // ---------- Animation loop ---------- //
    function animationFrame() {
        if (roundState === 'running') {
            // Interpolate multiplier locally between server ticks for smoothness.
            const dt = performance.now() - lastTick.atTime;
            const projected = lastTick.elapsedMs + dt;
            const m = multiplierAt(projected);
            displayMultiplier = m;
            curvePoints.push({ t: projected, m });
            if (curvePoints.length > MAX_CURVE_POINTS) resampleCurve();
            updateMultiplierDisplay(m, false);
        } else if (roundState === 'reveal' || roundState === 'crashed') {
            // Hold multiplier at crashed value.
            displayMultiplier = crashedAt;
        } else if (roundState === 'betting') {
            const remaining = Math.max(0, bettingEndsAt - Date.now());
            stateSub.textContent = `Next round in ${(remaining / 1000).toFixed(1)}s`;
            displayMultiplier = 0;
        }
        drawCurve();
        updateCashoutLabel();
        requestAnimationFrame(animationFrame);
    }

    // The cash-out button doubles as the live P/L readout: below 1.00× it is a
    // bail-out at a loss, above it a win. Never dress the loss up as a gain.
    function updateCashoutLabel() {
        if (!myBet || myBet.cashedAt || roundState !== 'running') {
            cashoutBtn.textContent = 'CASH OUT';
            cashoutBtn.classList.remove('rescue');
            return;
        }
        const delta = Math.round(myBet.bet * displayMultiplier) - myBet.bet;
        const rescue = displayMultiplier < 1;
        cashoutBtn.classList.toggle('rescue', rescue);
        cashoutBtn.textContent = rescue
            ? `RETTEN ${signed(delta)} SC`
            : `CASH OUT ${signed(delta)} SC`;
    }

    function updateMultiplierDisplay(m, crashed) {
        const text = `${m.toFixed(2)}×`;
        multDisp.textContent = text;
        multDisp.classList.toggle('crashed', crashed);
        multDisp.classList.toggle('below-even', !crashed && m < 1);
        if (myBet && myBet.cashedAt && !crashed) {
            multDisp.classList.add('cashed');
        } else {
            multDisp.classList.remove('cashed');
        }
    }

    function setRoundState(state) {
        roundState = state;
        statePill.textContent =
            state === 'betting' ? 'BETTING OPEN' :
            state === 'running' ? 'IN FLIGHT' :
            state === 'reveal'  ? 'CRASHED' :
            state.toUpperCase();
        statePill.classList.remove('betting', 'running', 'crashed');
        if (state === 'betting') statePill.classList.add('betting');
        else if (state === 'running') statePill.classList.add('running');
        else statePill.classList.add('crashed');
        updateButtons();
    }

    function updateButtons() {
        const inBetting = roundState === 'betting';
        const inRunning = roundState === 'running';
        const haveBet = !!myBet && !myBet.cashedAt;

        for (const b of betButtons) b.disabled = !inBetting || !!myBet;
        autoInput.disabled = !inBetting || !!myBet;
        placeBetBtn.disabled = !inBetting || selectedBet === null || !!myBet;
        cashoutBtn.disabled = !(inRunning && haveBet);

        if (currentBalance !== null) {
            for (const b of betButtons) {
                const v = Number(b.getAttribute('data-bet'));
                b.classList.toggle('insufficient', v > currentBalance);
            }
        }

        if (myBet) {
            if (myBet.cashedAt) {
                const delta = myBet.payout - myBet.bet;
                betInfo.classList.remove('active');
                betInfo.classList.toggle('cashed', delta >= 0);
                betInfo.classList.toggle('lost', delta < 0);
                betInfo.textContent = myBet.cashedAt < 1
                    ? `Rescued at ${myBet.cashedAt.toFixed(2)}× → ${signed(delta)} SC`
                    : `Cashed at ${myBet.cashedAt.toFixed(2)}× → ${signed(delta)} SC`;
            } else if (myBet.lost) {
                betInfo.classList.remove('active', 'cashed');
                betInfo.classList.add('lost');
                betInfo.textContent = `Lost ${myBet.bet} SC at ${crashedAt.toFixed(2)}×`;
            } else {
                betInfo.classList.remove('cashed', 'lost');
                betInfo.classList.add('active');
                betInfo.textContent = `${myBet.bet} SC active${myBet.autoCashout ? ` · auto @ ${myBet.autoCashout.toFixed(2)}×` : ''}`;
            }
        } else {
            betInfo.classList.remove('active', 'cashed', 'lost');
            betInfo.textContent = inBetting ? 'No active bet — place one!' : 'Wait for next round';
        }
    }

    function pillTier(m) {
        if (m >= 10) return 'high';
        if (m >= 2)  return 'mid';
        if (m >= 1)  return 'low';
        return 'dead';   // never reached break-even
    }
    function renderRecentCrashes() {
        recentEl.innerHTML = '';
        for (const m of recentCrashes.slice(0, 12)) {
            const span = document.createElement('span');
            span.className = `recent-pill ${pillTier(m)}`;
            span.textContent = `${m.toFixed(2)}×`;
            recentEl.appendChild(span);
        }
    }

    function renderPlayers() {
        playersList.innerHTML = '';
        for (const p of players) {
            const row = document.createElement('div');
            row.className = 'player-row';
            if (p.name === myName) row.classList.add('you');
            if (p.cashedAt) row.classList.add(p.payout >= p.bet ? 'cashed' : 'lost');
            else if (roundState === 'reveal') row.classList.add('lost');

            const name = document.createElement('span');
            name.className = 'player-name';
            name.textContent = p.name;

            const bet = document.createElement('span');
            bet.className = 'player-bet';
            bet.textContent = `${p.bet} SC`;

            const status = document.createElement('span');
            status.className = 'player-status';
            if (p.cashedAt) {
                const delta = p.payout - p.bet;
                status.classList.add(delta >= 0 ? 'cashed' : 'lost');
                status.textContent = `${p.cashedAt.toFixed(2)}× ${signed(delta)}`;
            } else if (roundState === 'reveal') {
                status.classList.add('lost');
                status.textContent = `−${p.bet}`;
            } else if (p.autoCashout) {
                status.classList.add('auto');
                status.textContent = `auto @ ${p.autoCashout.toFixed(2)}×`;
            } else {
                status.textContent = '…';
            }

            row.appendChild(name);
            row.appendChild(bet);
            row.appendChild(status);
            playersList.appendChild(row);
        }
    }

    // ---------- UI helpers ---------- //
    function setStatus(text, kind = 'info') {
        statusEl.textContent = text;
        statusEl.setAttribute('data-kind', kind);
    }
    function setBalance(v) {
        if (typeof v !== 'number') return;
        currentBalance = v;
        balanceEl.textContent = String(Math.floor(v));
        updateButtons();
    }

    // ---------- Audio ---------- //
    let audioCtx = null;
    let masterGain = null;
    let runningOsc = null;
    let runningGain = null;
    function ensureAudio() {
        if (audioCtx) return;
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return;
        audioCtx = new C();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.3;
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
    function startRocketHum() {
        if (!audioEnabled) return;
        ensureAudio();
        stopRocketHum();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 80;
        gain.gain.value = 0.04;
        const lp = audioCtx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 600;
        osc.connect(lp).connect(gain).connect(masterGain);
        osc.start();
        runningOsc = osc;
        runningGain = gain;
    }
    function stopRocketHum() {
        try {
            if (runningOsc) { runningOsc.stop(); runningOsc.disconnect(); }
            if (runningGain) runningGain.disconnect();
        } catch {}
        runningOsc = null;
        runningGain = null;
    }
    function pitchRocket(multiplier) {
        if (!runningOsc) return;
        const f = 80 + Math.min(800, multiplier * 25);
        runningOsc.frequency.setTargetAtTime(f, audioCtx.currentTime, 0.05);
    }
    function playCrash() {
        if (!audioEnabled) return;
        ensureAudio();
        // Quick descending sweep + noise burst.
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.6);
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        osc.connect(g).connect(masterGain);
        osc.start(t); osc.stop(t + 0.75);

        const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.5, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
        const noise = audioCtx.createBufferSource(); noise.buffer = buf;
        const ng = audioCtx.createGain(); ng.gain.value = 0.18;
        noise.connect(ng).connect(masterGain);
        noise.start(t);
    }
    function playCashout() {
        if (!audioEnabled) return;
        ensureAudio();
        const seq = [60, 64, 67, 72, 76];
        for (let i = 0; i < seq.length; i++) {
            tone({ freq: 440 * Math.pow(2, (seq[i] - 69) / 12), dur: 0.07, type: 'triangle', vol: 0.16, when: i * 0.05 });
        }
    }
    function playBetPlaced() {
        if (!audioEnabled) return;
        ensureAudio();
        tone({ freq: 660, dur: 0.05, type: 'square', vol: 0.16 });
        tone({ freq: 880, dur: 0.05, type: 'triangle', vol: 0.10, when: 0.04 });
    }

    // ---------- Spin orchestration ---------- //
    function applyState(data) {
        if (typeof data.state !== 'string') return;

        const prev = roundState;
        setRoundState(data.state);

        if (data.history) {
            recentCrashes = data.history.slice();
            renderRecentCrashes();
        }

        // Reconstruct my bet from public bets.
        const mine = (data.bets || []).find(b => b.name === myName);
        if (mine) {
            myBet = {
                bet: mine.bet,
                autoCashout: mine.autoCashout || null,
                cashedAt: mine.cashedAt || null,
                payout: mine.payout || 0,
                lost: !mine.cashedAt && data.state === 'reveal'
            };
        } else {
            myBet = null;
        }
        players = data.bets || [];
        renderPlayers();
        updateButtons();

        if (data.state === 'betting') {
            bettingEndsAt = Date.now() + (data.timeRemaining || 0);
            curvePoints.length = 0;
            multDisp.classList.remove('crashed');
            if (prev !== 'betting') stopRocketHum();
            updateMultiplierDisplay(0, false);
        } else if (data.state === 'running') {
            lastTick = {
                elapsedMs: data.elapsedMs || 0,
                multiplier: data.multiplier || 0,
                atTime: performance.now()
            };
            curvePoints.length = 0;
            curvePoints.push({ t: 0, m: 0 });
            curvePoints.push({ t: lastTick.elapsedMs, m: lastTick.multiplier });
            if (prev !== 'running') startRocketHum();
        } else if (data.state === 'reveal') {
            crashedAt = data.crashMultiplier || 0;
            revealEndsAt = Date.now() + (data.timeRemaining || 0);
            displayMultiplier = crashedAt;
            updateMultiplierDisplay(crashedAt, true);
            if (prev !== 'reveal') {
                stopRocketHum();
                playCrash();
            }
            stateSub.textContent = `Crashed at ${crashedAt.toFixed(2)}×`;
        }
    }

    // ---------- Wire up ---------- //
    function handleBetClick(btn) {
        if (roundState !== 'betting' || myBet) return;
        const v = Number(btn.getAttribute('data-bet'));
        if (!Number.isInteger(v)) return;
        selectedBet = v;
        for (const b of betButtons) b.classList.remove('active');
        btn.classList.add('active');
        updateButtons();
    }

    placeBetBtn.addEventListener('click', () => {
        if (roundState !== 'betting' || selectedBet === null || myBet) return;
        const auto = autoInput.value.trim() === '' ? null : Number(autoInput.value);
        socket.emit('crash-bet', { bet: selectedBet, autoCashout: auto });
    });

    cashoutBtn.addEventListener('click', () => {
        if (roundState !== 'running' || !myBet || myBet.cashedAt) return;
        socket.emit('crash-cashout');
    });

    for (const b of betButtons) b.addEventListener('click', () => handleBetClick(b));
    soundBtn.addEventListener('click', () => {
        audioEnabled = !audioEnabled;
        soundBtn.textContent = `SOUND: ${audioEnabled ? 'ON' : 'OFF'}`;
        soundBtn.classList.toggle('on', audioEnabled);
        if (!audioEnabled) stopRocketHum();
    });
    soundBtn.classList.add('on');

    function registerPlayer() {
        myName = window.StrictHotelSocket?.getPlayerName?.() || '';
        if (!myName) {
            setStatus('Not logged in. Set a name in the lobby first.', 'loss');
            return;
        }
        window.StrictHotelSocket.registerPlayer(socket, 'crash');
        socket.emit('get-balance');
        socket.emit('crash-state');
    }

    socket.on('connect', registerPlayer);
    socket.on('balance-update', (data) => {
        if (data && typeof data.balance === 'number') setBalance(data.balance);
    });

    socket.on('crash-state', applyState);
    socket.on('crash-round-betting', (data) => {
        bettingEndsAt = Date.now() + (data.durationMs || 6000);
        // Full state arrives via crash-state; this is just an early signal.
    });
    socket.on('crash-round-running', () => {});
    socket.on('crash-tick', (data) => {
        if (roundState !== 'running' || data.roundId !== roundId) {
            // best-effort: keep displaying anyway if state out of sync
        }
        lastTick = {
            elapsedMs: data.elapsedMs,
            multiplier: data.multiplier,
            atTime: performance.now()
        };
        pitchRocket(data.multiplier);
    });
    socket.on('crash-round-crashed', (data) => {
        crashedAt = data.crashMultiplier || displayMultiplier;
        // applyState (via subsequent crash-state) will set roundState to 'reveal'
    });
    socket.on('crash-bet-confirmed', (data) => {
        myBet = { bet: data.bet, autoCashout: data.autoCashout, cashedAt: null, payout: 0, lost: false };
        roundId = data.roundId;
        setBalance(data.balance);
        playBetPlaced();
        setStatus(`Bet placed: ${data.bet} SC${data.autoCashout ? ` · auto @ ${data.autoCashout.toFixed(2)}×` : ''}`, 'info');
        for (const b of betButtons) b.classList.remove('active');
        selectedBet = null;
        updateButtons();
    });
    socket.on('crash-bet-public', (data) => {
        // Will be reflected on next crash-state update; trigger a render hint.
        setStatus(`${data.name} bet ${data.bet} SC${data.autoCashout ? ` · auto @ ${data.autoCashout.toFixed(2)}×` : ''}`, 'info');
    });
    socket.on('crash-cashout', (data) => {
        // Someone (could be us) cashed out.
        if (data.name === myName && myBet) {
            myBet.cashedAt = data.multiplier;
            myBet.payout = data.payout;
            setBalance(data.balance);
            const delta = data.payout - myBet.bet;
            if (delta >= 0) {
                playCashout();
                setStatus(`Cashed at ${data.multiplier.toFixed(2)}× · ${signed(delta)} SC`, 'big');
            } else {
                setStatus(`Rescued ${data.payout} SC of ${myBet.bet} at ${data.multiplier.toFixed(2)}×`, 'loss');
            }
        } else {
            setStatus(`${data.name} cashed at ${data.multiplier.toFixed(2)}×`, 'info');
        }
        updateButtons();
        renderPlayers();
    });
    socket.on('crash-cashout-confirmed', (data) => {
        if (myBet) {
            myBet.cashedAt = data.multiplier;
            myBet.payout = data.payout;
        }
        setBalance(data.balance);
        updateButtons();
    });
    socket.on('crash-error', (data) => {
        setStatus(data?.message || 'Error', 'loss');
    });

    requestAnimationFrame(animationFrame);
})();
