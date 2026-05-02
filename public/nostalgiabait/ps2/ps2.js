// Playsphere 2 Startup Simulation
// Fan-inspired recreation - no official material used

(function() {
    const canvas = document.getElementById('main-canvas');
    const ctx = canvas.getContext('2d');
    const logoContainer = document.getElementById('logo-container');
    const backBtn = document.getElementById('back-btn');
    const replayBtn = document.getElementById('replay-btn');
    const clickToStart = document.getElementById('click-to-start');

    let audioCtx = null;
    let animationStarted = false;
    let time = 0;
    let phase = 0; // 0: intro fog, 1: towers rising, 2: light swirl, 3: logo
    let phaseTime = 0;

    // Particles for light swirl
    const particles = [];
    const towers = [];

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // Initialize towers (vertical pillars)
    function initTowers() {
        towers.length = 0;
        const count = 40;
        for (let i = 0; i < count; i++) {
            towers.push({
                x: (Math.random() - 0.5) * canvas.width * 2,
                z: Math.random() * 1000 + 200,
                height: Math.random() * 300 + 100,
                width: Math.random() * 20 + 5,
                brightness: Math.random() * 0.5 + 0.3,
                riseOffset: Math.random() * 2
            });
        }
        // Sort by z for proper depth rendering
        towers.sort((a, b) => b.z - a.z);
    }

    // Initialize swirl particles
    function initParticles() {
        particles.length = 0;
        for (let i = 0; i < 200; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 300 + 50;
            particles.push({
                angle: angle,
                radius: radius,
                y: (Math.random() - 0.5) * 400,
                speed: Math.random() * 0.02 + 0.01,
                size: Math.random() * 3 + 1,
                brightness: Math.random() * 0.8 + 0.2
            });
        }
    }

    // Audio: Rising synth tone
    function playStartupSound() {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // Main rising tone
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 3);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, audioCtx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(2000, audioCtx.currentTime + 3);

        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime + 2.5);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 4);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 4);

        // Ambient noise/hum
        const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 4, audioCtx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) {
            noiseData[i] = (Math.random() * 2 - 1) * 0.1;
        }

        const noiseSource = audioCtx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 200;
        noiseFilter.Q.value = 1;

        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        noiseGain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 2);
        noiseGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 4);

        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);

        noiseSource.start();

        // Woosh sound at the end
        setTimeout(() => {
            const woosh = audioCtx.createOscillator();
            const wooshGain = audioCtx.createGain();
            const wooshFilter = audioCtx.createBiquadFilter();

            woosh.type = 'sawtooth';
            woosh.frequency.setValueAtTime(1500, audioCtx.currentTime);
            woosh.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.5);

            wooshFilter.type = 'lowpass';
            wooshFilter.frequency.setValueAtTime(3000, audioCtx.currentTime);
            wooshFilter.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.5);

            wooshGain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            wooshGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

            woosh.connect(wooshFilter);
            wooshFilter.connect(wooshGain);
            wooshGain.connect(audioCtx.destination);

            woosh.start();
            woosh.stop(audioCtx.currentTime + 0.6);
        }, 3000);
    }

    // Main render loop
    function render() {
        if (!animationStarted) {
            // Draw idle state
            ctx.fillStyle = '#000810';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            requestAnimationFrame(render);
            return;
        }

        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;

        time += 0.016;
        phaseTime += 0.016;

        // Clear with dark blue
        ctx.fillStyle = '#000510';
        ctx.fillRect(0, 0, w, h);

        // Phase transitions
        if (phase === 0 && phaseTime > 1) {
            phase = 1;
            phaseTime = 0;
        } else if (phase === 1 && phaseTime > 2) {
            phase = 2;
            phaseTime = 0;
        } else if (phase === 2 && phaseTime > 1.5) {
            phase = 3;
            phaseTime = 0;
            logoContainer.classList.add('visible');
            backBtn.classList.add('visible');
            replayBtn.classList.add('visible');
        }

        // Phase 0 & 1: Fog and towers
        if (phase <= 1) {
            // Draw fog gradient
            const fogGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h));
            fogGradient.addColorStop(0, 'rgba(30, 60, 120, 0.3)');
            fogGradient.addColorStop(0.5, 'rgba(10, 30, 80, 0.2)');
            fogGradient.addColorStop(1, 'rgba(0, 10, 30, 0)');
            ctx.fillStyle = fogGradient;
            ctx.fillRect(0, 0, w, h);
        }

        // Phase 1: Rising towers
        if (phase >= 1) {
            const riseProgress = phase === 1 ? Math.min(phaseTime / 2, 1) : 1;

            towers.forEach(tower => {
                const perspective = 800 / tower.z;
                const screenX = cx + tower.x * perspective;
                const screenWidth = tower.width * perspective;

                const riseAmount = riseProgress * (1 + tower.riseOffset * 0.3);
                const screenHeight = tower.height * perspective * Math.min(riseAmount, 1);
                const screenY = cy + 100 * perspective - screenHeight;

                if (screenX > -50 && screenX < w + 50) {
                    const alpha = tower.brightness * (1 - tower.z / 1200) * riseProgress;

                    // Tower glow
                    const gradient = ctx.createLinearGradient(screenX, screenY + screenHeight, screenX, screenY);
                    gradient.addColorStop(0, `rgba(50, 100, 200, ${alpha * 0.3})`);
                    gradient.addColorStop(0.5, `rgba(80, 140, 255, ${alpha * 0.6})`);
                    gradient.addColorStop(1, `rgba(150, 200, 255, ${alpha})`);

                    ctx.fillStyle = gradient;
                    ctx.fillRect(screenX - screenWidth / 2, screenY, screenWidth, screenHeight);

                    // Top glow
                    ctx.beginPath();
                    ctx.arc(screenX, screenY, screenWidth * 2, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(150, 200, 255, ${alpha * 0.5})`;
                    ctx.fill();
                }
            });
        }

        // Phase 2: Light particle swirl
        if (phase >= 2) {
            const swirlProgress = phase === 2 ? Math.min(phaseTime / 1.5, 1) : 1;

            particles.forEach(p => {
                p.angle += p.speed * (1 + swirlProgress);

                const currentRadius = p.radius * (1 - swirlProgress * 0.8);
                const x = cx + Math.cos(p.angle) * currentRadius;
                const y = cy + p.y * (1 - swirlProgress) + Math.sin(p.angle * 2) * 20;

                const alpha = p.brightness * swirlProgress;
                const size = p.size * (1 + swirlProgress);

                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(150, 200, 255, ${alpha})`;
                ctx.fill();

                // Glow
                ctx.beginPath();
                ctx.arc(x, y, size * 3, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(100, 150, 255, ${alpha * 0.3})`;
                ctx.fill();
            });

            // Central bright light
            const centralGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 200 * swirlProgress);
            centralGlow.addColorStop(0, `rgba(200, 230, 255, ${0.8 * swirlProgress})`);
            centralGlow.addColorStop(0.3, `rgba(100, 150, 255, ${0.4 * swirlProgress})`);
            centralGlow.addColorStop(1, 'rgba(50, 100, 200, 0)');
            ctx.fillStyle = centralGlow;
            ctx.fillRect(0, 0, w, h);
        }

        // Phase 3: Fade to logo background
        if (phase === 3) {
            const fadeProgress = Math.min(phaseTime / 1, 1);
            ctx.fillStyle = `rgba(0, 5, 20, ${fadeProgress * 0.7})`;
            ctx.fillRect(0, 0, w, h);
        }

        requestAnimationFrame(render);
    }

    // Start animation on click
    function startAnimation() {
        if (animationStarted) return;
        animationStarted = true;
        clickToStart.classList.add('hidden');
        initTowers();
        initParticles();
        playStartupSound();
    }

    clickToStart.addEventListener('click', startAnimation);
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'Enter') {
            startAnimation();
        }
    });

    // Replace removed inline onclick="" handlers with proper listeners.
    if (backBtn) backBtn.addEventListener('click', () => { location.href = '/nostalgiabait/'; });
    if (replayBtn) replayBtn.addEventListener('click', () => location.reload());

    // Start render loop
    render();
})();
