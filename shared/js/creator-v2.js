// ============================================================================
// PIXEL-MII CHARACTER CREATOR v2 (BETA)
//
// Parallel to /shared/js/creator.js. Layered Mii-style customization with
// pre-defined parts (head shape, eyes, mouth, hair, hat, outfit, eyewear,
// accessory) instead of free-form pixel painting.
//
// Internal canvas: 32×32. Saves config, not pixels — so changing any part
// definition propagates to every saved character automatically.
//
// Storage: 'stricthotel-character-v2' (separate from the legacy creator).
// ============================================================================

(function () {
    'use strict';

    const SIZE = 32;
    const STORAGE_KEY = 'stricthotel-character-v2';

    // ---------- Palettes ----------
    const PALETTES = {
        skin:    ['#ffd9b3','#e0a878','#a06a48','#6b4226','#00ff88','#aa00ff','#3effe1','#ff3ea5'],
        hair:    ['#1a1a1a','#5a3a1e','#aa6633','#ddaa44','#888888','#ffffff','#ff3ea5','#3effe1','#aa00ff','#ff6600'],
        outfit:  ['#00aaff','#aa00ff','#ff3ea5','#00ff88','#ffcc33','#888888','#3effe1','#ffffff','#ff3838','#1a1a1a'],
        accent:  ['#000000','#ff3ea5','#ffcc33','#3effe1','#ffffff','#aa00ff','#00ff88','#1a1a1a']
    };

    // ---------- Painting helpers ----------
    function rect(ctx, x, y, w, h, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
    }
    function fillEllipse(ctx, cx, cy, rx, ry, color) {
        ctx.fillStyle = color;
        for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
            for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
                if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) {
                    ctx.fillRect(cx + x, cy + y, 1, 1);
                }
            }
        }
    }

    // ---------- BODY (head silhouette + neck + torso) ----------
    // Layout convention used across all parts:
    //   head ........ y 4..18 (face features y 11..16)
    //   neck ........ y 18..20
    //   torso/outfit  y 20..29
    //   center ...... x = 16
    const BODY = [
        { id: 'round', label: '◯',
          draw(ctx, color) {
              fillEllipse(ctx, 16, 11, 7, 7, color);
              rect(ctx, 14, 18, 4, 2, color);
              rect(ctx, 9, 20, 14, 10, color);
          }},
        { id: 'oval', label: '⬭',
          draw(ctx, color) {
              fillEllipse(ctx, 16, 11, 6, 8, color);
              rect(ctx, 14, 18, 4, 2, color);
              rect(ctx, 9, 20, 14, 10, color);
          }},
        { id: 'square', label: '▢',
          draw(ctx, color) {
              rect(ctx, 9, 5, 14, 13, color);
              rect(ctx, 14, 18, 4, 2, color);
              rect(ctx, 9, 20, 14, 10, color);
          }},
        { id: 'alien', label: '👽',
          draw(ctx, color) {
              fillEllipse(ctx, 16, 8, 8, 5, color);
              rect(ctx, 13, 12, 7, 3, color);
              rect(ctx, 14, 15, 5, 2, color);
              rect(ctx, 15, 17, 3, 1, color);
              rect(ctx, 14, 18, 4, 2, color);
              rect(ctx, 9, 20, 14, 10, color);
          }},
        { id: 'wide', label: '⬢',
          draw(ctx, color) {
              fillEllipse(ctx, 16, 12, 8, 6, color);
              rect(ctx, 14, 18, 4, 2, color);
              rect(ctx, 8, 20, 16, 10, color);
          }}
    ];

    // ---------- EYES ----------
    // Left eye region: x=11..14, y=10..13
    // Right eye region: x=18..21, y=10..13
    const EYES = [
        { id: 'normal', label: '••',
          draw(ctx, color) {
              rect(ctx, 12, 11, 2, 2, color);
              rect(ctx, 19, 11, 2, 2, color);
          }},
        { id: 'wide', label: '◉◉',
          draw(ctx, color) {
              rect(ctx, 11, 10, 4, 4, '#ffffff');
              rect(ctx, 18, 10, 4, 4, '#ffffff');
              rect(ctx, 12, 11, 2, 2, color);
              rect(ctx, 19, 11, 2, 2, color);
              rect(ctx, 12, 11, 1, 1, '#ffffff');
              rect(ctx, 19, 11, 1, 1, '#ffffff');
          }},
        { id: 'sleepy', label: '— —',
          draw(ctx, color) {
              rect(ctx, 11, 12, 4, 1, color);
              rect(ctx, 18, 12, 4, 1, color);
          }},
        { id: 'angry', label: '╲╱',
          draw(ctx, color) {
              rect(ctx, 11, 10, 4, 1, color);
              rect(ctx, 14, 11, 1, 1, color);
              rect(ctx, 18, 10, 4, 1, color);
              rect(ctx, 18, 11, 1, 1, color);
              rect(ctx, 12, 12, 2, 1, color);
              rect(ctx, 19, 12, 2, 1, color);
          }},
        { id: 'anime', label: '⊙⊙',
          draw(ctx, color) {
              rect(ctx, 11, 10, 4, 5, '#ffffff');
              rect(ctx, 18, 10, 4, 5, '#ffffff');
              rect(ctx, 12, 11, 3, 3, color);
              rect(ctx, 19, 11, 3, 3, color);
              rect(ctx, 12, 11, 1, 1, '#ffffff');
              rect(ctx, 19, 11, 1, 1, '#ffffff');
          }},
        { id: 'dot', label: '∙∙',
          draw(ctx, color) {
              rect(ctx, 13, 12, 1, 1, color);
              rect(ctx, 20, 12, 1, 1, color);
          }},
        { id: 'star', label: '★★',
          draw(ctx, color) {
              rect(ctx, 12, 11, 3, 1, color);
              rect(ctx, 13, 10, 1, 3, color);
              rect(ctx, 19, 11, 3, 1, color);
              rect(ctx, 20, 10, 1, 3, color);
          }},
        { id: 'wink', label: '~ •',
          draw(ctx, color) {
              rect(ctx, 11, 12, 4, 1, color);
              rect(ctx, 19, 11, 2, 2, color);
          }}
    ];

    // ---------- MOUTH ----------
    // Mouth region: y=15..17
    const MOUTH = [
        { id: 'smile', label: '◡',
          draw(ctx, color) {
              rect(ctx, 13, 16, 6, 1, color);
              rect(ctx, 12, 15, 1, 1, color);
              rect(ctx, 19, 15, 1, 1, color);
          }},
        { id: 'neutral', label: '—',
          draw(ctx, color) { rect(ctx, 13, 16, 6, 1, color); }},
        { id: 'frown', label: '◠',
          draw(ctx, color) {
              rect(ctx, 13, 15, 6, 1, color);
              rect(ctx, 12, 16, 1, 1, color);
              rect(ctx, 19, 16, 1, 1, color);
          }},
        { id: 'open', label: 'O',
          draw(ctx, color) {
              rect(ctx, 13, 15, 6, 3, color);
              rect(ctx, 14, 16, 4, 1, '#aa3344');
          }},
        { id: 'tongue', label: '😛',
          draw(ctx, color) {
              rect(ctx, 13, 16, 6, 1, color);
              rect(ctx, 12, 15, 1, 1, color);
              rect(ctx, 19, 15, 1, 1, color);
              rect(ctx, 17, 17, 2, 2, '#ff3ea5');
          }},
        { id: 'smirk', label: '⌣',
          draw(ctx, color) {
              rect(ctx, 13, 16, 4, 1, color);
              rect(ctx, 17, 15, 1, 1, color);
          }},
        { id: 'fangs', label: '🦷',
          draw(ctx, color) {
              rect(ctx, 13, 16, 6, 1, color);
              rect(ctx, 14, 17, 1, 1, '#ffffff');
              rect(ctx, 17, 17, 1, 1, '#ffffff');
          }}
    ];

    // ---------- HAIR ----------
    const HAIR = [
        { id: 'none', label: '—', draw() {} },
        { id: 'short', label: 'short',
          draw(ctx, color) {
              rect(ctx, 9, 4, 14, 4, color);
              rect(ctx, 9, 8, 2, 2, color);
              rect(ctx, 21, 8, 2, 2, color);
          }},
        { id: 'long', label: 'long',
          draw(ctx, color) {
              rect(ctx, 9, 4, 14, 4, color);
              rect(ctx, 8, 6, 2, 14, color);
              rect(ctx, 22, 6, 2, 14, color);
          }},
        { id: 'mohawk', label: 'mohawk',
          draw(ctx, color) {
              rect(ctx, 14, 1, 4, 7, color);
              rect(ctx, 13, 2, 1, 5, color);
              rect(ctx, 18, 2, 1, 5, color);
          }},
        { id: 'pony', label: 'pony',
          draw(ctx, color) {
              rect(ctx, 9, 4, 14, 4, color);
              rect(ctx, 22, 7, 3, 9, color);
          }},
        { id: 'bowl', label: 'bowl',
          draw(ctx, color) {
              rect(ctx, 8, 3, 16, 6, color);
              rect(ctx, 8, 9, 2, 2, color);
              rect(ctx, 22, 9, 2, 2, color);
          }},
        { id: 'spike', label: 'spikes',
          draw(ctx, color) {
              rect(ctx, 9, 5, 14, 3, color);
              rect(ctx, 10, 2, 2, 3, color);
              rect(ctx, 14, 1, 2, 4, color);
              rect(ctx, 18, 2, 2, 3, color);
              rect(ctx, 21, 3, 2, 2, color);
          }},
        { id: 'afro', label: 'afro',
          draw(ctx, color) {
              fillEllipse(ctx, 16, 5, 9, 4, color);
              rect(ctx, 7, 5, 2, 6, color);
              rect(ctx, 23, 5, 2, 6, color);
          }},
        { id: 'bangs', label: 'bangs',
          draw(ctx, color) {
              rect(ctx, 9, 4, 14, 3, color);
              rect(ctx, 10, 7, 4, 3, color);
              rect(ctx, 18, 7, 4, 3, color);
          }},
        { id: 'tendrils', label: 'tendrils',
          draw(ctx, color) {
              rect(ctx, 11, 0, 2, 5, color);
              rect(ctx, 14, 0, 2, 4, color);
              rect(ctx, 17, 0, 2, 4, color);
              rect(ctx, 20, 0, 2, 5, color);
          }},
        { id: 'antenna', label: 'antenna',
          draw(ctx, color) {
              rect(ctx, 15, 0, 2, 5, color);
              rect(ctx, 14, 0, 1, 1, '#ffcc33');
              rect(ctx, 17, 0, 1, 1, '#ffcc33');
          }}
    ];

    // ---------- HAT ----------
    const HAT = [
        { id: 'none', label: '—', draw() {} },
        { id: 'cap', label: 'cap',
          draw(ctx, color) {
              rect(ctx, 9, 3, 14, 3, color);
              rect(ctx, 17, 6, 7, 1, color);
          }},
        { id: 'crown', label: 'crown',
          draw(ctx, color) {
              rect(ctx, 9, 4, 14, 2, color);
              rect(ctx, 9, 1, 2, 3, color);
              rect(ctx, 14, 1, 2, 3, color);
              rect(ctx, 19, 1, 2, 3, color);
              rect(ctx, 21, 1, 2, 3, color);
              rect(ctx, 14, 2, 1, 1, '#ff3ea5');
              rect(ctx, 19, 2, 1, 1, '#3effe1');
          }},
        { id: 'tophat', label: 'top hat',
          draw(ctx, color) {
              rect(ctx, 11, 0, 10, 5, color);
              rect(ctx, 9, 5, 14, 1, color);
              rect(ctx, 11, 4, 10, 1, '#ffcc33');
          }},
        { id: 'party', label: 'party',
          draw(ctx, color) {
              rect(ctx, 14, 0, 4, 1, color);
              rect(ctx, 13, 1, 6, 1, color);
              rect(ctx, 12, 2, 8, 2, color);
              rect(ctx, 11, 4, 10, 1, color);
              rect(ctx, 15, 0, 2, 1, '#ffcc33');
          }},
        { id: 'halo', label: 'halo',
          draw(ctx, color) {
              rect(ctx, 11, 1, 10, 1, color);
              rect(ctx, 10, 2, 1, 1, color);
              rect(ctx, 21, 2, 1, 1, color);
              rect(ctx, 11, 3, 10, 1, color);
          }},
        { id: 'beanie', label: 'beanie',
          draw(ctx, color) {
              rect(ctx, 9, 3, 14, 5, color);
              rect(ctx, 9, 7, 14, 1, '#ffffff');
              rect(ctx, 15, 1, 2, 2, color);
          }},
        { id: 'headband', label: 'band',
          draw(ctx, color) {
              rect(ctx, 9, 7, 14, 2, color);
              rect(ctx, 14, 5, 4, 2, color);
          }}
    ];

    // ---------- OUTFIT ----------
    const OUTFIT = [
        { id: 'plain', label: 'plain',
          draw(ctx, color) { rect(ctx, 9, 21, 14, 10, color); }},
        { id: 'collar', label: 'collar',
          draw(ctx, color) {
              rect(ctx, 9, 21, 14, 10, color);
              rect(ctx, 14, 21, 4, 3, '#ffffff');
              rect(ctx, 15, 21, 2, 7, '#1a1a1a');
          }},
        { id: 'hoodie', label: 'hoodie',
          draw(ctx, color) {
              rect(ctx, 9, 21, 14, 10, color);
              rect(ctx, 7, 18, 4, 6, color);
              rect(ctx, 21, 18, 4, 6, color);
              rect(ctx, 15, 24, 2, 4, '#000000');
          }},
        { id: 'tracksuit', label: 'tracksuit',
          draw(ctx, color) {
              rect(ctx, 9, 21, 14, 10, color);
              rect(ctx, 9, 23, 14, 1, '#ffffff');
              rect(ctx, 9, 26, 14, 1, '#ffffff');
          }},
        { id: 'robe', label: 'robe',
          draw(ctx, color) {
              rect(ctx, 7, 21, 18, 10, color);
              rect(ctx, 16, 21, 1, 10, '#ffcc33');
          }},
        { id: 'vest', label: 'vest',
          draw(ctx, color) {
              rect(ctx, 9, 21, 14, 10, color);
              rect(ctx, 12, 22, 8, 9, '#1a1a1a');
              rect(ctx, 15, 24, 2, 4, color);
          }},
        { id: 'jersey', label: 'jersey',
          draw(ctx, color) {
              rect(ctx, 9, 21, 14, 10, color);
              rect(ctx, 14, 23, 4, 3, '#ffffff');
              rect(ctx, 15, 24, 2, 1, color);
          }},
        { id: 'armor', label: 'armor',
          draw(ctx, color) {
              rect(ctx, 9, 21, 14, 10, color);
              rect(ctx, 9, 21, 1, 10, '#ffffff');
              rect(ctx, 22, 21, 1, 10, '#ffffff');
              rect(ctx, 9, 25, 14, 1, '#ffffff');
              rect(ctx, 14, 24, 4, 3, '#ffcc33');
          }}
    ];

    // ---------- EYEWEAR ----------
    const EYEWEAR = [
        { id: 'none', label: '—', draw() {} },
        { id: 'glasses', label: 'glasses',
          draw(ctx, color) {
              rect(ctx, 11, 10, 4, 1, color);
              rect(ctx, 11, 13, 4, 1, color);
              rect(ctx, 11, 11, 1, 2, color);
              rect(ctx, 14, 11, 1, 2, color);
              rect(ctx, 18, 10, 4, 1, color);
              rect(ctx, 18, 13, 4, 1, color);
              rect(ctx, 18, 11, 1, 2, color);
              rect(ctx, 21, 11, 1, 2, color);
              rect(ctx, 15, 11, 3, 1, color);
          }},
        { id: 'shades', label: 'shades',
          draw(ctx, color) {
              rect(ctx, 11, 10, 4, 4, color);
              rect(ctx, 18, 10, 4, 4, color);
              rect(ctx, 15, 11, 3, 1, color);
              rect(ctx, 11, 10, 1, 1, '#ffffff');
              rect(ctx, 18, 10, 1, 1, '#ffffff');
          }},
        { id: 'monocle', label: 'monocle',
          draw(ctx, color) {
              rect(ctx, 18, 10, 4, 1, color);
              rect(ctx, 18, 13, 4, 1, color);
              rect(ctx, 18, 11, 1, 2, color);
              rect(ctx, 21, 11, 1, 2, color);
              rect(ctx, 22, 14, 1, 4, color);
          }},
        { id: 'vr', label: 'VR',
          draw(ctx, color) {
              rect(ctx, 10, 9, 13, 5, color);
              rect(ctx, 11, 10, 4, 3, '#3effe1');
              rect(ctx, 18, 10, 4, 3, '#ff3ea5');
              rect(ctx, 9, 11, 1, 1, color);
              rect(ctx, 23, 11, 1, 1, color);
          }}
    ];

    // ---------- ACCESSORY (facial hair, earring, scarf, etc.) ----------
    const ACCESSORY = [
        { id: 'none', label: '—', draw() {} },
        { id: 'beard', label: 'beard',
          draw(ctx, color) {
              rect(ctx, 12, 17, 8, 2, color);
              rect(ctx, 13, 19, 6, 1, color);
          }},
        { id: 'mustache', label: 'mustache',
          draw(ctx, color) {
              rect(ctx, 12, 15, 8, 1, color);
              rect(ctx, 12, 14, 1, 1, color);
              rect(ctx, 19, 14, 1, 1, color);
          }},
        { id: 'goatee', label: 'goatee',
          draw(ctx, color) {
              rect(ctx, 14, 17, 4, 2, color);
          }},
        { id: 'earring', label: 'earring',
          draw(ctx, color) {
              rect(ctx, 8, 14, 1, 2, color);
              rect(ctx, 23, 14, 1, 2, color);
          }},
        { id: 'scarf', label: 'scarf',
          draw(ctx, color) {
              rect(ctx, 9, 19, 14, 2, color);
              rect(ctx, 10, 21, 4, 4, color);
          }},
        { id: 'cigar', label: 'cigar',
          draw(ctx, color) {
              rect(ctx, 19, 16, 4, 1, '#aa6633');
              rect(ctx, 23, 16, 1, 1, '#ff3838');
          }},
        { id: 'cheek', label: 'blush',
          draw(ctx, color) {
              rect(ctx, 11, 14, 2, 1, '#ff3ea5');
              rect(ctx, 20, 14, 2, 1, '#ff3ea5');
          }}
    ];

    const PARTS = {
        body:      { label: 'KÖRPER',   options: BODY,      colorPalette: PALETTES.skin   },
        outfit:    { label: 'OUTFIT',   options: OUTFIT,    colorPalette: PALETTES.outfit },
        hair:      { label: 'HAARE',    options: HAIR,      colorPalette: PALETTES.hair   },
        eyes:      { label: 'AUGEN',    options: EYES,      colorPalette: PALETTES.accent },
        mouth:     { label: 'MUND',     options: MOUTH,     colorPalette: PALETTES.accent },
        eyewear:   { label: 'BRILLE',   options: EYEWEAR,   colorPalette: PALETTES.accent },
        hat:       { label: 'HUT',      options: HAT,       colorPalette: PALETTES.outfit },
        accessory: { label: 'EXTRAS',   options: ACCESSORY, colorPalette: PALETTES.hair   }
    };

    // Render order: lowest to highest layer.
    const RENDER_ORDER = ['outfit', 'body', 'eyes', 'mouth', 'eyewear', 'accessory', 'hair', 'hat'];

    function defaultConfig() {
        return {
            body: 0,      bodyColor:      PALETTES.skin[0],
            eyes: 0,      eyesColor:      '#1a1a1a',
            mouth: 0,     mouthColor:     '#aa3344',
            hair: 1,      hairColor:      PALETTES.hair[0],
            hat: 0,       hatColor:       PALETTES.outfit[0],
            outfit: 0,    outfitColor:    PALETTES.outfit[0],
            eyewear: 0,   eyewearColor:   '#1a1a1a',
            accessory: 0, accessoryColor: PALETTES.hair[0]
        };
    }

    let config = defaultConfig();

    // ---------- Rendering ----------
    function renderOnto(ctx32) {
        ctx32.imageSmoothingEnabled = false;
        ctx32.clearRect(0, 0, SIZE, SIZE);
        for (const key of RENDER_ORDER) {
            const part = PARTS[key];
            if (!part) continue;
            const idx = config[key] || 0;
            const opt = part.options[idx];
            if (!opt || !opt.draw) continue;
            const color = config[key + 'Color'] || part.colorPalette[0];
            opt.draw(ctx32, color);
        }
    }

    function renderToCanvas(canvas, displaySize = 96) {
        canvas.width = displaySize;
        canvas.height = displaySize;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        const off = document.createElement('canvas');
        off.width = SIZE; off.height = SIZE;
        renderOnto(off.getContext('2d'));
        ctx.clearRect(0, 0, displaySize, displaySize);
        ctx.drawImage(off, 0, 0, displaySize, displaySize);
    }

    function renderToDataURL(displaySize = 96) {
        const c = document.createElement('canvas');
        renderToCanvas(c, displaySize);
        return c.toDataURL();
    }

    // ---------- Persistence ----------
    function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); }
    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            config = Object.assign(defaultConfig(), parsed);
            return true;
        } catch (e) { return false; }
    }
    function hasSaved() { return !!localStorage.getItem(STORAGE_KEY); }

    function randomize() {
        const next = defaultConfig();
        for (const key of Object.keys(PARTS)) {
            const part = PARTS[key];
            next[key] = Math.floor(Math.random() * part.options.length);
            next[key + 'Color'] = part.colorPalette[Math.floor(Math.random() * part.colorPalette.length)];
        }
        // Bias: 50% chance to skip hat / eyewear / accessory so randoms don't all wear sunglasses.
        if (Math.random() < 0.5) next.hat = 0;
        if (Math.random() < 0.5) next.eyewear = 0;
        if (Math.random() < 0.4) next.accessory = 0;
        config = next;
    }

    // ---------- UI ----------
    function showCreator(onComplete) {
        load();

        const overlay = document.createElement('div');
        overlay.id = 'creator-v2-overlay';
        overlay.innerHTML = `
            <div class="cv2-modal">
                <div class="cv2-header">
                    <div class="cv2-title">CHARAKTER ERSTELLEN <span class="cv2-beta">BETA</span></div>
                    <button class="cv2-close" id="cv2-close" type="button">×</button>
                </div>
                <div class="cv2-body">
                    <div class="cv2-preview-col">
                        <div class="cv2-preview-main"><canvas id="cv2-preview-canvas"></canvas></div>
                        <div class="cv2-preview-row">
                            <canvas id="cv2-preview-sm" title="32px"></canvas>
                            <canvas id="cv2-preview-md" title="64px"></canvas>
                            <canvas id="cv2-preview-lg" title="128px"></canvas>
                        </div>
                    </div>
                    <div class="cv2-controls-col">
                        <div class="cv2-tabs" id="cv2-tabs"></div>
                        <div class="cv2-variants" id="cv2-variants"></div>
                        <div class="cv2-color-label">FARBE</div>
                        <div class="cv2-colors" id="cv2-colors"></div>
                    </div>
                </div>
                <div class="cv2-footer">
                    <button class="cv2-btn" id="cv2-random" type="button">🎲 ZUFÄLLIG</button>
                    <button class="cv2-btn" id="cv2-reset" type="button">↺ RESET</button>
                    <div class="cv2-spacer"></div>
                    <button class="cv2-btn cv2-btn-primary" id="cv2-confirm" type="button">✓ SPEICHERN</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        let activeTab = 'body';
        const tabsEl = overlay.querySelector('#cv2-tabs');
        const variantsEl = overlay.querySelector('#cv2-variants');
        const colorsEl = overlay.querySelector('#cv2-colors');
        const previewMain = overlay.querySelector('#cv2-preview-canvas');
        const sm = overlay.querySelector('#cv2-preview-sm');
        const md = overlay.querySelector('#cv2-preview-md');
        const lg = overlay.querySelector('#cv2-preview-lg');

        function renderPreviews() {
            renderToCanvas(previewMain, 256);
            renderToCanvas(sm, 32);
            renderToCanvas(md, 64);
            renderToCanvas(lg, 128);
        }

        function renderTabs() {
            tabsEl.innerHTML = '';
            for (const key of Object.keys(PARTS)) {
                const btn = document.createElement('button');
                btn.className = 'cv2-tab' + (key === activeTab ? ' active' : '');
                btn.textContent = PARTS[key].label;
                btn.type = 'button';
                btn.addEventListener('click', () => {
                    activeTab = key;
                    renderTabs(); renderVariants(); renderColors();
                });
                tabsEl.appendChild(btn);
            }
        }

        function renderVariants() {
            variantsEl.innerHTML = '';
            const part = PARTS[activeTab];
            part.options.forEach((opt, idx) => {
                const cell = document.createElement('button');
                cell.className = 'cv2-variant' + (idx === (config[activeTab] || 0) ? ' active' : '');
                cell.type = 'button';
                cell.title = opt.label || opt.id;

                const cv = document.createElement('canvas');
                cv.width = 64; cv.height = 64;
                const cctx = cv.getContext('2d');
                cctx.imageSmoothingEnabled = false;
                const off = document.createElement('canvas');
                off.width = SIZE; off.height = SIZE;
                const octx = off.getContext('2d');
                // Faint silhouette so the variant has context.
                if (activeTab !== 'body') {
                    octx.globalAlpha = 0.25;
                    BODY[config.body || 0].draw(octx, config.bodyColor || PALETTES.skin[0]);
                    octx.globalAlpha = 1;
                }
                const partColor = config[activeTab + 'Color'] || part.colorPalette[0];
                opt.draw(octx, partColor);
                cctx.drawImage(off, 0, 0, 64, 64);
                cell.appendChild(cv);

                cell.addEventListener('click', () => {
                    config[activeTab] = idx;
                    renderPreviews(); renderVariants();
                });
                variantsEl.appendChild(cell);
            });
        }

        function renderColors() {
            colorsEl.innerHTML = '';
            const part = PARTS[activeTab];
            const palette = part.colorPalette;
            const currentColor = config[activeTab + 'Color'];
            palette.forEach((c) => {
                const dot = document.createElement('button');
                dot.className = 'cv2-color' + (c === currentColor ? ' active' : '');
                dot.style.backgroundColor = c;
                dot.type = 'button';
                dot.addEventListener('click', () => {
                    config[activeTab + 'Color'] = c;
                    renderPreviews(); renderVariants(); renderColors();
                });
                colorsEl.appendChild(dot);
            });
        }

        overlay.querySelector('#cv2-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#cv2-random').addEventListener('click', () => {
            randomize();
            renderPreviews(); renderTabs(); renderVariants(); renderColors();
        });
        overlay.querySelector('#cv2-reset').addEventListener('click', () => {
            config = defaultConfig();
            renderPreviews(); renderTabs(); renderVariants(); renderColors();
        });
        overlay.querySelector('#cv2-confirm').addEventListener('click', () => {
            save();
            overlay.remove();
            if (typeof onComplete === 'function') onComplete(Object.assign({}, config));
        });

        renderTabs();
        renderVariants();
        renderColors();
        renderPreviews();
    }

    // ---------- Public API ----------
    window.StrictHotelCreatorV2 = {
        showCreator,
        renderToCanvas,
        renderToDataURL,
        hasSaved,
        load,
        save,
        getConfig: () => Object.assign({}, config),
        setConfig: (c) => { config = Object.assign(defaultConfig(), c || {}); save(); },
        defaultConfig,
        PARTS,
        RENDER_ORDER,
        PALETTES,
        STORAGE_KEY
    };
})();
