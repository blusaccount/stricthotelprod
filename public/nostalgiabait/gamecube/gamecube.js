// CubeSystem 2001 Startup Simulation
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
    let phase = 0; // 0: cube rotating, 1: trails intensify, 2: flash + logo

    // Cube vertices (unit cube centered at origin)
    const cubeVertices = [
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
        [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
    ];

    // Cube edges (pairs of vertex indices)
    const cubeEdges = [
        [0, 1], [1, 2], [2, 3], [3, 0], // back face
        [4, 5], [5, 6], [6, 7], [7, 4], // front face
        [0, 4], [1, 5], [2, 6], [3, 7]  // connecting edges
    ];

    // Trail particles
    const trails = [];
    const maxTrails = 100;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // 3D rotation matrices
    function rotateX(point, angle) {
        const [x, y, z] = point;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return [x, y * cos - z * sin, y * sin + z * cos];
    }

    function rotateY(point, angle) {
        const [x, y, z] = point;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return [x * cos + z * sin, y, -x * sin + z * cos];
    }

    function rotateZ(point, angle) {
        const [x, y, z] = point;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return [x * cos - y * sin, x * sin + y * cos, z];
    }

    // Project 3D to 2D
    function project(point, scale, offsetX, offsetY) {
        const [x, y, z] = point;
        const perspective = 4 / (4 + z);
        return [
            offsetX + x * scale * perspective,
            offsetY + y * scale * perspective,
            perspective
        ];
    }

    // Audio: 3-tone chord with echo
    function playStartupSound() {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        const frequencies = [330, 440, 660]; // E4, A4, E5 - pleasant chord
        const duration = 2.5;

        // Create convolver for echo effect
        const convolver = audioCtx.createConvolver();
        const impulseLength = audioCtx.sampleRate * 0.5;
        const impulse = audioCtx.createBuffer(2, impulseLength, audioCtx.sampleRate);

        for (let channel = 0; channel < 2; channel++) {
            const data = impulse.getChannelData(channel);
            for (let i = 0; i < impulseLength; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (impulseLength * 0.2));
            }
        }
        convolver.buffer = impulse;

        const masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration);

        frequencies.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const oscGain = audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

            // Stagger the start slightly for each tone
            const startDelay = i * 0.08;
            oscGain.gain.setValueAtTime(0, audioCtx.currentTime);
            oscGain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + startDelay + 0.1);
            oscGain.gain.setValueAtTime(0.2, audioCtx.currentTime + startDelay + 0.5);
            oscGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

            osc.connect(oscGain);
            oscGain.connect(masterGain);
            oscGain.connect(convolver);

            osc.start(audioCtx.currentTime + startDelay);
            osc.stop(audioCtx.currentTime + duration + 0.5);
        });

        // Echo wet signal
        const wetGain = audioCtx.createGain();
        wetGain.gain.value = 0.3;
        convolver.connect(wetGain);
        wetGain.connect(audioCtx.destination);

        // Dry signal
        masterGain.connect(audioCtx.destination);

        // Final "ding" at the end
        setTimeout(() => {
            const ding = audioCtx.createOscillator();
            const dingGain = audioCtx.createGain();

            ding.type = 'sine';
            ding.frequency.setValueAtTime(880, audioCtx.currentTime);

            dingGain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            dingGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);

            ding.connect(dingGain);
            dingGain.connect(audioCtx.destination);

            ding.start();
            ding.stop(audioCtx.currentTime + 1);
        }, 2000);
    }

    // Add trail particle
    function addTrail(x, y, hue) {
        trails.push({
            x: x,
            y: y,
            hue: hue,
            alpha: 1,
            size: 3 + Math.random() * 2
        });

        if (trails.length > maxTrails) {
            trails.shift();
        }
    }

    // Main render loop
    function render() {
        if (!animationStarted) {
            // Draw idle state
            ctx.fillStyle = '#050008';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            requestAnimationFrame(render);
            return;
        }

        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;

        time += 0.016;

        // Phase transitions
        if (phase === 0 && time > 1.5) {
            phase = 1;
        } else if (phase === 1 && time > 2.5) {
            phase = 2;
            logoContainer.classList.add('visible');
            backBtn.classList.add('visible');
            replayBtn.classList.add('visible');
        }

        // Clear with dark purple
        ctx.fillStyle = phase === 2 ? '#0a0010' : '#050008';
        ctx.fillRect(0, 0, w, h);

        // Update and draw trails
        for (let i = trails.length - 1; i >= 0; i--) {
            const trail = trails[i];
            trail.alpha -= 0.03;

            if (trail.alpha <= 0) {
                trails.splice(i, 1);
                continue;
            }

            ctx.beginPath();
            ctx.arc(trail.x, trail.y, trail.size * trail.alpha, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${trail.hue}, 100%, 70%, ${trail.alpha * 0.5})`;
            ctx.fill();

            // Glow
            ctx.beginPath();
            ctx.arc(trail.x, trail.y, trail.size * trail.alpha * 3, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${trail.hue}, 100%, 50%, ${trail.alpha * 0.2})`;
            ctx.fill();
        }

        // Draw cube only in phases 0 and 1
        if (phase < 2) {
            // Rotation angles
            const rotX = time * 0.8;
            const rotY = time * 1.2;
            const rotZ = time * 0.5;

            const scale = Math.min(w, h) * 0.15;

            // Transform vertices
            const transformedVertices = cubeVertices.map(v => {
                let point = [...v];
                point = rotateX(point, rotX);
                point = rotateY(point, rotY);
                point = rotateZ(point, rotZ);
                return project(point, scale, cx, cy);
            });

            // Intensity based on phase
            const intensity = phase === 1 ? 1 + (time - 1.5) * 2 : 1;

            // Draw edges with color shift
            cubeEdges.forEach((edge, i) => {
                const [v1, v2] = edge;
                const [x1, y1, p1] = transformedVertices[v1];
                const [x2, y2, p2] = transformedVertices[v2];

                // Hue shifts over time (purple to pink range)
                const hue = 270 + Math.sin(time * 2 + i * 0.5) * 30;

                // Line thickness based on perspective
                const avgPerspective = (p1 + p2) / 2;
                const lineWidth = 2 + avgPerspective * 3 * intensity;

                // Draw edge
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = `hsla(${hue}, 100%, ${50 + intensity * 20}%, ${0.6 + avgPerspective * 0.4})`;
                ctx.lineWidth = lineWidth;
                ctx.lineCap = 'round';
                ctx.stroke();

                // Glow effect
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${0.2 * intensity})`;
                ctx.lineWidth = lineWidth * 3;
                ctx.stroke();

                // Add trails from vertices
                if (Math.random() < 0.3 * intensity) {
                    addTrail(x1, y1, hue);
                    addTrail(x2, y2, hue);
                }
            });

            // Draw vertices as glowing points
            transformedVertices.forEach(([x, y, p], i) => {
                const hue = 270 + Math.sin(time * 3 + i) * 30;
                const size = 4 + p * 4 * intensity;

                // Core
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${hue}, 100%, 80%, 0.9)`;
                ctx.fill();

                // Glow
                const gradient = ctx.createRadialGradient(x, y, 0, x, y, size * 4);
                gradient.addColorStop(0, `hsla(${hue}, 100%, 70%, 0.5)`);
                gradient.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
                ctx.beginPath();
                ctx.arc(x, y, size * 4, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();
            });
        }

        // Flash effect at phase transition
        if (phase === 2 && time < 2.7) {
            const flashProgress = (time - 2.5) / 0.2;
            const flashAlpha = Math.max(0, 1 - flashProgress);
            ctx.fillStyle = `rgba(200, 150, 255, ${flashAlpha * 0.8})`;
            ctx.fillRect(0, 0, w, h);
        }

        // Ambient particles in background
        ctx.fillStyle = 'rgba(150, 100, 200, 0.3)';
        for (let i = 0; i < 20; i++) {
            const px = (Math.sin(time * 0.5 + i * 0.8) * 0.5 + 0.5) * w;
            const py = (Math.cos(time * 0.3 + i * 1.1) * 0.5 + 0.5) * h;
            const size = 1 + Math.sin(time + i) * 0.5;
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fill();
        }

        requestAnimationFrame(render);
    }

    // Start animation on click
    function startAnimation() {
        if (animationStarted) return;
        animationStarted = true;
        time = 0;
        clickToStart.classList.add('hidden');
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
