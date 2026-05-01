// ============== STRICTLY7S 2.0 CLIENT ==============
// 5×3 grid, 10 paylines win-both-ways, expanding wild on reels 2/3/4,
// scatter pays, free spins (10 spins, 2× multiplier, retrigger).

(() => {
    'use strict';

    const socket = io();

    // ---------- Config ---------- //
    const REEL_COUNT = 5;
    const ROW_COUNT = 3;
    const FS_TRIGGER_COUNT = 3;

    const SYMBOL_LABEL = {
        SEVEN:   '7️⃣',
        DIAMOND: '💎',
        BAR:     '🟫',
        BELL:    '🔔',
        CHERRY:  '🍒',
        LEMON:   '🍋',
        WILD:    '⚡',
        SCATTER: '🎰',
        BLANK:   '·'
    };

    // Per-reel symbol pool for the spinning strip (visual only).
    // Same weights as server, used to populate the scrolling animation.
    const POOL_OUTER = ['SEVEN','SEVEN','DIAMOND','DIAMOND','DIAMOND','BAR','BAR','BAR','BAR',
                        'BELL','BELL','BELL','BELL','BELL','CHERRY','CHERRY','CHERRY','CHERRY','CHERRY','CHERRY',
                        'LEMON','LEMON','LEMON','LEMON','LEMON','LEMON','LEMON','LEMON',
                        'BLANK','BLANK','BLANK','BLANK','BLANK','BLANK','BLANK','BLANK','BLANK','BLANK','BLANK','SCATTER'];
    const POOL_INNER = ['SEVEN','SEVEN','DIAMOND','DIAMOND','DIAMOND','BAR','BAR','BAR','BAR',
                        'BELL','BELL','BELL','BELL','BELL','CHERRY','CHERRY','CHERRY','CHERRY','CHERRY','CHERRY',
                        'LEMON','LEMON','LEMON','LEMON','LEMON','LEMON','LEMON','WILD',
                        'BLANK','BLANK','BLANK','BLANK','BLANK','BLANK','BLANK','BLANK','BLANK','BLANK','BLANK','SCATTER'];
    const REEL_POOL = [POOL_OUTER, POOL_INNER, POOL_INNER, POOL_INNER, POOL_OUTER];

    // 10 paylines on a 5×3 grid (must match server).
    const PAYLINES = [
        [1,1,1,1,1], // 1: middle
        [0,0,0,0,0], // 2: top
        [2,2,2,2,2], // 3: bottom
        [0,1,2,1,0], // 4: V
        [2,1,0,1,2], // 5: ^
        [0,0,1,2,2], // 6: step-down
        [2,2,1,0,0], // 7: step-up
        [1,0,0,0,1], // 8: mid-up-mid
        [1,2,2,2,1], // 9: mid-down-mid
        [0,1,0,1,0]  // 10: wave
    ];
    const PAYLINE_COLORS = [
        '#ffcc33', '#3effe1', '#ff3ea5', '#7cff8b', '#ff8a3c',
        '#a78bff', '#ff6a7a', '#ffe278', '#3ec1ff', '#ff5500'
    ];

    // ---------- DOM ---------- //
    const reelsEl = document.getElementById('reels');
    const paylineSvg = document.getElementById('payline-overlay');
    const reelFrames = Array.from(reelsEl.querySelectorAll('.reel-frame'));
    const reelStrips = reelFrames.map(f => f.querySelector('.reel-strip'));
    const cellEls = reelFrames.map(f => Array.from(f.querySelectorAll('.cell')));
    const statusEl = document.getElementById('status');
    const balanceEl = document.getElementById('balance-display');
    const spinBtn = document.getElementById('spin-btn');
    const turboBtn = document.getElementById('turbo-toggle');
    const soundBtn = document.getElementById('sound-toggle');
    const musicSlider = document.getElementById('music-volume');
    const betButtons = Array.from(document.querySelectorAll('.bet-btn'));
    const historyList = document.getElementById('history-list');
    const bigWinBanner = document.getElementById('big-win-banner');
    const bigWinTier = document.getElementById('big-win-tier');
    const bigWinAmount = document.getElementById('big-win-amount');
    const fsIntro = document.getElementById('free-spin-intro');
    const fsIntroSub = document.getElementById('fs-intro-sub');
    const fsBadge = document.getElementById('fs-badge');
    const fsBadgeCount = document.getElementById('fs-badge-count');

    // ---------- State ---------- //
    let selectedBet = null;
    let isSpinning = false;
    let turbo = false;
    let audioEnabled = true;
    let musicVolume = 0.35;
    let currentBalance = null;
    let freeSpinsRemaining = 0;
    let freeSpinsActive = false; // becomes true after intro animation plays
    let history = [];

    // ---------- Layout helpers ---------- //
    function getCellHeight() {
        const probe = reelStrips[0]?.querySelector('.reel-item');
        if (probe) return probe.getBoundingClientRect().height;
        return 96; // fallback
    }

    function buildScrollingStrip(reelIdx) {
        const strip = reelStrips[reelIdx];
        const pool = REEL_POOL[reelIdx];
        const repeats = 8; // ~320 items per reel for long, smooth scroll
        const items = [];
        for (let i = 0; i < repeats; i++) {
            for (let j = 0; j < pool.length; j++) {
                items.push(pool[(i + j * 13) % pool.length]); // shuffle a bit
            }
        }
        strip.innerHTML = '';
        const frag = document.createDocumentFragment();
        for (const id of items) {
            const item = document.createElement('div');
            item.className = 'reel-item' + (id === 'BLANK' ? ' blank' : '');
            item.textContent = SYMBOL_LABEL[id] || '?';
            frag.appendChild(item);
        }
        strip.appendChild(frag);
        strip.style.transform = 'translateY(0px)';
    }

    function setStaticReelSymbols(reelIdx, symbols) {
        // symbols = [topRow, midRow, botRow]
        const strip = reelStrips[reelIdx];
        strip.innerHTML = '';
        for (const id of symbols) {
            const item = document.createElement('div');
            item.className = 'reel-item' + (id === 'BLANK' ? ' blank' : '');
            item.textContent = SYMBOL_LABEL[id] || '?';
            strip.appendChild(item);
        }
        strip.style.transform = 'translateY(0px)';
    }

    function setInitialReels() {
        for (let r = 0; r < REEL_COUNT; r++) {
            setStaticReelSymbols(r, ['BLANK', 'BLANK', 'BLANK']);
        }
    }

    // ---------- Status / balance / bet UI ---------- //
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
        const fsLocked = freeSpinsRemaining > 0;
        for (const btn of betButtons) {
            const v = Number(btn.getAttribute('data-bet'));
            btn.classList.toggle('insufficient', v > currentBalance);
            btn.disabled = fsLocked;
        }
        if (selectedBet !== null && !fsLocked && selectedBet > currentBalance) {
            selectedBet = null;
            for (const b of betButtons) b.classList.remove('active');
            spinBtn.disabled = true;
            setStatus('Insufficient balance. Choose a lower bet.', 'loss');
        }
    }

    function updateSpinButton() {
        if (freeSpinsRemaining > 0) {
            spinBtn.classList.add('fs-active');
            spinBtn.textContent = `FREE SPIN (${freeSpinsRemaining})`;
            spinBtn.disabled = isSpinning;
        } else {
            spinBtn.classList.remove('fs-active');
            spinBtn.textContent = 'SPIN';
            spinBtn.disabled = isSpinning || selectedBet === null;
        }
    }

    function setFreeSpinUi(remaining) {
        freeSpinsRemaining = remaining;
        if (remaining > 0) {
            fsBadge.hidden = false;
            fsBadgeCount.textContent = String(remaining);
            reelsEl.classList.add('fs-mode');
        } else {
            fsBadge.hidden = true;
            reelsEl.classList.remove('fs-mode');
        }
        updateBetButtons();
        updateSpinButton();
    }

    // ---------- History ---------- //
    function addHistory(grid, payout, bet, freeSpins, wasFreeSpin) {
        const middleRow = grid.map(reel => SYMBOL_LABEL[reel[1]] || '?');
        history.unshift({ row: middleRow, payout, bet, freeSpins, wasFreeSpin });
        if (history.length > 7) history.length = 7;
        renderHistory();
    }

    function renderHistory() {
        historyList.innerHTML = '';
        for (const h of history) {
            const row = document.createElement('div');
            row.className = 'history-row';
            const r = document.createElement('div');
            r.className = 'history-reels';
            r.textContent = h.row.join(' ');
            const result = document.createElement('div');
            result.className = 'history-result';
            if (h.freeSpins > 0) {
                result.classList.add('fs');
                result.textContent = `+${h.freeSpins} FS`;
            } else if (h.payout > 0) {
                result.classList.add('win');
                result.textContent = `+${h.payout}`;
            } else {
                result.classList.add('loss');
                result.textContent = h.wasFreeSpin ? 'fs miss' : `−${h.bet}`;
            }
            row.appendChild(r);
            row.appendChild(result);
            historyList.appendChild(row);
        }
    }

    // ---------- Reel spin animation ---------- //
    const reelAnim = reelFrames.map(() => ({ raf: 0, offset: 0, speed: 0 }));

    function startReelSpin(reelIdx) {
        const frame = reelFrames[reelIdx];
        const strip = reelStrips[reelIdx];
        const a = reelAnim[reelIdx];
        const cellH = getCellHeight();
        const stripHeight = strip.scrollHeight;
        const wrapAt = stripHeight - cellH * 6;

        a.offset = 0;
        a.speed = (turbo ? 2.4 : 1.6) + reelIdx * (turbo ? 0.05 : 0.08); // px/ms
        frame.classList.add('spinning');

        let last = performance.now();
        const tick = (ts) => {
            if (!a.spinning) return;
            const dt = Math.min(ts - last, 50); // clamp dt to avoid jumps after tab blur
            last = ts;
            a.offset += a.speed * dt;
            if (a.offset > wrapAt) a.offset -= cellH * 6;
            strip.style.transform = `translateY(${-a.offset}px)`;
            a.raf = requestAnimationFrame(tick);
        };
        a.spinning = true;
        a.raf = requestAnimationFrame(tick);
    }

    function startAllReels() {
        for (let r = 0; r < REEL_COUNT; r++) {
            buildScrollingStrip(r);
            startReelSpin(r);
        }
    }

    function stopReelToSymbols(reelIdx, finalSymbols, withAnticipation = false) {
        return new Promise(resolve => {
            const frame = reelFrames[reelIdx];
            const strip = reelStrips[reelIdx];
            const a = reelAnim[reelIdx];
            const cellH = getCellHeight();

            const finishStop = () => {
                a.spinning = false;
                if (a.raf) cancelAnimationFrame(a.raf);
                a.raf = 0;
                // Replace the strip with the final 3 symbols and snap.
                setStaticReelSymbols(reelIdx, finalSymbols);
                strip.style.transition = '';
                frame.classList.remove('spinning', 'anticipation');
                playReelStop(reelIdx);
                resolve();
            };

            const doStop = () => {
                // Smoothly roll the existing strip to a position just below the final symbols,
                // then swap in the final 3 symbols and snap. We bake the final 3 symbols in a
                // visible window by appending them to the strip and animating to that offset.
                const finalItems = finalSymbols.map(id => {
                    const el = document.createElement('div');
                    el.className = 'reel-item' + (id === 'BLANK' ? ' blank' : '');
                    el.textContent = SYMBOL_LABEL[id] || '?';
                    return el;
                });
                for (const el of finalItems) strip.appendChild(el);
                const targetOffset = strip.scrollHeight - cellH * 3;
                a.spinning = false;
                if (a.raf) cancelAnimationFrame(a.raf);
                a.raf = 0;
                const dur = turbo ? 280 : 520;
                strip.style.transition = `transform ${dur}ms cubic-bezier(0.18, 0.95, 0.25, 1.06)`;
                strip.style.transform = `translateY(${-targetOffset}px)`;
                setTimeout(finishStop, dur + 30);
            };

            if (withAnticipation && !turbo) {
                frame.classList.add('anticipation');
                a.speed *= 0.45;
                playAnticipation();
                setTimeout(doStop, 850);
            } else {
                doStop();
            }
        });
    }

    async function stopAllReels(grid, expandedFlags) {
        // grid: [reel][row], pre-expansion. We stop reels left-to-right with stagger.
        // Anticipation kicks in on reels 4 and 5 if 2 or 3 scatters already visible.
        const stagger = turbo ? 120 : 220;
        let scattersVisibleSoFar = 0;
        for (let r = 0; r < REEL_COUNT; r++) {
            scattersVisibleSoFar += grid[r].filter(s => s === 'SCATTER').length;
            const remaining = REEL_COUNT - r - 1;
            const needed = FS_TRIGGER_COUNT - scattersVisibleSoFar;
            const anticipate = needed > 0 && needed <= remaining && remaining <= 2;
            await new Promise(res => setTimeout(res, stagger));
            await stopReelToSymbols(r, grid[r], anticipate);
        }
        // Apply expanded-wild visuals after stops.
        for (let r = 0; r < REEL_COUNT; r++) {
            if (expandedFlags && expandedFlags[r]) {
                setStaticReelSymbols(r, ['WILD', 'WILD', 'WILD']);
                reelFrames[r].classList.add('expanded-wild');
                playWildExpand();
            } else {
                reelFrames[r].classList.remove('expanded-wild');
            }
        }
    }

    // ---------- Win highlighting ---------- //
    function clearWinHighlights() {
        for (const cells of cellEls) {
            for (const c of cells) c.classList.remove('win', 'win-jackpot', 'scatter-hit');
        }
        paylineSvg.innerHTML = '';
    }

    function highlightWins(wins, grid, expandedFlags, scatterPositions) {
        clearWinHighlights();

        // Draw paylines
        for (const w of wins) {
            const line = PAYLINES[w.line];
            if (!line) continue;
            const color = PAYLINE_COLORS[w.line] || '#ffcc33';

            const reelStep = 100 / REEL_COUNT;
            const rowStep = 100 / ROW_COUNT;
            const points = line.map((row, r) => {
                const x = r * reelStep + reelStep / 2;
                const y = row * rowStep + rowStep / 2;
                return `${x},${y}`;
            }).join(' ');
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            poly.setAttribute('points', points);
            poly.setAttribute('stroke', color);
            poly.classList.add('active');
            paylineSvg.appendChild(poly);

            // Highlight individual winning cells
            const symbol = w.leftSymbol || w.rightSymbol;
            const isJackpot = symbol === 'SEVEN';

            // Left run highlight
            for (let i = 0; i < (w.leftCount || 0); i++) {
                const row = line[i];
                cellEls[i][row].classList.add(isJackpot ? 'win-jackpot' : 'win');
            }
            // Right run highlight (and not double-count if 5-of-a-kind both ways)
            if (w.rightCount && (w.leftCount + w.rightCount) > REEL_COUNT) {
                for (let i = 0; i < w.rightCount; i++) {
                    const r = REEL_COUNT - 1 - i;
                    const row = line[r];
                    cellEls[r][row].classList.add(isJackpot ? 'win-jackpot' : 'win');
                }
            } else if (w.rightCount && !w.leftCount) {
                for (let i = 0; i < w.rightCount; i++) {
                    const r = REEL_COUNT - 1 - i;
                    const row = line[r];
                    cellEls[r][row].classList.add(isJackpot ? 'win-jackpot' : 'win');
                }
            }
        }

        // Scatter highlights
        if (scatterPositions && scatterPositions.length >= FS_TRIGGER_COUNT) {
            for (const [r, row] of scatterPositions) {
                cellEls[r][row].classList.add('scatter-hit');
            }
        }
    }

    // ---------- Big-Win counter ---------- //
    function tierForWin(payout, bet) {
        const x = payout / Math.max(1, bet);
        if (x >= 100) return { name: 'ULTRA WIN', cls: 'tier-ultra', durMs: 3600 };
        if (x >= 50)  return { name: 'EPIC WIN',  cls: 'tier-epic',  durMs: 2800 };
        if (x >= 25)  return { name: 'MEGA WIN',  cls: 'tier-mega',  durMs: 2400 };
        if (x >= 10)  return { name: 'BIG WIN',   cls: '',           durMs: 1800 };
        return null;
    }

    function showBigWin(payout, bet, onDone) {
        const tier = tierForWin(payout, bet);
        if (!tier) { onDone?.(); return; }
        bigWinTier.textContent = tier.name;
        bigWinTier.className = 'big-win-tier ' + tier.cls;
        bigWinBanner.hidden = false;
        bigWinAmount.textContent = '0';
        playBigWinSweep(tier.durMs);
        spawnCoinRain(tier.cls === 'tier-ultra' ? 60 : tier.cls === 'tier-epic' ? 40 : tier.cls === 'tier-mega' ? 25 : 15);

        const start = performance.now();
        const targetN = Math.floor(payout);
        const tick = (ts) => {
            const t = Math.min(1, (ts - start) / tier.durMs);
            // logarithmic ease-out for satisfying counter
            const eased = 1 - Math.pow(1 - t, 2.5);
            const v = Math.floor(targetN * eased);
            bigWinAmount.textContent = String(v);
            if (t < 1) requestAnimationFrame(tick);
            else {
                bigWinAmount.textContent = String(targetN);
                setTimeout(() => {
                    bigWinBanner.hidden = true;
                    onDone?.();
                }, 700);
            }
        };
        requestAnimationFrame(tick);
    }

    function spawnCoinRain(count) {
        const rect = reelsEl.getBoundingClientRect();
        for (let i = 0; i < count; i++) {
            const c = document.createElement('div');
            c.className = 'coin';
            c.textContent = ['💰','🪙','✨'][i % 3];
            const startX = Math.random() * rect.width;
            c.style.left = `${startX}px`;
            c.style.top = `-30px`;
            reelsEl.appendChild(c);
            const driftX = (Math.random() - 0.5) * 220;
            const dur = 1400 + Math.random() * 1200;
            const delay = Math.random() * 700;
            c.animate([
                { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
                { transform: `translate(${driftX}px, ${rect.height + 80}px) rotate(${720 * (Math.random() - 0.5)}deg)`, opacity: 0 }
            ], { duration: dur, delay, easing: 'cubic-bezier(0.4, 0, 0.7, 1)' });
            setTimeout(() => c.remove(), dur + delay + 50);
        }
    }

    // ---------- Free spin intro ---------- //
    function showFreeSpinIntro(awarded, isRetrigger) {
        return new Promise(resolve => {
            fsIntroSub.textContent = isRetrigger
                ? `+${awarded} more spins · 2× multiplier`
                : `${awarded} spins · 2× multiplier`;
            fsIntro.hidden = false;
            playFreeSpinFanfare();
            setTimeout(() => {
                fsIntro.hidden = true;
                resolve();
            }, 2200);
        });
    }

    // ---------- Web Audio synth ---------- //
    let audioCtx = null;
    let masterGain = null;
    let musicGain = null;
    let ambienceGain = null;
    let musicNodes = [];
    let ambienceNodes = [];
    let musicMode = null; // 'base' | 'fs'

    function ensureAudio() {
        if (audioCtx) return;
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return;
        audioCtx = new C();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.5;
        const comp = audioCtx.createDynamicsCompressor();
        comp.threshold.value = -10;
        comp.knee.value = 12;
        comp.ratio.value = 4;
        comp.attack.value = 0.005;
        comp.release.value = 0.12;
        masterGain.connect(comp).connect(audioCtx.destination);

        musicGain = audioCtx.createGain();
        musicGain.gain.value = musicVolume;
        musicGain.connect(masterGain);

        ambienceGain = audioCtx.createGain();
        ambienceGain.gain.value = 0.18;
        ambienceGain.connect(masterGain);
        startAmbienceLoop();
    }

    function midiHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }

    function playTone({ freq, dur = 0.12, type = 'square', vol = 0.18, attack = 0.005, release = 0.06, when = 0, dest = null }) {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        const t0 = audioCtx.currentTime + when;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(vol, t0 + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + release);
        osc.connect(g).connect(dest || masterGain);
        osc.start(t0);
        osc.stop(t0 + dur + release + 0.05);
    }

    function playReelStop(reelIdx) {
        if (!audioEnabled) return;
        ensureAudio();
        // Pitch rises per reel: reel 0 lowest, reel 4 highest.
        const baseMidi = 48 + reelIdx * 3;
        playTone({ freq: midiHz(baseMidi), dur: 0.05, type: 'square', vol: 0.18 });
        playTone({ freq: midiHz(baseMidi + 12), dur: 0.04, type: 'triangle', vol: 0.08, when: 0.005 });
    }

    function playAnticipation() {
        if (!audioEnabled) return;
        ensureAudio();
        // Sustained low hum with a detuned fifth.
        const t = audioCtx.currentTime;
        const dur = 0.85;
        const o1 = audioCtx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = midiHz(45);
        const o2 = audioCtx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = midiHz(52) * 1.005;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.18, t + 0.1);
        g.gain.linearRampToValueAtTime(0.22, t + dur - 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o1.connect(g); o2.connect(g); g.connect(masterGain);
        o1.start(t); o2.start(t);
        o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    }

    function playWildExpand() {
        if (!audioEnabled) return;
        ensureAudio();
        // Rising arpeggio
        const notes = [60, 64, 67, 72, 76];
        for (let i = 0; i < notes.length; i++) {
            playTone({ freq: midiHz(notes[i]), dur: 0.07, type: 'square', vol: 0.16, when: i * 0.06 });
        }
    }

    function playWinSound(payout, bet) {
        if (!audioEnabled || payout <= 0) return;
        ensureAudio();
        const x = payout / Math.max(1, bet);
        const tier = x >= 50 ? 4 : x >= 25 ? 3 : x >= 10 ? 2 : x >= 2 ? 1 : 0;
        // Coin-drop arpeggio with length scaling
        const counts = [3, 5, 7, 10, 14];
        const baseMidi = [60, 60, 64, 67, 72][tier];
        const stepInterval = tier >= 3 ? 0.09 : 0.07;
        for (let i = 0; i < counts[tier]; i++) {
            playTone({ freq: midiHz(baseMidi + i * 2), dur: 0.06, type: 'triangle', vol: 0.16, when: i * stepInterval });
            if (tier >= 2) playTone({ freq: midiHz(baseMidi + i * 2 + 7), dur: 0.05, type: 'square', vol: 0.07, when: i * stepInterval + 0.01 });
        }
    }

    function playLoseSound() {
        if (!audioEnabled) return;
        ensureAudio();
        playTone({ freq: midiHz(45), dur: 0.18, type: 'sawtooth', vol: 0.06 });
        playTone({ freq: midiHz(41), dur: 0.18, type: 'sawtooth', vol: 0.05, when: 0.06 });
    }

    function playSpinClick() {
        if (!audioEnabled) return;
        ensureAudio();
        playTone({ freq: midiHz(78), dur: 0.04, type: 'square', vol: 0.12 });
    }

    function playBigWinSweep(durMs) {
        if (!audioEnabled) return;
        ensureAudio();
        const t = audioCtx.currentTime;
        const dur = durMs / 1000;
        const osc = audioCtx.createOscillator(); osc.type = 'sawtooth';
        const g = audioCtx.createGain();
        osc.frequency.setValueAtTime(midiHz(48), t);
        osc.frequency.exponentialRampToValueAtTime(midiHz(84), t + dur * 0.7);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.12, t + 0.1);
        g.gain.linearRampToValueAtTime(0.16, t + dur * 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g).connect(masterGain);
        osc.start(t); osc.stop(t + dur + 0.05);
        // Cymbal-ish noise burst at end
        const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.6, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
        const noise = audioCtx.createBufferSource(); noise.buffer = buf;
        const ng = audioCtx.createGain(); ng.gain.value = 0.18;
        noise.connect(ng).connect(masterGain);
        noise.start(t + dur * 0.85);
    }

    function playFreeSpinFanfare() {
        if (!audioEnabled) return;
        ensureAudio();
        const seq = [60, 64, 67, 72, 67, 72, 76, 79];
        for (let i = 0; i < seq.length; i++) {
            playTone({ freq: midiHz(seq[i]), dur: 0.1, type: 'square', vol: 0.18, when: i * 0.1 });
            playTone({ freq: midiHz(seq[i] + 12), dur: 0.08, type: 'triangle', vol: 0.1, when: i * 0.1 + 0.02 });
        }
    }

    // ---------- Layered chiptune music ---------- //
    function clearMusicNodes(arr) {
        for (const n of arr) {
            try { n.stop(); } catch {}
            try { n.disconnect(); } catch {}
        }
        arr.length = 0;
    }

    function startMusic(mode) {
        if (!audioEnabled) return;
        ensureAudio();
        if (musicMode === mode) return;
        clearMusicNodes(musicNodes);
        musicMode = mode;

        // Bassline + lead loop. Two patterns: base (slow) and fs (faster, brighter).
        const bpm = mode === 'fs' ? 132 : 96;
        const beat = 60 / bpm;
        const sixteenth = beat / 4;

        // Bass pattern (root-fifth-root-octave per bar)
        const bassRoot = mode === 'fs' ? 36 : 33; // C2 vs A1
        const bassPattern = [0, 0, 7, 0, 0, 0, 12, 0, 0, 0, 7, 0, 0, 0, 5, 7];
        // Lead pattern
        const leadOffsets = mode === 'fs'
            ? [0, 4, 7, 12, 16, 12, 7, 4, 0, 7, 12, 16, 19, 16, 12, 7]
            : [0, 0, 4, 7, 0, 0, 7, 4, 0, 0, 4, 7, 12, 7, 4, 0];

        const t0 = audioCtx.currentTime + 0.05;
        const bars = 8; // 8 bars look-ahead, refresh on a timer
        for (let bar = 0; bar < bars; bar++) {
            for (let s = 0; s < 16; s++) {
                const at = t0 + (bar * 16 + s) * sixteenth;
                // Bass
                playMusicNote(midiHz(bassRoot + bassPattern[s]), 'square', sixteenth * 1.6, 0.16, at, musicGain);
                // Lead (skip every other 16th when in base mode for sparser feel)
                if (mode === 'fs' || s % 2 === 0) {
                    playMusicNote(midiHz(60 + leadOffsets[s]), 'triangle', sixteenth * 1.2, 0.10, at, musicGain);
                }
                // Hat (noise burst) on every 16th, accent on quarters
                if (s % 2 === 0) {
                    musicHat(at, s % 4 === 0 ? 0.06 : 0.025);
                }
            }
        }
        // Re-schedule loop before this batch ends.
        const loopMs = bars * 16 * sixteenth * 1000;
        setTimeout(() => { if (musicMode === mode) startMusic(mode); }, loopMs - 250);
    }

    function playMusicNote(freq, type, dur, vol, when, dest) {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(vol, when + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        osc.connect(g).connect(dest);
        osc.start(when);
        osc.stop(when + dur + 0.05);
        musicNodes.push(osc, g);
    }

    function musicHat(when, vol) {
        const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.05, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const src = audioCtx.createBufferSource(); src.buffer = buf;
        const g = audioCtx.createGain(); g.gain.value = vol;
        const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
        src.connect(hp).connect(g).connect(musicGain);
        src.start(when);
        musicNodes.push(src, g, hp);
    }

    function startAmbienceLoop() {
        // Subtle pad drone to fill silence.
        if (!audioCtx) return;
        clearMusicNodes(ambienceNodes);
        const o1 = audioCtx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = midiHz(33);
        const o2 = audioCtx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = midiHz(40) * 1.005;
        const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
        const g = audioCtx.createGain(); g.gain.value = 0.6;
        o1.connect(lp); o2.connect(lp); lp.connect(g).connect(ambienceGain);
        o1.start(); o2.start();
        ambienceNodes.push(o1, o2, lp, g);
    }

    function setMusicEnabled(on) {
        if (!audioCtx) return;
        if (on) {
            musicGain.gain.setTargetAtTime(musicVolume, audioCtx.currentTime, 0.2);
            ambienceGain.gain.setTargetAtTime(0.18, audioCtx.currentTime, 0.2);
        } else {
            musicGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
            ambienceGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        }
    }

    // ---------- Spin orchestration ---------- //
    let pendingResult = null;

    function lockSpin(active) {
        isSpinning = active;
        updateSpinButton();
        for (const b of betButtons) b.disabled = active || freeSpinsRemaining > 0;
    }

    async function handleSpin() {
        if (isSpinning) return;
        if (freeSpinsRemaining <= 0 && selectedBet === null) return;

        clearWinHighlights();
        bigWinBanner.hidden = true;
        for (const f of reelFrames) f.classList.remove('expanded-wild');
        playSpinClick();
        if (musicMode == null) {
            startMusic(freeSpinsRemaining > 0 ? 'fs' : 'base');
        }
        setStatus(freeSpinsRemaining > 0 ? 'Free spin spinning…' : 'Spinning…', freeSpinsRemaining > 0 ? 'fs' : 'info');
        lockSpin(true);
        startAllReels();

        socket.emit('strictly7s-spin', { bet: selectedBet });
    }

    async function handleResult(result) {
        // Stop reels with anticipation; the grid is what server returned.
        await stopAllReels(result.grid, result.expandedReels);

        // Show win highlights and counters
        if (result.wins.length > 0 || result.scatterCount >= FS_TRIGGER_COUNT) {
            highlightWins(result.wins, result.grid, result.expandedReels, result.scatterPositions);
        }

        const tier = tierForWin(result.payout, result.bet);
        playWinSound(result.payout, result.bet);

        // Update balance
        if (typeof result.balance === 'number') setBalance(result.balance);

        // Recompute FS UI before status text, since we may want to show 'Free spins start!'
        const wasFreeSpin = result.wasFreeSpin;
        const newRemaining = result.freeSpinsRemaining;

        // History
        addHistory(result.grid, result.payout, result.bet, result.freeSpinsAwarded, wasFreeSpin);

        // Status
        if (result.freeSpinsAwarded > 0 && !wasFreeSpin) {
            setStatus(`SCATTER × ${result.scatterCount}! ${result.freeSpinsAwarded} free spins (${result.payout > 0 ? '+'+result.payout+' SC' : 'no line wins'})`, 'fs');
        } else if (result.freeSpinsAwarded > 0 && wasFreeSpin) {
            setStatus(`Retrigger! +${result.freeSpinsAwarded} free spins. Win: ${result.payout} SC`, 'fs');
        } else if (result.payout > 0) {
            const tierName = tier ? `${tier.name}! ` : '';
            setStatus(`${tierName}+${result.payout} SC${wasFreeSpin ? ' (free spin)' : ''}`, tier ? 'big' : 'win');
        } else if (wasFreeSpin) {
            setStatus('No win this free spin.', 'loss');
        } else {
            setStatus('No win this time.', 'loss');
            playLoseSound();
        }

        // Big-win banner (only for non-trivial multipliers)
        const showBanner = tier && result.payout > 0;

        // Update FS state UI
        const previouslyZero = freeSpinsRemaining === 0;
        setFreeSpinUi(newRemaining);

        // Free-spin intro animation when awarded
        const playFsIntro = result.freeSpinsAwarded > 0;

        const finalize = () => {
            lockSpin(false);
            // If we're now in free spins, auto-spin after a short delay.
            if (freeSpinsRemaining > 0) {
                setTimeout(() => { if (!isSpinning) handleSpin(); }, turbo ? 350 : 800);
            } else if (!previouslyZero && newRemaining === 0) {
                // We just finished free spins
                startMusic('base');
                setStatus('Free spins complete. Choose a bet.', 'info');
            }
        };

        const continueAfterBanner = () => {
            if (playFsIntro) {
                if (freeSpinsRemaining > 0 && (previouslyZero || !wasFreeSpin)) {
                    startMusic('fs');
                }
                showFreeSpinIntro(result.freeSpinsAwarded, wasFreeSpin).then(finalize);
            } else {
                finalize();
            }
        };

        if (showBanner) {
            showBigWin(result.payout, result.bet, continueAfterBanner);
        } else {
            continueAfterBanner();
        }
    }

    // ---------- Wire UI ---------- //
    function handleBetClick(btn) {
        if (freeSpinsRemaining > 0) return;
        const v = Number(btn.getAttribute('data-bet'));
        if (!Number.isInteger(v)) return;
        selectedBet = v;
        for (const b of betButtons) b.classList.remove('active');
        btn.classList.add('active');
        updateSpinButton();
        setStatus(`Bet set to ${v} SC. Ready to spin.`, 'info');
        ensureAudio();
        if (musicMode == null) startMusic('base');
    }

    function registerPlayer() {
        const name = window.StrictHotelSocket.getPlayerName();
        if (!name) {
            setStatus('Not logged in. Set a name in the lobby first.', 'loss');
            spinBtn.disabled = true;
            return;
        }
        window.StrictHotelSocket.registerPlayer(socket, 'strictly7s');
        socket.emit('get-balance');
        socket.emit('strictly7s-state');
    }

    socket.on('connect', () => { registerPlayer(); });
    socket.on('balance-update', (data) => {
        if (data && typeof data.balance === 'number') setBalance(data.balance);
    });
    socket.on('strictly7s-free-spins', (data) => {
        if (data && typeof data.remaining === 'number') {
            setFreeSpinUi(data.remaining);
        }
    });
    socket.on('strictly7s-spin-result', (result) => {
        pendingResult = result;
        handleResult(result);
    });
    socket.on('strictly7s-error', (data) => {
        // Cancel any spin animations
        for (const a of reelAnim) {
            a.spinning = false;
            if (a.raf) cancelAnimationFrame(a.raf);
            a.raf = 0;
        }
        for (const f of reelFrames) f.classList.remove('spinning', 'anticipation');
        setInitialReels();
        lockSpin(false);
        setStatus(data?.message || 'Spin failed.', 'loss');
    });

    for (const b of betButtons) b.addEventListener('click', () => handleBetClick(b));
    spinBtn.addEventListener('click', handleSpin);
    turboBtn.addEventListener('click', () => {
        turbo = !turbo;
        turboBtn.setAttribute('aria-pressed', turbo ? 'true' : 'false');
        turboBtn.classList.toggle('on', turbo);
        turboBtn.textContent = `TURBO: ${turbo ? 'ON' : 'OFF'}`;
    });
    soundBtn.addEventListener('click', () => {
        audioEnabled = !audioEnabled;
        soundBtn.textContent = `SOUND: ${audioEnabled ? 'ON' : 'OFF'}`;
        soundBtn.classList.toggle('on', audioEnabled);
        if (audioEnabled) {
            ensureAudio();
            setMusicEnabled(true);
            if (musicMode == null) startMusic(freeSpinsRemaining > 0 ? 'fs' : 'base');
        } else {
            setMusicEnabled(false);
        }
    });
    musicSlider.addEventListener('input', (e) => {
        musicVolume = Number(e.target.value) / 100;
        if (musicGain && audioEnabled) {
            musicGain.gain.setTargetAtTime(musicVolume, audioCtx.currentTime, 0.05);
        }
    });

    setInitialReels();
    soundBtn.classList.add('on');
})();
