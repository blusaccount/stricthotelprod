// Plinko client. 12-row Pascal triangle, 13 buckets, server picks the path.
(() => {
    'use strict';

    const socket = io();

    const ROWS = 12;
    const BUCKETS = ROWS + 1;
    const PAYTABLE = {
        low:    [9,    3,   1.4, 1.2, 1.1, 1,   0.5, 1,   1.1, 1.2, 1.4, 3,   9   ],
        medium: [27,   8,   2.5, 1.5, 1.1, 0.7, 0.5, 0.7, 1.1, 1.5, 2.5, 8,   27  ],
        high:   [200,  25,  7,   2,   0.4, 0.3, 0.3, 0.3, 0.4, 2,   7,   25,  200 ]
    };

    // ---------- DOM ---------- //
    const canvas = document.getElementById('plinko-board');
    const ctx = canvas.getContext('2d');
    const multRow = document.getElementById('multiplier-row');
    const banner = document.getElementById('board-banner');
    const bannerMult = document.getElementById('banner-mult');
    const bannerPay = document.getElementById('banner-pay');
    const statusEl = document.getElementById('status');
    const balanceEl = document.getElementById('balance-display');
    const dropBtn = document.getElementById('drop-btn');
    const soundBtn = document.getElementById('sound-toggle');
    const betButtons = Array.from(document.querySelectorAll('.bet-btn'));
    const riskButtons = Array.from(document.querySelectorAll('.risk-btn'));
    const historyList = document.getElementById('history-list');
    const paytableGrid = document.getElementById('paytable-grid');

    // ---------- State ---------- //
    let selectedBet = null;
    let selectedRisk = 'medium';
    let isDropping = false;
    let audioEnabled = true;
    let currentBalance = null;
    let history = [];

    // ---------- Layout ---------- //
    // Pegs are arranged in a Pascal triangle:
    //   row 0: 1 peg, row 1: 2 pegs, ..., row 11: 12 pegs.
    // Below row 11, there are 13 bucket columns (one per peg gap).
    const W = canvas.width;
    const H = canvas.height;
    const TOP_PAD = 30;
    const BOT_PAD = 60;
    const PEG_RADIUS = 4;
    // Use full canvas width split into BUCKETS columns. Buckets are centered
    // in each column; pegs sit on column boundaries (between two buckets).
    const COL_W = W / BUCKETS;

    function pegX(row, idx) {
        // Row r has r+1 pegs centered horizontally. Pegs of the last row sit
        // BETWEEN buckets, so we offset by an extra +0.5 column.
        const rowStart = (BUCKETS - (row + 1)) / 2 + 0.5;
        return (rowStart + idx) * COL_W;
    }
    function pegY(row) {
        const playH = H - TOP_PAD - BOT_PAD;
        return TOP_PAD + (row / (ROWS - 1)) * playH * 0.95;
    }
    function bucketX(idx) {
        return (idx + 0.5) * COL_W;
    }

    function drawStatic(highlightBucket) {
        ctx.clearRect(0, 0, W, H);

        // Background grid faint glow
        const grad = ctx.createRadialGradient(W / 2, H * 0.4, 50, W / 2, H * 0.5, W * 0.7);
        grad.addColorStop(0, 'rgba(62, 255, 225, 0.05)');
        grad.addColorStop(1, 'rgba(255, 62, 165, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Pegs
        for (let r = 0; r < ROWS; r++) {
            for (let i = 0; i <= r; i++) {
                const x = pegX(r, i);
                const y = pegY(r);
                ctx.beginPath();
                ctx.arc(x, y, PEG_RADIUS, 0, Math.PI * 2);
                ctx.fillStyle = '#3effe1';
                ctx.shadowColor = '#3effe1';
                ctx.shadowBlur = 6;
                ctx.fill();
            }
        }
        ctx.shadowBlur = 0;

        // Bucket dividers
        const bucketTopY = pegY(ROWS - 1) + 18;
        const bucketBotY = H - 14;
        ctx.strokeStyle = 'rgba(154, 141, 176, 0.4)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= BUCKETS; i++) {
            const x = i * COL_W;
            ctx.beginPath();
            ctx.moveTo(x, bucketTopY);
            ctx.lineTo(x, bucketBotY);
            ctx.stroke();
        }
        // Bucket label area
        for (let i = 0; i < BUCKETS; i++) {
            const x = bucketX(i);
            const y = (bucketTopY + bucketBotY) / 2 + 2;
            const m = PAYTABLE[selectedRisk][i];
            const isMega = m >= 50;
            const isHigh = m >= 5 && m < 50;
            const isLow = m < 1;
            const colorByTier = isMega ? '#ff3ea5' : isHigh ? '#ffcc33' : isLow ? '#9a8db0' : '#f6f6f6';
            const isHighlighted = highlightBucket === i;
            ctx.fillStyle = isHighlighted ? '#ffffff' : colorByTier;
            ctx.font = '10px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            const text = m >= 1 ? `${m}×` : `${m}×`;
            ctx.fillText(text, x, y);
        }
    }

    function drawBall(x, y) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffcc33';
        ctx.shadowColor = '#ffcc33';
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    function bucketTier(m) {
        if (m >= 50) return 'tier-mega';
        if (m >= 5)  return 'tier-high';
        if (m >= 1)  return 'tier-mid';
        return 'tier-low';
    }

    function renderMultiplierRow() {
        multRow.innerHTML = '';
        const m = PAYTABLE[selectedRisk];
        for (let i = 0; i < BUCKETS; i++) {
            const cell = document.createElement('div');
            cell.className = 'bucket-cell ' + bucketTier(m[i]);
            cell.textContent = `${m[i]}×`;
            cell.dataset.idx = i;
            multRow.appendChild(cell);
        }
    }

    function renderPaytableGrid() {
        paytableGrid.innerHTML = '';
        for (const level of ['low', 'medium', 'high']) {
            const r = document.createElement('div');
            r.className = 'pt-risk';
            r.textContent = level.toUpperCase();
            const v = document.createElement('div');
            v.className = 'pt-vals';
            const mults = PAYTABLE[level];
            v.textContent = `${mults[0]}× → ${mults[Math.floor(BUCKETS / 2)]}× → ${mults[BUCKETS - 1]}×`;
            paytableGrid.appendChild(r);
            paytableGrid.appendChild(v);
        }
    }

    function renderHistory() {
        historyList.innerHTML = '';
        for (const h of history) {
            const row = document.createElement('div');
            row.className = 'history-row';

            const mult = document.createElement('div');
            mult.className = 'history-mult ' + (h.payout > h.bet ? 'win' : 'loss');
            mult.textContent = `${h.multiplier}×`;

            const bucket = document.createElement('div');
            bucket.className = 'history-bucket';
            bucket.textContent = h.risk[0].toUpperCase();

            const pay = document.createElement('div');
            pay.className = 'history-pay ' + (h.payout >= h.bet ? 'win' : 'loss');
            pay.textContent = h.payout >= h.bet ? `+${h.payout - h.bet}` : `−${h.bet - h.payout}`;

            row.appendChild(mult);
            row.appendChild(bucket);
            row.appendChild(pay);
            historyList.appendChild(row);
        }
    }

    // ---------- Animation ---------- //
    function animateDrop(path) {
        return new Promise(resolve => {
            // Build sequence of waypoints: start above row 0 peg → bounce off peg row by row → land in bucket.
            const waypoints = [];
            // start above the topmost peg (row 0, idx 0)
            let col = 0;
            waypoints.push({ x: pegX(0, 0), y: TOP_PAD - 18 });
            for (let r = 0; r < ROWS; r++) {
                // Bounce slightly off the peg in current column.
                const px = pegX(r, col);
                const py = pegY(r);
                waypoints.push({ x: px, y: py - 10, peg: true });
                // Then move to next row, col stays or +1 depending on path[r]
                col += path[r];
                if (col > r + 1) col = r + 1;
            }
            const finalBucket = col;
            const finalX = bucketX(finalBucket);
            const finalY = pegY(ROWS - 1) + 26;
            waypoints.push({ x: finalX, y: finalY });

            // Animate between waypoints with quick easing.
            let i = 0;
            const segDur = 90; // ms per peg hop (turbo-ish)
            const start = performance.now();
            let segStart = start;
            let last = waypoints[0];
            let next = waypoints[1] || last;

            const tick = (ts) => {
                const t = (ts - segStart) / segDur;
                if (t >= 1) {
                    // Land on next, advance.
                    last = next;
                    i++;
                    if (i >= waypoints.length - 1) {
                        drawStatic(finalBucket);
                        drawBall(last.x, last.y);
                        playPegPing(440 + finalBucket * 60);
                        return resolve(finalBucket);
                    }
                    next = waypoints[i + 1];
                    segStart = ts;
                    if (last.peg) playPegPing(700 + Math.random() * 300);
                }
                const eased = Math.min(1, Math.max(0, t));
                // Slight arc on each hop: parabolic dip.
                const dx = next.x - last.x;
                const dy = next.y - last.y;
                const arc = -Math.sin(eased * Math.PI) * 6;
                const x = last.x + dx * eased;
                const y = last.y + dy * eased + arc;
                drawStatic();
                drawBall(x, y);
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
    }

    // ---------- Audio (Web Audio synth) ---------- //
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
    function playPegPing(freq) {
        if (!audioEnabled) return;
        ensureAudio();
        tone({ freq, dur: 0.04, type: 'square', vol: 0.12 });
    }
    function playWinFanfare(multiplier) {
        if (!audioEnabled) return;
        ensureAudio();
        const tier = multiplier >= 50 ? 4 : multiplier >= 10 ? 3 : multiplier >= 2 ? 2 : multiplier >= 1 ? 1 : 0;
        const counts = [0, 3, 5, 7, 10];
        const baseMidi = [0, 60, 64, 67, 72][tier];
        const stepInterval = 0.07;
        const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);
        for (let i = 0; i < counts[tier]; i++) {
            tone({ freq: midiHz(baseMidi + i * 2), dur: 0.06, type: 'triangle', vol: 0.18, when: i * stepInterval });
            if (tier >= 3) tone({ freq: midiHz(baseMidi + i * 2 + 7), dur: 0.05, type: 'square', vol: 0.07, when: i * stepInterval + 0.01 });
        }
    }
    function playLose() {
        if (!audioEnabled) return;
        ensureAudio();
        tone({ freq: 110, dur: 0.18, type: 'sawtooth', vol: 0.06 });
        tone({ freq: 92,  dur: 0.18, type: 'sawtooth', vol: 0.05, when: 0.06 });
    }

    // ---------- UI helpers ---------- //
    function setStatus(text, kind = 'info') {
        statusEl.textContent = text;
        statusEl.setAttribute('data-kind', kind);
    }
    function setBalance(value) {
        if (typeof value !== 'number') return;
        currentBalance = value;
        balanceEl.textContent = String(Math.floor(value));
        updateBetButtons();
    }
    function updateBetButtons() {
        if (currentBalance === null) return;
        for (const btn of betButtons) {
            const v = Number(btn.getAttribute('data-bet'));
            btn.classList.toggle('insufficient', v > currentBalance);
            btn.disabled = isDropping;
        }
        if (selectedBet !== null && selectedBet > currentBalance) {
            selectedBet = null;
            for (const b of betButtons) b.classList.remove('active');
            dropBtn.disabled = true;
            setStatus('Insufficient balance.', 'loss');
        }
    }
    function updateDropButton() {
        dropBtn.disabled = isDropping || selectedBet === null;
    }
    function lockUi(active) {
        isDropping = active;
        for (const b of betButtons) b.disabled = active;
        for (const b of riskButtons) b.disabled = active;
        updateDropButton();
    }

    function showBanner(multiplier, payout, bet) {
        bannerMult.textContent = `×${multiplier}`;
        const net = payout - bet;
        bannerPay.textContent = (net >= 0 ? '+' : '−') + Math.abs(net) + ' SC';
        bannerPay.style.color = net >= 0 ? 'var(--win)' : 'var(--loss)';
        banner.hidden = false;
        setTimeout(() => { banner.hidden = true; }, 1800);
    }

    function highlightBucket(idx, multiplier) {
        const cells = multRow.querySelectorAll('.bucket-cell');
        for (const c of cells) c.classList.remove('hit');
        if (cells[idx]) cells[idx].classList.add('hit');
        setTimeout(() => cells[idx]?.classList.remove('hit'), 1400);
    }

    function setRisk(level) {
        if (isDropping) return;
        selectedRisk = level;
        for (const b of riskButtons) b.classList.toggle('active', b.getAttribute('data-risk') === level);
        renderMultiplierRow();
        drawStatic();
    }

    // ---------- Spin orchestration ---------- //
    async function handleDrop() {
        if (isDropping || selectedBet === null) return;
        ensureAudio();
        lockUi(true);
        setStatus('Dropping…', 'info');
        // Optimistic balance reduction is server-driven; just emit and wait.
        socket.emit('plinko-drop', { bet: selectedBet, risk: selectedRisk });
    }

    async function handleResult(result) {
        await animateDrop(result.path);
        setBalance(result.balance);
        history.unshift(result);
        if (history.length > 7) history.length = 7;
        renderHistory();
        highlightBucket(result.bucket, result.multiplier);

        const tierBig = result.multiplier >= 5;
        if (tierBig || result.payout > result.bet * 2) {
            showBanner(result.multiplier, result.payout, result.bet);
        }

        if (result.payout >= result.bet) {
            const net = result.payout - result.bet;
            setStatus(`×${result.multiplier} · ${net > 0 ? '+'+net : 'break-even'} SC`, tierBig ? 'big' : 'win');
            playWinFanfare(result.multiplier);
        } else {
            setStatus(`×${result.multiplier} · −${result.bet - result.payout} SC`, 'loss');
            playLose();
        }
        lockUi(false);
    }

    // ---------- Wire up ---------- //
    function handleBetClick(btn) {
        if (isDropping) return;
        const v = Number(btn.getAttribute('data-bet'));
        if (!Number.isInteger(v)) return;
        selectedBet = v;
        for (const b of betButtons) b.classList.remove('active');
        btn.classList.add('active');
        updateDropButton();
        setStatus(`Bet ${v} SC · risk ${selectedRisk}. Ready to drop.`, 'info');
    }

    function registerPlayer() {
        const name = window.StrictHotelSocket?.getPlayerName?.();
        if (!name) {
            setStatus('Not logged in. Set a name in the lobby first.', 'loss');
            dropBtn.disabled = true;
            return;
        }
        window.StrictHotelSocket.registerPlayer(socket, 'plinko');
        socket.emit('get-balance');
    }

    socket.on('connect', registerPlayer);
    socket.on('balance-update', (data) => {
        if (data && typeof data.balance === 'number') setBalance(data.balance);
    });
    socket.on('plinko-result', handleResult);
    socket.on('plinko-error', (data) => {
        lockUi(false);
        setStatus(data?.message || 'Drop failed.', 'loss');
    });

    for (const b of betButtons)  b.addEventListener('click', () => handleBetClick(b));
    for (const b of riskButtons) b.addEventListener('click', () => setRisk(b.getAttribute('data-risk')));
    dropBtn.addEventListener('click', handleDrop);
    soundBtn.addEventListener('click', () => {
        audioEnabled = !audioEnabled;
        soundBtn.textContent = `SOUND: ${audioEnabled ? 'ON' : 'OFF'}`;
        soundBtn.classList.toggle('on', audioEnabled);
    });
    soundBtn.classList.add('on');

    renderPaytableGrid();
    renderMultiplierRow();
    drawStatic();
})();
