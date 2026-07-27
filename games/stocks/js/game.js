// ============================
// STOCK MARKET GAME – Client
// ============================

(function () {
    'use strict';

    const socket = io();
    const $ = (id) => document.getElementById(id);

    // ============================
    // DEBUG LOGGING
    // Toggle in console with window.STOCK_DEBUG = false
    // ============================
    window.STOCK_DEBUG = window.STOCK_DEBUG !== false;
    const dlog = (...args) => { if (window.STOCK_DEBUG) console.log('[stocks]', ...args); };
    const dwarn = (...args) => { if (window.STOCK_DEBUG) console.warn('[stocks]', ...args); };
    const dgroup = (label, payload) => {
        if (!window.STOCK_DEBUG) return;
        console.groupCollapsed('[stocks] ' + label);
        if (payload !== undefined) console.log(payload);
        console.groupEnd();
    };
    dlog('module init at', new Date().toISOString());

    const balanceEl = $('balance-display');
    const portfolioValueEl = $('portfolio-value');
    const portfolioGainEl = $('portfolio-gain');
    const portfolioCashEl = $('portfolio-cash');
    const portfolioNetEl = $('portfolio-net');
    const holdingsContainer = $('holdings-container');
    const moversGrid = $('movers-grid');
    const marketStatusEl = $('market-status');
    const mainView = $('main-view');
    const detailView = $('detail-view');
    const tradeOverlay = $('trade-overlay');
    const tradeTitleEl = $('trade-title');
    const tradePriceEl = $('trade-price');
    const tradeAmountEl = $('trade-amount');
    const tradePreviewEl = $('trade-preview');
    const tradeConfirmEl = $('trade-confirm');
    const tradeCancelEl = $('trade-cancel');
    const toastEl = $('stock-toast');
    const searchInput = $('stock-search');
    const searchResults = $('search-results');

    // Category maps for filtering
    const ETF_SYMBOLS = [
        'URTH', 'QQQ', 'GDAXI', 'DIA', 'SPY', 'VGK', 'EEM',
        'IWM', 'VTI', 'ARKK', 'XLF', 'XLE', 'GLD', 'TLT'
    ];
    const COMMODITY_SYMBOLS = [
        'GC=F', 'SI=F', 'PL=F', 'HG=F', 'CL=F', 'BZ=F', 'NG=F'
    ];
    const CRYPTO_SYMBOLS = [
        'BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD', 'ADA-USD', 'DOGE-USD'
    ];

    let currentBalance = 0;
    // Live board quotes from /api/ticker. Starts empty on purpose: no
    // hardcoded fantasy prices — the server serves real (DB-cached) quotes
    // even on cold starts, and the UI shows a loading state until then.
    let marketData = [];
    let portfolioData = { holdings: [], totalValue: 0 };
    let tradeSide = 'buy';
    let tradeSymbol = '';
    let tradeStock = null;
    let searchDebounce = null;
    // Quotes for searched symbols that aren't on the ticker board. Kept
    // separately so the 60s /api/ticker refresh doesn't wipe them out of
    // marketData (the trade modal and detail view look prices up there).
    const customQuotes = new Map(); // symbol -> quote

    // --- Register with server ---
    const register = () => {
        const name = window.StrictHotelSocket.getPlayerName();
        if (!name) return;
        window.StrictHotelSocket.registerPlayer(socket, 'stocks');
    };

    socket.on('connect', () => {
        dlog('socket connected, id=', socket.id);
        register();
    });
    socket.on('disconnect', (reason) => dwarn('socket disconnect:', reason));
    socket.on('connect_error', (err) => dwarn('socket connect_error:', err && err.message));

    // --- Balance ---
    socket.on('balance-update', (data) => {
        dlog('event: balance-update', data);
        if (data && typeof data.balance === 'number') {
            currentBalance = data.balance;
            balanceEl.textContent = formatNumber(data.balance);
            portfolioCashEl.textContent = formatNumber(data.balance);
            updateNetWorth();
        }
    });

    // --- Portfolio ---
    socket.on('stock-portfolio', (data) => {
        dgroup('event: stock-portfolio', data);
        if (!data) { dwarn('stock-portfolio: empty payload'); return; }
        if (Array.isArray(data.holdings)) {
            const total = data.holdings.length;
            const stale = data.holdings.filter(h => h.priceStale).length;
            const live = total - stale;
            dlog(`holdings: ${total} total, ${live} live, ${stale} stale`);
            for (const h of data.holdings) {
                dlog(`  ${h.symbol.padEnd(10)} shares=${h.shares} avg=${h.avgCost} price=${h.currentPrice} value=${h.marketValue} G/L=${h.gainLoss} (${h.gainLossPct}%) stale=${!!h.priceStale}`);
            }
        }
        portfolioData = data;
        renderPortfolio();
        updateNetWorth();
        if (detailSymbol) renderDetailPosition();
    });

    // --- Errors ---
    socket.on('stock-error', (data) => {
        dwarn('event: stock-error', data);
        showToast(data.error || 'Error', 'error');
    });

    // --- Fetch market data ---
    const fetchMarket = () => {
        dlog('fetchMarket: GET /api/ticker');
        const t0 = performance.now();
        fetch('/api/ticker')
            .then((r) => {
                dlog(`fetchMarket: HTTP ${r.status} (${Math.round(performance.now() - t0)}ms)`);
                return r.json();
            })
            .then((data) => {
                if (Array.isArray(data) && data.length > 0) {
                    dlog(`fetchMarket: got ${data.length} quotes; e.g.`, data[0]);
                    const boardSymbols = new Set(data.map((q) => q.symbol));
                    marketData = data;
                    for (const [sym, q] of customQuotes) {
                        if (!boardSymbols.has(sym)) marketData.push(q);
                    }
                    renderMovers();
                    updateMarketStatus(data);
                    if (detailSymbol) refreshDetailQuote();
                } else {
                    dwarn('fetchMarket: empty/invalid response, keeping fallback data', data);
                }
            })
            .catch((err) => { dwarn('fetchMarket: fetch failed', err && err.message); });
    };

    // --- Market status indicator ---
    const updateMarketStatus = (data) => {
        if (!marketStatusEl) return;
        // Derive US market status from a well-known US stock
        const usStock = data.find((q) => q.symbol === 'AAPL' || q.symbol === 'MSFT');
        if (!usStock || !usStock.marketState) {
            marketStatusEl.style.display = 'none';
            return;
        }
        const state = usStock.marketState;
        let cls = 'closed';
        let label = 'US MARKET CLOSED';
        if (state === 'REGULAR') {
            cls = 'open';
            label = 'US MARKET OPEN';
        } else if (state === 'PRE' || state === 'PREPRE') {
            // PREPRE = extended pre-market (Yahoo Finance)
            cls = 'pre';
            label = 'US MARKET PRE-MARKET';
        } else if (state === 'POST' || state === 'POSTPOST') {
            // POSTPOST = extended after-hours (Yahoo Finance)
            cls = 'post';
            label = 'US MARKET AFTER-HOURS';
        }
        marketStatusEl.className = 'market-status ' + cls;
        marketStatusEl.innerHTML = '<span class="status-dot"></span>' + label;
        marketStatusEl.style.display = 'block';
    };

    // --- Determine asset type ---
    const getStockType = (symbol) => {
        if (COMMODITY_SYMBOLS.indexOf(symbol) >= 0) return 'COMMODITY';
        if (CRYPTO_SYMBOLS.indexOf(symbol) >= 0) return 'CRYPTO';
        if (ETF_SYMBOLS.indexOf(symbol) >= 0) return 'ETF';
        return 'STOCK';
    };

    // --- Asset icons ---
    // No flag emojis: Windows renders them as plain letters.
    const STOCK_ICONS = {
        AAPL: '🍎', MSFT: '🪟', NVDA: '🎮', TSLA: '🚗', AMZN: '📦', META: '👥',
        GOOGL: '🔍', NFLX: '🎬', AMD: '🖥️', CRM: '☁️', AVGO: '📡', ORCL: '🗄️',
        ADBE: '🎨', DIS: '🏰', PYPL: '💸', INTC: '💻', BA: '✈️', V: '💳',
        JPM: '🏦', WMT: '🛒', KO: '🥤', PEP: '🍿', JNJ: '💊', PG: '🧼',
        'BRK-B': '🎩', XOM: '⛽', UNH: '🏥',
        URTH: '🌍', QQQ: '🤖', GDAXI: '🥨', DIA: '🏭', SPY: '🦅', VGK: '🥐',
        EEM: '🌏', IWM: '🐭', VTI: '🗽', ARKK: '🚀', XLF: '💰', XLE: '⚡',
        GLD: '🥇', TLT: '🏛️',
        'GC=F': '🥇', 'SI=F': '🥈', 'PL=F': '💍', 'HG=F': '🥉',
        'CL=F': '🛢️', 'BZ=F': '🛢️', 'NG=F': '🔥',
        'BTC-USD': '🟠', 'ETH-USD': '🔷', 'SOL-USD': '🟣', 'BNB-USD': '🟡',
        'XRP-USD': '💧', 'ADA-USD': '🔵', 'DOGE-USD': '🐕',
    };
    const TYPE_ICONS = { STOCK: '🏢', ETF: '🧺', COMMODITY: '⛏️', CRYPTO: '🪙' };
    const getStockIcon = (symbol) => STOCK_ICONS[symbol] || TYPE_ICONS[getStockType(symbol)] || '🏢';

    // Short curated blurbs for every board symbol (German — that's the
    // player base). Searched symbols outside the board get a live company
    // profile from /api/stock-profile instead.
    const STOCK_DESCRIPTIONS = {
        AAPL: 'iPhone, Mac und App Store: das wertvollste Konsumelektronik-Unternehmen der Welt.',
        MSFT: 'Windows, Office und die Azure-Cloud — dazu ein großer Anteil an OpenAI.',
        NVDA: 'Marktführer bei Grafik- und KI-Chips, das Herz des KI-Booms.',
        TSLA: 'Elektroautos, Energiespeicher und Robotik von Elon Musk.',
        AMZN: 'Weltgrößter Online-Händler und mit AWS Marktführer im Cloud-Geschäft.',
        META: 'Facebook, Instagram und WhatsApp — verdient mit Werbung, investiert in KI und VR.',
        GOOGL: 'Google-Mutter Alphabet: Suche, YouTube, Android und Cloud.',
        NFLX: 'Weltgrößter Streaming-Dienst mit über 300 Mio. Abonnenten.',
        AMD: 'Prozessoren und Grafikchips — schärfster Konkurrent von NVIDIA und Intel.',
        CRM: 'Salesforce: weltgrößter Anbieter von Cloud-Software für Kundenverwaltung.',
        AVGO: 'Broadcom: Chips für Netzwerke, Smartphones und KI-Rechenzentren plus Software.',
        ORCL: 'Datenbank-Riese, inzwischen groß im Cloud- und KI-Rechenzentrumsgeschäft.',
        ADBE: 'Photoshop, Illustrator und PDF: die Standard-Software für Kreative.',
        DIS: 'Disney: Filmstudios, Freizeitparks, Marvel, Star Wars und Disney+.',
        PYPL: 'Online-Bezahldienst mit über 400 Mio. aktiven Konten.',
        INTC: 'Traditionsreicher Chip-Hersteller im Umbau — kämpft um den Anschluss.',
        BA: 'Boeing: einer von zwei großen Flugzeugbauern der Welt, dazu Rüstung und Raumfahrt.',
        V: 'Visa: das weltgrößte Zahlungsnetzwerk — verdient an fast jeder Kartenzahlung mit.',
        JPM: 'Die größte Bank der USA: Investmentbanking, Privatkunden, Vermögensverwaltung.',
        WMT: 'Weltgrößter Einzelhändler nach Umsatz, mit stark wachsendem Online-Geschäft.',
        KO: 'Coca-Cola: das bekannteste Getränke-Portfolio der Welt, ein Dividenden-Klassiker.',
        PEP: 'PepsiCo: Getränke plus Snack-Imperium (Lay’s, Doritos, Quaker).',
        JNJ: 'Pharma- und Medizintechnik-Konzern, einer der stabilsten Dividendenzahler.',
        PG: 'Procter & Gamble: Alltagsmarken wie Gillette, Pampers und Ariel.',
        'BRK-B': 'Warren Buffetts Holding: Versicherungen, Eisenbahn, Energie und ein riesiges Aktienportfolio.',
        XOM: 'ExxonMobil: einer der größten Öl- und Gaskonzerne der Welt.',
        UNH: 'Größter US-Krankenversicherer mit angeschlossenen Gesundheitsdiensten.',
        URTH: 'ETF auf den MSCI World: rund 1.500 Unternehmen aus 23 Industrieländern in einem Papier.',
        QQQ: 'ETF auf den Nasdaq-100: die 100 größten Tech-lastigen US-Unternehmen.',
        GDAXI: 'Der deutsche Leitindex: die 40 größten börsennotierten Unternehmen Deutschlands.',
        DIA: 'ETF auf den Dow Jones: 30 US-Blue-Chips, der älteste US-Aktienindex.',
        SPY: 'Der größte ETF der Welt: bildet den S&P 500 mit den 500 wichtigsten US-Unternehmen ab.',
        VGK: 'ETF auf europäische Aktien: große Unternehmen aus UK, Frankreich, Deutschland und Co.',
        EEM: 'ETF auf Schwellenländer: China, Indien, Taiwan, Brasilien und weitere Emerging Markets.',
        IWM: 'ETF auf den Russell 2000: 2.000 kleinere US-Unternehmen (Small Caps).',
        VTI: 'ETF auf den kompletten US-Aktienmarkt: über 3.500 Unternehmen von groß bis klein.',
        ARKK: 'Aktiv gemanagter Innovations-ETF (Cathie Wood): disruptive Tech, hohes Risiko, hohe Schwankung.',
        XLF: 'Sektor-ETF für US-Finanzwerte: Banken, Versicherer, Zahlungsdienstleister.',
        XLE: 'Sektor-ETF für US-Energie: vor allem Öl- und Gasriesen wie Exxon und Chevron.',
        GLD: 'ETF, der physisches Gold hält: Goldpreis-Investment ohne eigenen Tresor.',
        TLT: 'ETF auf US-Staatsanleihen mit 20+ Jahren Laufzeit — reagiert stark auf Zinsänderungen.',
        'GC=F': 'Gold-Future: der Preis einer Feinunze Gold, klassischer Krisen- und Inflationsschutz.',
        'SI=F': 'Silber-Future: Edelmetall mit starker Industrienachfrage (Solar, Elektronik) — schwankt stärker als Gold.',
        'PL=F': 'Platin-Future: seltenes Edelmetall für Katalysatoren und Schmuck.',
        'HG=F': 'Kupfer-Future: das Industriemetall schlechthin und Konjunkturbarometer der Weltwirtschaft.',
        'CL=F': 'WTI-Rohöl-Future: der US-Referenzpreis für Öl.',
        'BZ=F': 'Brent-Rohöl-Future: der europäische Referenzpreis für Öl aus der Nordsee.',
        'NG=F': 'Erdgas-Future (Henry Hub): der US-Gaspreis, stark wetter- und saisonabhängig.',
        'BTC-USD': 'Die erste und größte Kryptowährung — auf 21 Mio. Stück begrenzt, oft „digitales Gold" genannt.',
        'ETH-USD': 'Zweitgrößte Kryptowährung und die Plattform für Smart Contracts, DeFi und NFTs.',
        'SOL-USD': 'Schnelle, günstige Blockchain — beliebt für DeFi und Meme-Coins.',
        'BNB-USD': 'Der Token der größten Krypto-Börse Binance.',
        'XRP-USD': 'Ripples Token für schnelle, günstige internationale Zahlungen.',
        'ADA-USD': 'Cardano: forschungsgetriebene Smart-Contract-Blockchain.',
        'DOGE-USD': 'Die Meme-Kryptowährung: 2013 als Witz gestartet, von Elon Musk groß gemacht.',
    };
    const TYPE_DESCRIPTIONS = {
        STOCK: 'Einzelaktie.',
        ETF: 'Börsengehandelter Indexfonds (ETF).',
        COMMODITY: 'Rohstoff-Future.',
        CRYPTO: 'Kryptowährung.',
    };

    // --- Top Movers (replaces the full market grid; search finds the rest) ---
    const MOVERS_COUNT = 8;
    const renderMovers = () => {
        if (marketData.length === 0) {
            moversGrid.innerHTML = '<div class="no-holdings">Loading market data...</div>';
            return;
        }
        const movers = marketData
            .filter((q) => typeof q.pct === 'number' && !customQuotes.has(q.symbol))
            .slice()
            .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
            .slice(0, MOVERS_COUNT);

        moversGrid.innerHTML = movers.map((q) => {
            const up = q.change >= 0;
            const type = getStockType(q.symbol);
            return `<div class="stock-card" data-symbol="${escapeAttr(q.symbol)}">`
                + `<span class="type-badge">${type}</span>`
                + `<div class="stock-card-header">`
                + `<div><div class="symbol">${getStockIcon(q.symbol)} ${escapeHtml(q.symbol)}</div>`
                + `<div class="name">${escapeHtml(q.name)}</div></div>`
                + `<div style="text-align:right"><div class="price">$${formatNumber(q.price)}</div>`
                + `<div class="change ${up ? 'up' : 'down'}">`
                + `${formatNumber(Math.abs(q.change))}`
                + ` (${up ? '+' : ''}${formatNumber(q.pct)}%)</div></div>`
                + `</div></div>`;
        }).join('');

        const cards = moversGrid.querySelectorAll('.stock-card');
        for (let i = 0; i < cards.length; i++) {
            cards[i].addEventListener('click', function () {
                openDetail(this.getAttribute('data-symbol'));
            });
        }
    };

    // --- Search ---
    // German search terms players actually type, mapped onto the English
    // ticker-board names ("Öl" finds Crude Oil, "Silber" finds Silver).
    const SEARCH_ALIASES = {
        'öl': 'oil', 'oel': 'oil', 'rohöl': 'crude', 'erdöl': 'crude',
        'silber': 'silver', 'kupfer': 'copper', 'platin': 'platinum',
        'erdgas': 'natural gas', 'weizen': 'wheat', 'welt': 'world',
        'anleihen': 'treasury', 'staatsanleihen': 'treasury',
    };

    const localSearch = (query) => {
        const q = query.toLowerCase();
        const terms = [q];
        if (SEARCH_ALIASES[q]) terms.push(SEARCH_ALIASES[q]);
        const matches = [];
        for (const quote of marketData) {
            if (customQuotes.has(quote.symbol)) continue;
            const symbol = quote.symbol.toLowerCase();
            const name = (quote.name || '').toLowerCase();
            const type = getStockType(quote.symbol).toLowerCase();
            if (terms.some((t) => symbol.indexOf(t) >= 0 || name.indexOf(t) >= 0 || type === t)) {
                matches.push(quote);
            }
        }
        return matches.slice(0, 8);
    };

    const searchResultRow = (r) => {
        return `<div class="search-result-item" data-symbol="${escapeAttr(r.symbol)}" data-name="${escapeAttr(r.name)}">`
            + `<div><span class="search-result-icon">${getStockIcon(r.symbol)}</span>`
            + `<span class="search-result-symbol">${escapeHtml(r.symbol)}</span> `
            + `<span class="search-result-name">${escapeHtml(r.name)}</span></div>`
            + (typeof r.price === 'number'
                ? `<span class="search-result-price">$${formatNumber(r.price)}</span>`
                : `<span class="search-result-type">${escapeHtml(r.type || '')}</span>`)
            + `</div>`;
    };

    const attachSearchResultClicks = () => {
        const items = searchResults.querySelectorAll('.search-result-item[data-symbol]');
        for (let si = 0; si < items.length; si++) {
            items[si].addEventListener('click', function () {
                const sym = this.getAttribute('data-symbol');
                const name = this.getAttribute('data-name');
                searchInput.value = '';
                searchResults.classList.remove('active');
                openDetail(sym, { name });
            });
        }
    };

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        clearTimeout(searchDebounce);
        if (!query) {
            searchResults.classList.remove('active');
            searchResults.innerHTML = '';
            return;
        }

        // Local board matches render instantly; remote results append.
        const local = localSearch(query);
        if (local.length > 0) {
            searchResults.innerHTML = local.map(searchResultRow).join('');
            searchResults.classList.add('active');
            attachSearchResultClicks();
        }

        searchDebounce = setTimeout(() => {
            fetch(`/api/stock-search?q=${encodeURIComponent(query)}`)
                .then((r) => r.json())
                .then((results) => {
                    const localNow = localSearch(query);
                    const seen = new Set(localNow.map((l) => l.symbol));
                    const remote = (Array.isArray(results) ? results : [])
                        .filter((r) => !seen.has(r.symbol));
                    const merged = localNow.concat(remote);
                    if (merged.length === 0) {
                        searchResults.innerHTML = '<div class="search-result-item" style="color:var(--ds-text-dim);cursor:default;">No results</div>';
                        searchResults.classList.add('active');
                        return;
                    }
                    searchResults.innerHTML = merged.map(searchResultRow).join('');
                    searchResults.classList.add('active');
                    attachSearchResultClicks();
                })
                .catch(() => {
                    if (localSearch(query).length === 0) {
                        searchResults.innerHTML = '<div class="search-result-item" style="color:var(--ds-text-dim);cursor:default;">Search failed</div>';
                        searchResults.classList.add('active');
                    }
                });
        }, 300);
    });

    // Close search results on click outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('active');
        }
    });

    // --- Detail Subpage ---
    const detailIconEl = $('detail-icon');
    const detailSymbolEl = $('detail-symbol');
    const detailNameEl = $('detail-name');
    const detailTypeEl = $('detail-type');
    const detailPriceEl = $('detail-price');
    const detailChangeEl = $('detail-change');
    const detailInfoEl = $('detail-info');
    const detailPositionEl = $('detail-position');
    const detailChartCanvas = $('detail-chart');
    const detailChartEmpty = $('detail-chart-empty');
    const rangeTabsEl = $('range-tabs');

    let detailSymbol = null;
    let detailRange = '1mo';
    let detailChart = null;
    let detailHistorySeq = 0; // guards against out-of-order range responses

    const findQuote = (symbol) => marketData.find((q) => q.symbol === symbol);

    const openDetail = (symbol, hint, fromHistory) => {
        const wasOpen = detailSymbol !== null;
        detailSymbol = symbol;
        dlog('openDetail', symbol);

        // Wire the subpage into browser history so back (button or phone
        // gesture) returns to the overview instead of leaving the app.
        // Switching detail->detail replaces the entry: back always closes.
        if (!fromHistory) {
            try {
                if (wasOpen) {
                    history.replaceState({ stocksDetail: symbol }, '', location.href);
                } else {
                    history.pushState({ stocksDetail: symbol }, '', location.href);
                }
            } catch (_) {}
        }

        const quote = findQuote(symbol);
        detailIconEl.textContent = getStockIcon(symbol);
        detailSymbolEl.textContent = symbol;
        detailNameEl.textContent = (quote && quote.name) || (hint && hint.name) || symbol;
        detailTypeEl.textContent = getStockType(symbol);
        renderDetailQuote(quote);
        renderDetailPosition();
        renderDetailDescription(symbol);

        mainView.hidden = true;
        detailView.hidden = false;
        window.scrollTo(0, 0);

        if (!quote) {
            // Searched symbol that isn't on the board — fetch a live quote so
            // price display and the trade modal work.
            fetch(`/api/stock-quote?symbol=${encodeURIComponent(symbol)}`)
                .then((r) => r.json())
                .then((data) => {
                    if (data.error || detailSymbol !== symbol) return;
                    customQuotes.set(data.symbol, data);
                    if (!findQuote(data.symbol)) marketData.push(data);
                    detailNameEl.textContent = data.name || symbol;
                    renderDetailQuote(data);
                })
                .catch(() => { dwarn('detail quote fetch failed for', symbol); });
        }

        loadDetailHistory();
    };

    const closeDetail = (fromPopstate) => {
        detailSymbol = null;
        detailView.hidden = true;
        mainView.hidden = false;
        // BACK button: consume the history entry we pushed so the next
        // browser-back doesn't re-close an already-closed detail view.
        if (fromPopstate !== true && history.state && history.state.stocksDetail) {
            try { history.back(); } catch (_) {}
        }
    };

    window.addEventListener('popstate', (e) => {
        const stateSymbol = e.state && e.state.stocksDetail;
        if (detailSymbol && !stateSymbol) {
            closeDetail(true);
        } else if (stateSymbol && stateSymbol !== detailSymbol) {
            // Forward-navigation back into a previously opened detail page
            openDetail(stateSymbol, null, true);
        }
    });

    const renderDetailQuote = (quote) => {
        if (!quote) {
            detailPriceEl.textContent = '$---';
            detailChangeEl.textContent = '';
            detailChangeEl.className = 'detail-change';
            return;
        }
        detailPriceEl.textContent = `$${formatNumber(quote.price)}`;
        if (typeof quote.change === 'number' && typeof quote.pct === 'number') {
            const up = quote.change >= 0;
            detailChangeEl.textContent = `${up ? '+' : '-'}${formatNumber(Math.abs(quote.change))} (${up ? '+' : ''}${formatNumber(quote.pct)}%)`;
            detailChangeEl.className = `detail-change ${up ? 'up' : 'down'}`;
        } else {
            detailChangeEl.textContent = '';
            detailChangeEl.className = 'detail-change';
        }
    };

    const refreshDetailQuote = () => {
        renderDetailQuote(findQuote(detailSymbol));
    };

    const detailDescEl = $('detail-desc');
    const profileCache = new Map(); // symbol -> summary string ('' = none found)

    const renderDetailDescription = (symbol) => {
        const curated = STOCK_DESCRIPTIONS[symbol];
        if (curated) {
            detailDescEl.textContent = curated;
            return;
        }
        const cached = profileCache.get(symbol);
        if (cached !== undefined) {
            detailDescEl.textContent = cached || TYPE_DESCRIPTIONS[getStockType(symbol)] || '';
            return;
        }
        detailDescEl.textContent = TYPE_DESCRIPTIONS[getStockType(symbol)] || '';
        fetch(`/api/stock-profile?symbol=${encodeURIComponent(symbol)}`)
            .then((r) => r.json())
            .then((data) => {
                const summary = (data && typeof data.summary === 'string') ? data.summary : '';
                profileCache.set(symbol, summary);
                if (summary && detailSymbol === symbol) {
                    detailDescEl.textContent = summary;
                }
            })
            .catch(() => { profileCache.set(symbol, ''); });
    };

    const infoCard = (label, value) => {
        return `<div class="summary-card"><div class="summary-label">${label}</div>`
            + `<div class="summary-value">${value}</div></div>`;
    };

    const renderDetailInfo = (history) => {
        const cards = [];
        const meta = history && history.meta;
        // Note: meta.previousClose is deliberately not shown — for ranges
        // beyond 1d Yahoo reports the close before the range START, which
        // reads as nonsense next to the live price.
        if (meta && meta.fiftyTwoWeekHigh != null) cards.push(infoCard('52W HIGH', `$${formatNumber(meta.fiftyTwoWeekHigh)}`));
        if (meta && meta.fiftyTwoWeekLow != null) cards.push(infoCard('52W LOW', `$${formatNumber(meta.fiftyTwoWeekLow)}`));
        if (history && history.points.length >= 2) {
            const first = history.points[0].c;
            const last = history.points[history.points.length - 1].c;
            if (first > 0) {
                const pct = ((last - first) / first) * 100;
                const label = rangeTabsEl.querySelector(`[data-range="${history.range}"]`);
                cards.push(infoCard(`${label ? label.textContent : history.range} CHANGE`, `${pct >= 0 ? '+' : ''}${formatNumber(pct)}%`));
            }
        }
        cards.push(infoCard('CURRENCY', escapeHtml((history && history.currency) || 'USD')));
        if (meta && meta.exchangeName) cards.push(infoCard('EXCHANGE', escapeHtml(meta.exchangeName)));
        detailInfoEl.innerHTML = cards.join('');
    };

    const renderDetailPosition = () => {
        if (!detailSymbol) return;
        const pos = (portfolioData.holdings || []).find((h) => h.symbol === detailSymbol);
        if (!pos) {
            detailPositionEl.innerHTML = '<div class="no-holdings">You don\'t own this yet.</div>';
            return;
        }
        const stale = !!pos.priceStale;
        const cls = pos.gainLoss >= 0 ? 'positive' : 'negative';
        const glCell = stale ? '—'
            : `${pos.gainLoss >= 0 ? '+' : ''}${formatNumber(pos.gainLoss)} (${pos.gainLossPct >= 0 ? '+' : ''}${formatNumber(pos.gainLossPct)}%)`;
        detailPositionEl.innerHTML = '<table class="holdings-table"><thead><tr>'
            + '<th>SHARES</th><th>AVG</th><th>VALUE</th><th>G/L</th>'
            + '</tr></thead><tbody><tr>'
            + `<td>${formatNumber(pos.shares, 4)}</td>`
            + `<td>$${formatNumber(pos.avgCost)}</td>`
            + `<td>${stale ? '—' : '$' + formatNumber(pos.marketValue)}</td>`
            + `<td class="${stale ? '' : cls}">${glCell}</td>`
            + '</tr></tbody></table>';
    };

    const formatHistoryLabel = (ts, range) => {
        const d = new Date(ts);
        if (range === '1d' || range === '5d') {
            return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        }
        if (range === '1y' || range === '5y') {
            return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear().toString().slice(2)}`;
        }
        return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.`;
    };

    const renderDetailChart = (history) => {
        const labels = history.points.map((p) => formatHistoryLabel(p.t, history.range));
        const values = history.points.map((p) => p.c);
        const up = values[values.length - 1] >= values[0];
        const lineColor = up ? '#22bb22' : '#bb2222';

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
        const textColor = isDark ? '#a0a0a0' : '#666666';

        detailChartEmpty.style.display = 'none';
        detailChartCanvas.style.display = 'block';

        if (detailChart) {
            detailChart.data.labels = labels;
            detailChart.data.datasets[0].data = values;
            detailChart.data.datasets[0].borderColor = lineColor;
            detailChart.options.scales.x.ticks.color = textColor;
            detailChart.options.scales.y.ticks.color = textColor;
            detailChart.options.scales.x.grid.color = gridColor;
            detailChart.options.scales.y.grid.color = gridColor;
            detailChart.update('none');
            return;
        }

        detailChart = new Chart(detailChartCanvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Price',
                    data: values,
                    borderColor: lineColor,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    tension: 0.15
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        titleFont: { family: "'DotGothic16', monospace", size: 13 },
                        bodyFont: { family: "'DotGothic16', monospace", size: 13 },
                        callbacks: {
                            label: (ctx) => `$${formatNumber(ctx.parsed.y)}`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            font: { family: "'DotGothic16', monospace", size: 12 },
                            color: textColor,
                            maxTicksLimit: 7
                        },
                        grid: { color: gridColor }
                    },
                    y: {
                        ticks: {
                            font: { family: "'DotGothic16', monospace", size: 12 },
                            color: textColor,
                            callback: (v) => `$${v}`
                        },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    };

    const loadDetailHistory = () => {
        const symbol = detailSymbol;
        const range = detailRange;
        const seq = ++detailHistorySeq;
        dlog('loadDetailHistory', symbol, range);
        fetch(`/api/stock-history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`)
            .then((r) => r.json())
            .then((history) => {
                if (seq !== detailHistorySeq || detailSymbol !== symbol) return;
                if (!history || history.error || !Array.isArray(history.points) || history.points.length < 2) {
                    detailChartCanvas.style.display = 'none';
                    detailChartEmpty.style.display = 'block';
                    renderDetailInfo(null);
                    return;
                }
                renderDetailChart(history);
                renderDetailInfo(history);
            })
            .catch(() => {
                if (seq !== detailHistorySeq) return;
                detailChartCanvas.style.display = 'none';
                detailChartEmpty.style.display = 'block';
                renderDetailInfo(null);
            });
    };

    rangeTabsEl.addEventListener('click', (e) => {
        const tab = e.target.closest('.category-tab');
        if (!tab) return;
        detailRange = tab.getAttribute('data-range');
        const tabs = rangeTabsEl.querySelectorAll('.category-tab');
        for (let i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', tabs[i] === tab);
        }
        loadDetailHistory();
    });

    $('detail-back').addEventListener('click', closeDetail);
    $('detail-buy').addEventListener('click', () => { if (detailSymbol) openTrade(detailSymbol, 'buy'); });
    $('detail-sell').addEventListener('click', () => { if (detailSymbol) openTrade(detailSymbol, 'sell'); });

    // Header back arrow — contextual: an open detail page closes first;
    // from the overview it walks the browser history (in the shell that is
    // the previously visited app). Falls back to the lobby.
    let headerBackSound = null;
    $('header-back').addEventListener('click', () => {
        try {
            if (!headerBackSound) {
                headerBackSound = new Audio('/userinput/switch.mp3');
                headerBackSound.volume = 0.12;
                headerBackSound.preload = 'auto';
            }
            headerBackSound.currentTime = 0;
            headerBackSound.play().catch(() => {});
        } catch (_) {}
        if (detailSymbol) {
            closeDetail();
            return;
        }
        if (history.length > 1) {
            history.back();
        } else {
            window.location.href = '/';
        }
    });

    // --- Render Portfolio Holdings ---
    const renderPortfolio = () => {
        const h = portfolioData.holdings;
        portfolioValueEl.textContent = formatNumber(portfolioData.totalValue);

        let totalGain = 0;
        let anyStale = false;
        for (let i = 0; i < h.length; i++) {
            if (h[i].priceStale) anyStale = true;
            else totalGain += h[i].gainLoss;
        }
        dlog('renderPortfolio:', h.length, 'holdings,', anyStale ? 'SOME STALE' : 'all live', 'totalValue=$' + portfolioData.totalValue, 'sumGain=' + totalGain);
        if (anyStale && totalGain === 0) {
            portfolioGainEl.textContent = '—';
            portfolioGainEl.className = 'summary-value';
        } else {
            portfolioGainEl.textContent = (totalGain >= 0 ? '+' : '') + formatNumber(totalGain)
                + (anyStale ? ' *' : '');
            portfolioGainEl.className = `summary-value ${totalGain >= 0 ? 'positive' : 'negative'}`;
        }

        if (h.length === 0) {
            holdingsContainer.innerHTML = '<div class="no-holdings">No investments yet.</div>';
            return;
        }

        let html = '<table class="holdings-table"><thead><tr>'
            + '<th>SYMBOL</th><th>SHARES</th><th>AVG</th><th>PRICE</th>'
            + '<th>VALUE</th><th>G/L</th><th></th>'
            + '</tr></thead><tbody>';

        for (let j = 0; j < h.length; j++) {
            const p = h[j];
            const cls = p.gainLoss >= 0 ? 'positive' : 'negative';
            const stale = !!p.priceStale;
            const priceCell = stale ? '—' : `$${formatNumber(p.currentPrice)}`;
            const valueCell = stale ? '—' : `$${formatNumber(p.marketValue)}`;
            const glCell = stale
                ? '<span title="Live-Kurs nicht verfügbar">—</span>'
                : `${p.gainLoss >= 0 ? '+' : ''}${formatNumber(p.gainLoss)} (${p.gainLossPct >= 0 ? '+' : ''}${formatNumber(p.gainLossPct)}%)`;
            const glCls = stale ? '' : cls;
            html += `<tr data-symbol="${escapeAttr(p.symbol)}" style="cursor:pointer">`
                + `<td class="symbol"><span class="holding-icon">${getStockIcon(p.symbol)}</span>${escapeHtml(p.symbol)}<br><span class="holding-name">${escapeHtml(p.name)}</span></td>`
                + `<td>${formatNumber(p.shares, 4)}</td>`
                + `<td>$${formatNumber(p.avgCost)}</td>`
                + `<td>${priceCell}</td>`
                + `<td>${valueCell}</td>`
                + `<td class="${glCls}">${glCell}</td>`
                + `<td><button class="btn-sell-row" data-symbol="${escapeAttr(p.symbol)}">SELL</button></td>`
                + `</tr>`;
        }

        html += '</tbody></table>';
        holdingsContainer.innerHTML = html;

        // Attach sell buttons
        const btns = holdingsContainer.querySelectorAll('.btn-sell-row');
        for (let k = 0; k < btns.length; k++) {
            btns[k].addEventListener('click', function (e) {
                e.stopPropagation();
                openTrade(this.getAttribute('data-symbol'), 'sell');
            });
        }
        // Row click opens the detail subpage (sell button stops propagation)
        const rows = holdingsContainer.querySelectorAll('tbody tr[data-symbol]');
        for (let k = 0; k < rows.length; k++) {
            rows[k].addEventListener('click', function () {
                openDetail(this.getAttribute('data-symbol'));
            });
        }
    };

    const updateNetWorth = () => {
        const net = currentBalance + portfolioData.totalValue;
        portfolioNetEl.textContent = formatNumber(net);
    };

    // --- Trade Modal ---
    const openTrade = (symbol, side) => {
        tradeSymbol = symbol;
        tradeStock = marketData.find((q) => q.symbol === symbol);
        if (!tradeStock) return;

        tradeSide = side || 'buy';
        tradeTitleEl.textContent = `${tradeStock.symbol} - ${tradeStock.name}`;
        tradePriceEl.textContent = `Current: $${formatNumber(tradeStock.price)}`;
        tradeAmountEl.value = '';
        tradePreviewEl.textContent = '';

        // Update tab state
        const tabs = tradeOverlay.querySelectorAll('.trade-tab');
        for (let i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', tabs[i].getAttribute('data-side') === tradeSide);
        }

        tradeOverlay.classList.add('active');
        tradeAmountEl.focus();
    };

    const closeTrade = () => {
        tradeOverlay.classList.remove('active');
        tradeSymbol = '';
        tradeStock = null;
    };

    // Tab switching
    const tabs = tradeOverlay.querySelectorAll('.trade-tab');
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].addEventListener('click', function () {
            tradeSide = this.getAttribute('data-side');
            for (let j = 0; j < tabs.length; j++) {
                tabs[j].classList.toggle('active', tabs[j] === this);
            }
            updatePreview();
        });
    }

    // Amount input → preview
    tradeAmountEl.addEventListener('input', updatePreview);

    function updatePreview() {
        if (!tradeStock) return;
        const amount = parseFloat(tradeAmountEl.value);
        if (!amount || amount <= 0) {
            tradePreviewEl.textContent = '';
            return;
        }
        const shares = amount / tradeStock.price;
        if (tradeSide === 'buy') {
            tradePreviewEl.textContent = `BUY ~${formatNumber(shares, 4)} shares for ${formatNumber(amount)} SC`;
        } else {
            tradePreviewEl.textContent = `SELL ~${formatNumber(shares, 4)} shares for ${formatNumber(amount)} SC`;
        }
    }

    // Confirm
    tradeConfirmEl.addEventListener('click', () => {
        if (!tradeStock) return;
        const amount = parseFloat(tradeAmountEl.value);
        if (!amount || amount <= 0) {
            showToast('Enter an amount', 'error');
            return;
        }

        const event = tradeSide === 'buy' ? 'stock-buy' : 'stock-sell';
        socket.emit(event, { symbol: tradeSymbol, amount: amount });

        showToast(tradeSide === 'buy'
            ? `Buying ${tradeSymbol}...`
            : `Selling ${tradeSymbol}...`, 'success');
        closeTrade();
    });

    // Cancel
    tradeCancelEl.addEventListener('click', closeTrade);
    tradeOverlay.addEventListener('click', (e) => {
        if (e.target === tradeOverlay) closeTrade();
    });

    // --- Toast ---
    let toastTimer = null;
    const showToast = (msg, type) => {
        toastEl.textContent = msg;
        toastEl.className = `stock-toast show ${type || 'success'}`;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toastEl.classList.remove('show');
        }, 3000);
    };

    // --- Utilities ---
    const escapeHtml = (str) => {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    };

    const escapeAttr = (str) => {
        return str.replace(/[&"'<>]/g, (c) => {
            return { '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' }[c];
        });
    };

    const formatNumber = (num, decimals = 2) => {
        return num.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    };

    const leaderboardAvatarHtml = (player) => {
        if (player.character && player.character.dataURL) {
            return `<img class="leaderboard-avatar" src="${escapeAttr(player.character.dataURL)}" alt="${escapeAttr(player.name)}">`;
        }
        return '<span class="leaderboard-avatar-placeholder">👽</span>';
    };

    // --- Leaderboard ---
    const leaderboardContainer = $('leaderboard-container');
    const performanceLeaderboardContainer = $('performance-leaderboard-container');
    const refreshBtn = $('refresh-leaderboard');
    const myName = window.StrictHotelSocket.getPlayerName();

    socket.on('stock-leaderboard', (data) => {
        dgroup('event: stock-leaderboard (' + (Array.isArray(data) ? data.length : '?') + ' players)', data);
        if (!Array.isArray(data)) { dwarn('stock-leaderboard: not an array'); return; }
        for (const p of data) {
            const total = (p.holdings || []).length;
            const stale = (p.holdings || []).filter(h => h.priceStale).length;
            dlog(`  ${p.name.padEnd(20)} portfolio=$${p.portfolioValue} cash=$${p.cash} net=$${p.netWorth} holdings=${total} (stale=${stale})`);
        }
        renderLeaderboard(data);
    });

    socket.on('stock-performance-leaderboard', (data) => {
        dgroup('event: stock-performance-leaderboard (' + (Array.isArray(data) ? data.length : '?') + ' players)', data);
        if (!Array.isArray(data)) { dwarn('stock-performance-leaderboard: not an array'); return; }
        renderPerformanceLeaderboard(data);
    });

    const renderLeaderboard = (players) => {
        if (players.length === 0) {
            leaderboardContainer.innerHTML = '<div class="no-holdings">No player portfolios yet.</div>';
            return;
        }

        let html = '';
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            const isMe = p.name === myName;
            let holdingsHtml = '';

            if (p.holdings && p.holdings.length > 0) {
                holdingsHtml = '<table class="leaderboard-detail-table"><thead><tr>'
                    + '<th>SYMBOL</th><th>SHARES</th><th>VALUE</th><th>G/L</th>'
                    + '</tr></thead><tbody>';
                for (let j = 0; j < p.holdings.length; j++) {
                    const h = p.holdings[j];
                    const stale = !!h.priceStale;
                    const cls = stale ? '' : (h.gainLoss >= 0 ? 'positive' : 'negative');
                    const valueCell = stale ? '—' : `$${formatNumber(h.marketValue)}`;
                    const glCell = stale ? '—' : `${h.gainLoss >= 0 ? '+' : ''}${formatNumber(h.gainLoss)}`;
                    holdingsHtml += `<tr>`
                        + `<td style="font-weight:700;">${escapeHtml(h.symbol)}</td>`
                        + `<td>${formatNumber(h.shares, 4)}</td>`
                        + `<td>${valueCell}</td>`
                        + `<td class="${cls}">${glCell}</td>`
                        + `</tr>`;
                }
                holdingsHtml += '</tbody></table>';
            } else {
                holdingsHtml = '<div style="color:var(--ds-text-dim);font-size:7px;padding:4px 0;">No holdings</div>';
            }

            html += `<div class="leaderboard-card">`
                + `<div class="leaderboard-header">`
                + `<span class="leaderboard-rank">#${i + 1}</span>`
                + leaderboardAvatarHtml(p)
                + `<span class="leaderboard-name${isMe ? ' is-you' : ''}">`
                + `${escapeHtml(p.name)}${isMe ? ' (YOU)' : ''}</span>`
                + `<div class="leaderboard-stats">`
                + `<div class="leaderboard-networth">$${formatNumber(p.portfolioValue)}</div>`
                + `<div class="leaderboard-breakdown">Cash: $${formatNumber(p.cash)} | Net Worth: $${formatNumber(p.netWorth)}</div>`
                + `</div>`
                + `</div>`
                + `<div class="leaderboard-detail">${holdingsHtml}</div>`
                + `</div>`;
        }

        leaderboardContainer.innerHTML = html;
    };

    const renderPerformanceLeaderboard = (players) => {
        if (!performanceLeaderboardContainer) return;
        if (players.length === 0) {
            performanceLeaderboardContainer.innerHTML = '<div class="no-holdings">No active trade performance yet.</div>';
            return;
        }

        let html = '';
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            const isMe = p.name === myName;
            const cls = p.openPnl >= 0 ? 'positive' : 'negative';

            let holdingsHtml = '';
            if (p.holdings && p.holdings.length > 0) {
                holdingsHtml = '<table class="leaderboard-detail-table"><thead><tr>'
                    + '<th>SYMBOL</th><th>SHARES</th><th>VALUE</th><th>G/L</th>'
                    + '</tr></thead><tbody>';
                for (let j = 0; j < p.holdings.length; j++) {
                    const h = p.holdings[j];
                    const stale = !!h.priceStale;
                    const gainLossCls = stale ? '' : (h.gainLoss >= 0 ? 'positive' : 'negative');
                    const valueCell = stale ? '—' : `$${formatNumber(h.marketValue)}`;
                    const glCell = stale ? '—' : `${h.gainLoss >= 0 ? '+' : ''}${formatNumber(h.gainLoss)}`;
                    holdingsHtml += `<tr>`
                        + `<td style="font-weight:700;">${escapeHtml(h.symbol)}</td>`
                        + `<td>${formatNumber(h.shares, 4)}</td>`
                        + `<td>${valueCell}</td>`
                        + `<td class="${gainLossCls}">${glCell}</td>`
                        + `</tr>`;
                }
                holdingsHtml += '</tbody></table>';
            } else {
                holdingsHtml = '<div style="color:var(--ds-text-dim);font-size:7px;padding:4px 0;">No holdings</div>';
            }

            html += `<div class="leaderboard-card">`
                + `<div class="leaderboard-header">`
                + `<span class="leaderboard-rank">#${i + 1}</span>`
                + leaderboardAvatarHtml(p)
                + `<span class="leaderboard-name${isMe ? ' is-you' : ''}">`
                + `${escapeHtml(p.name)}${isMe ? ' (YOU)' : ''}</span>`
                + `<div class="leaderboard-stats">`
                + `<div class="leaderboard-networth ${cls}">`
                + `${p.performancePct >= 0 ? '+' : ''}${formatNumber(p.performancePct)}%</div>`
                + `<div class="leaderboard-breakdown">`
                + `PnL: ${p.openPnl >= 0 ? '+' : ''}$${formatNumber(Math.abs(p.openPnl))}`
                + ` | Base: $${formatNumber(p.investedCapital)}`
                + `</div>`
                + `</div>`
                + `</div>`
                + `<div class="leaderboard-detail">${holdingsHtml}</div>`
                + `</div>`;
        }

        performanceLeaderboardContainer.innerHTML = html;
    };

    // Event delegation for leaderboard card expand/collapse
    const toggleLeaderboardCard = (e) => {
        const card = e.target.closest('.leaderboard-card');
        if (card) {
            card.classList.toggle('expanded');
        }
    };

    leaderboardContainer.addEventListener('click', toggleLeaderboardCard);
    performanceLeaderboardContainer.addEventListener('click', toggleLeaderboardCard);

    refreshBtn.addEventListener('click', () => {
        socket.emit('stock-get-leaderboard');
    });

    // --- Portfolio Performance Chart ---
    const chartCanvas = $('portfolio-chart');
    const chartEmpty = $('chart-empty');
    let portfolioChart = null;

    socket.on('stock-portfolio-history', (data) => {
        if (!Array.isArray(data) || data.length < 2) {
            chartCanvas.style.display = 'none';
            chartEmpty.style.display = 'block';
            return;
        }
        chartEmpty.style.display = 'none';
        chartCanvas.style.display = 'block';
        renderChart(data);
    });

    const renderChart = (snapshots) => {
        const labels = snapshots.map((s) => {
            const d = new Date(s.ts);
            return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        });
        const netWorthData = snapshots.map((s) => s.netWorth);
        const portfolioValueData = snapshots.map((s) => s.portfolioValue);
        const cashData = snapshots.map((s) => s.cash);

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
        const textColor = isDark ? '#a0a0a0' : '#666666';

        if (portfolioChart) {
            portfolioChart.data.labels = labels;
            portfolioChart.data.datasets[0].data = netWorthData;
            portfolioChart.data.datasets[1].data = portfolioValueData;
            portfolioChart.data.datasets[2].data = cashData;
            portfolioChart.options.scales.x.ticks.color = textColor;
            portfolioChart.options.scales.y.ticks.color = textColor;
            portfolioChart.options.scales.x.grid.color = gridColor;
            portfolioChart.options.scales.y.grid.color = gridColor;
            portfolioChart.update('none');
            return;
        }

        portfolioChart = new Chart(chartCanvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Net Worth',
                        data: netWorthData,
                        borderColor: isDark ? '#eaeaea' : '#222222',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 2,
                        pointHoverRadius: 4,
                        tension: 0.3
                    },
                    {
                        label: 'Portfolio',
                        data: portfolioValueData,
                        borderColor: isDark ? '#6699cc' : '#336699',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        pointRadius: 1,
                        pointHoverRadius: 3,
                        tension: 0.3,
                        borderDash: [4, 2]
                    },
                    {
                        label: 'Cash',
                        data: cashData,
                        borderColor: isDark ? '#88aa88' : '#448844',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        pointRadius: 1,
                        pointHoverRadius: 3,
                        tension: 0.3,
                        borderDash: [2, 2]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        labels: {
                            font: { family: "'DotGothic16', monospace", size: 13 },
                            color: textColor,
                            boxWidth: 12,
                            padding: 8
                        }
                    },
                    tooltip: {
                        titleFont: { family: "'DotGothic16', monospace", size: 13 },
                        bodyFont: { family: "'DotGothic16', monospace", size: 13 },
                        callbacks: {
                            label: (ctx) => {
                                return `${ctx.dataset.label}: $${formatNumber(ctx.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            font: { family: "'DotGothic16', monospace", size: 12 },
                            color: textColor,
                            maxTicksLimit: 8
                        },
                        grid: { color: gridColor }
                    },
                    y: {
                        ticks: {
                            font: { family: "'DotGothic16', monospace", size: 12 },
                            color: textColor,
                            callback: (v) => { return `$${v}`; }
                        },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    };

    const requestPortfolioRefresh = (reason) => {
        dlog('emit stock-get-portfolio (', reason, ')');
        socket.emit('stock-get-portfolio');
        dlog('emit stock-get-leaderboard (', reason, ')');
        socket.emit('stock-get-leaderboard');
    };

    // Console helpers — call from devtools:
    //   __stocks.refresh()  → request fresh portfolio + leaderboard
    //   __stocks.ticker()   → fetch /api/ticker and print
    //   __stocks.diag()     → server-side cache + last Yahoo error
    //   __stocks.probe()    → force a live Yahoo call on the server right now
    //   __stocks.state()    → dump current client state
    window.__stocks = {
        refresh: () => requestPortfolioRefresh('manual'),
        ticker: () => fetch('/api/ticker').then(r => r.json()).then(d => { console.log('/api/ticker →', d); return d; }),
        diag: () => fetch('/api/_stock-diag').then(r => r.json()).then(d => { console.log('/api/_stock-diag →', d); return d; }),
        probe: () => fetch('/api/_stock-diag?probe=1').then(r => r.json()).then(d => { console.log('/api/_stock-diag?probe=1 →', d); return d; }),
        state: () => ({ currentBalance, portfolioData, marketDataSample: marketData.slice(0, 3) }),
    };
    dlog('console helpers: window.__stocks.{refresh,ticker,diag,probe,state}; toggle logs with window.STOCK_DEBUG=false');

    // --- Init ---
    renderMovers();
    fetchMarket();
    // Landing on a history entry whose state says a detail page was open
    // (e.g. browser-forward back into the app) — restore it.
    if (history.state && history.state.stocksDetail) {
        openDetail(history.state.stocksDetail, null, true);
    }
    setInterval(() => {
        fetchMarket();
        requestPortfolioRefresh('60s tick');
    }, 60 * 1000);

    socket.on('connect', () => {
        setTimeout(() => requestPortfolioRefresh('post-connect'), 500);
    });
})();
