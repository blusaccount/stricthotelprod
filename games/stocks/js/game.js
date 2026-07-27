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
        AAPL: 'Apple entwickelt iPhone, Mac, iPad und Apple Watch und verdient zunehmend an Services wie App Store, iCloud und Apple Music. Die enge Verzahnung aus Hardware, Software und Ökosystem macht Apple zu einem der profitabelsten Unternehmen der Welt — und die Aktie zum Schwergewicht in fast jedem großen Index.',
        MSFT: 'Microsoft dominiert mit Windows und Office den Büroalltag und ist mit Azure die Nummer zwei im Cloud-Geschäft. Dazu kommen Gaming (Xbox, Activision Blizzard), LinkedIn und eine enge Partnerschaft mit OpenAI, die Microsoft an die Spitze des KI-Rennens gebracht hat.',
        NVDA: 'NVIDIA baute ursprünglich Grafikkarten für Gamer — heute sind seine KI-Chips das Rückgrat praktisch jedes großen KI-Rechenzentrums. Der KI-Boom machte NVIDIA zeitweise zum wertvollsten Unternehmen der Welt; entsprechend stark hängt die Aktie an der weiteren KI-Nachfrage.',
        TSLA: 'Tesla ist der bekannteste Elektroautobauer der Welt und betreibt daneben ein wachsendes Geschäft mit Energiespeichern und Solar. Elon Musk setzt zunehmend auf autonomes Fahren und Robotik — die Aktie schwankt traditionell heftig und wird eher wie ein Tech- als ein Autowert gehandelt.',
        AMZN: 'Amazon ist der größte Online-Händler des Westens, verdient sein eigentliches Geld aber mit der Cloud-Sparte AWS, dem Marktführer im Cloud-Computing. Dazu kommen Prime, Werbung und ein gigantisches Logistiknetz — ein Konzern, der in fast jedem Digitalmarkt mitspielt.',
        META: 'Meta betreibt Facebook, Instagram, WhatsApp und Threads und verdient sein Geld fast vollständig mit Werbung auf diesen Plattformen. Parallel investiert der Konzern Milliarden in eigene KI-Modelle und die VR-Sparte mit den Quest-Brillen.',
        GOOGL: 'Alphabet ist die Mutter von Google: Suche, YouTube, Android, Chrome und Google Cloud. Das dominante Werbegeschäft finanziert Zukunftswetten wie die Gemini-KI-Modelle und das Robotaxi-Unternehmen Waymo.',
        NFLX: 'Netflix ist der weltgrößte Streaming-Dienst mit über 300 Millionen Abonnenten und produziert einen Großteil seiner Serien und Filme selbst. Mit Werbe-Abo und dem Ende des Passwort-Teilens hat der Konzern zuletzt kräftig neue Erlösquellen erschlossen.',
        AMD: 'AMD liefert Prozessoren für PCs, Server und Spielkonsolen (PlayStation, Xbox) und greift NVIDIA bei KI-Chips an. Unter CEO Lisa Su hat sich AMD vom Übernahmekandidaten zum ernsthaften Rivalen von Intel und NVIDIA gewandelt.',
        CRM: 'Salesforce ist der weltgrößte Anbieter von Cloud-Software für Vertrieb und Kundenverwaltung (CRM); auch Slack und Tableau gehören zum Konzern. Zuletzt setzt Salesforce stark auf KI-Agenten, die Verkaufs- und Serviceaufgaben automatisieren sollen.',
        AVGO: 'Broadcom baut Chips für Netzwerke, Smartphones und KI-Rechenzentren und hat sich mit der VMware-Übernahme ein großes Software-Standbein zugelegt. Mehrere Tech-Giganten lassen bei Broadcom außerdem ihre eigenen KI-Chips entwickeln.',
        ORCL: 'Oracle ist der Datenbank-Riese der Unternehmens-IT und wandelt sich gerade zum großen Anbieter von Cloud- und KI-Rechenzentren. Milliardenschwere Verträge mit KI-Firmen haben den Software-Veteranen zurück ins Rampenlicht gebracht.',
        ADBE: 'Adobe stellt die Standard-Werkzeuge für Kreative her: Photoshop, Illustrator, Premiere — und hat das PDF-Format erfunden. Das Abo-Modell der Creative Cloud liefert planbare Einnahmen; generative KI-Bildtools sind für Adobe Chance und Bedrohung zugleich.',
        DIS: 'Disney vereint Filmstudios (Marvel, Pixar, Star Wars), weltweite Freizeitparks, den Sportsender ESPN und den Streaming-Dienst Disney+. Die Parks sind die verlässliche Gewinnmaschine, während das Streaming-Geschäft weiter um dauerhafte Profitabilität kämpft.',
        PYPL: 'PayPal ist einer der bekanntesten Online-Bezahldienste mit hunderten Millionen aktiver Konten; auch die Peer-to-Peer-App Venmo gehört dazu. Der Konkurrenzdruck durch Apple Pay, Google Pay und Co. ist in den letzten Jahren deutlich gewachsen.',
        INTC: 'Intel war jahrzehntelang der dominierende Chip-Hersteller, hat den Anschluss an TSMC und NVIDIA aber verloren. Der Konzern versucht den Turnaround über eigene Auftragsfertigung und staatliche Förderung — die Aktie ist eine klassische Comeback-Wette.',
        BA: 'Boeing ist neben Airbus einer von nur zwei großen Flugzeugbauern der Welt, dazu kommen Rüstungs- und Raumfahrtgeschäft. Qualitätsprobleme und Pannenserien haben den Konzern in die Krise gestürzt — der Auftragsbestand über Jahre hinaus bleibt trotzdem gewaltig.',
        V: 'Visa betreibt das größte Kartenzahlungsnetzwerk der Welt und verdient an fast jeder Transaktion eine kleine Gebühr mit — ohne selbst Kreditrisiko zu tragen. Ein hochprofitables „Mautstellen"-Geschäftsmodell auf dem globalen Konsum.',
        JPM: 'JPMorgan Chase ist die größte Bank der USA: Investmentbanking, Privatkunden, Kreditkarten und Vermögensverwaltung unter einem Dach. Sie gilt als der am solidesten geführte Riese der Branche und als Gradmesser für den gesamten US-Finanzsektor.',
        WMT: 'Walmart ist der umsatzstärkste Einzelhändler der Welt mit über 10.000 Filialen und einem schnell wachsenden Online- und Werbegeschäft. Als Discounter profitiert Walmart oft sogar dann, wenn die Konsumlaune kippt und Kunden aufs Geld schauen.',
        KO: 'Coca-Cola verkauft seine Getränke in praktisch jedem Land der Erde — neben der Cola auch Fanta, Sprite sowie Wasser- und Saftmarken. Ein defensiver Dividenden-Klassiker: wenig spektakuläres Wachstum, dafür extrem stabile Nachfrage in jeder Wirtschaftslage.',
        PEP: 'PepsiCo ist weit mehr als Pepsi: Mit Lay’s, Doritos, Cheetos und Quaker gehört dem Konzern ein riesiges Snack-Imperium, das mehr einbringt als das Getränkegeschäft. Wie Coca-Cola ein defensiver Konsumwert mit jahrzehntelanger Dividendenhistorie.',
        JNJ: 'Johnson & Johnson ist ein Schwergewicht bei Medikamenten und Medizintechnik; das Konsumgeschäft (Penaten, Listerine) wurde als eigene Firma abgespalten. Mit über 60 Jahren ununterbrochener Dividendenerhöhungen einer der stabilsten Zahler der Welt.',
        PG: 'Procter & Gamble steht hinter Alltagsmarken wie Gillette, Pampers, Ariel und Oral-B. Produkte, die Menschen in jeder Wirtschaftslage kaufen — die Aktie gilt deshalb als defensiver Anker fürs Depot.',
        'BRK-B': 'Berkshire Hathaway ist die Holding von Warren Buffett: Versicherungen (GEICO), die Eisenbahn BNSF, Energieversorger und ein riesiges Aktienportfolio. Quasi ein breit gestreuter Fonds in Aktienform — ohne Dividende, dafür mit legendärer Kapitaldisziplin.',
        XOM: 'ExxonMobil ist einer der größten börsennotierten Öl- und Gaskonzerne der Welt, von der Bohrung bis zur Tankstelle. Gewinn und Aktienkurs hängen direkt am Ölpreis — dafür gibt es eine der zuverlässigsten Dividenden des Sektors.',
        UNH: 'UnitedHealth ist der größte Krankenversicherer der USA und betreibt mit Optum zusätzlich Apotheken-, Daten- und Arztdienste. Das US-Gesundheitssystem wächst stetig — politische Eingriffe und Kostendebatten fahren als Risiko aber immer mit.',
        URTH: 'Dieser ETF bildet den MSCI World ab: rund 1.500 Unternehmen aus 23 Industrieländern, davon etwa 70 % aus den USA. Der Klassiker für „einfach den Weltmarkt kaufen" — maximale Streuung mit einem einzigen Papier.',
        QQQ: 'Der QQQ bildet den Nasdaq-100 ab — die 100 größten Nicht-Finanzwerte der US-Tech-Börse, angeführt von Apple, Microsoft und NVIDIA. Historisch mehr Rendite als der S&P 500, aber auch deutlich heftigere Schwankungen in Abschwüngen.',
        GDAXI: 'Der DAX ist der deutsche Leitindex mit den 40 größten börsennotierten Unternehmen des Landes — von SAP über Siemens bis Airbus. Als Performance-Index rechnet er Dividenden mit ein, was ihn im Vergleich zu anderen Indizes etwas schmeichelt.',
        DIA: 'Der DIA bildet den Dow Jones Industrial Average ab: 30 amerikanische Blue Chips im ältesten und bekanntesten US-Index (seit 1896). Kuriosum: Gewichtet wird nach Aktienkurs statt nach Firmengröße — eine historische Eigenheit.',
        SPY: 'Der SPY ist der älteste und meistgehandelte ETF der Welt und bildet den S&P 500 ab — die rund 500 wichtigsten US-Unternehmen. Für viele Anleger DER Standard-Baustein, gegen den sich fast jede andere Strategie messen lassen muss.',
        VGK: 'Dieser ETF bündelt große europäische Unternehmen aus UK, Frankreich, der Schweiz und Deutschland — darunter Nestlé, ASML, Novartis und LVMH. Eine Europa-Beimischung, die meist günstiger bewertet ist als der US-Markt.',
        EEM: 'Der EEM investiert in Schwellenländer-Aktien: China, Indien, Taiwan, Südkorea und Brasilien dominieren. Mehr Wachstumspotenzial als Industrieländer-Indizes, dafür deutlich mehr politisches und Währungsrisiko.',
        IWM: 'Der IWM bildet den Russell 2000 ab — 2.000 kleinere US-Unternehmen (Small Caps). Er reagiert sensibler auf US-Konjunktur und Zinsen als die großen Indizes und schwankt entsprechend stärker in beide Richtungen.',
        VTI: 'Der VTI kauft praktisch den kompletten US-Aktienmarkt: über 3.500 Unternehmen vom Mega-Konzern bis zum kleinen Nebenwert. Wie der S&P 500, nur noch breiter gestreut — Total-Market-Ansatz in einem Papier.',
        ARKK: 'Cathie Woods aktiv gemanagter Innovations-ETF setzt auf disruptive Technologien: Tesla, Coinbase, Roku, Gentechnik. Berühmt für den Höhenflug 2020 und den tiefen Absturz danach — ein Investment mit sehr hohem Risiko und sehr hoher Schwankung.',
        XLF: 'Sektor-ETF für US-Finanzwerte: Berkshire Hathaway, JPMorgan, Visa und Goldman Sachs sind die Schwergewichte. Profitiert tendenziell von steigenden Zinsen und einer robusten Wirtschaft.',
        XLE: 'Sektor-ETF für US-Energiekonzerne, klar dominiert von ExxonMobil und Chevron. Praktisch ein direkter Hebel auf den Ölpreis — mit den entsprechenden Ausschlägen in beide Richtungen.',
        GLD: 'Der GLD hält physisches Gold in Tresoren und bildet den Goldpreis nahezu eins zu eins ab. Der bequemste Weg, Gold ins Depot zu holen — ohne Barren im Schrank und ohne Termingeschäfte.',
        TLT: 'Der TLT hält US-Staatsanleihen mit über 20 Jahren Restlaufzeit und ist damit extrem zinssensibel. Fallen die Zinsen, steigt er kräftig — steigen sie, fällt er genauso kräftig: das klassische Instrument für Zinswetten.',
        'GC=F': 'Gold gilt seit Jahrtausenden als Wertspeicher und Krisenwährung: Steigt die Inflation oder wackeln die Börsen, flüchten Anleger ins Edelmetall. Dieser Future bildet den Preis einer Feinunze (31,1 g) in US-Dollar ab.',
        'SI=F': 'Silber ist Edelmetall und Industrierohstoff zugleich: Rund die Hälfte der Nachfrage kommt aus Solarzellen, Elektronik und Medizintechnik. Deshalb schwankt der Preis deutlich stärker als Gold — Silber gilt als „Gold auf Steroiden".',
        'PL=F': 'Platin ist seltener als Gold und steckt vor allem in Fahrzeug-Katalysatoren, Schmuck und Industrieanlagen. Die Nachfrage hängt stark an der Autoindustrie, das Angebot an wenigen Minen — vor allem in Südafrika.',
        'HG=F': 'Kupfer steckt in Stromnetzen, Elektroautos, Gebäuden und jedem Elektrogerät — der Preis gilt darum als Konjunkturbarometer („Dr. Copper"). Elektrifizierung und der Bau von KI-Rechenzentren treiben die Nachfrage langfristig zusätzlich.',
        'CL=F': 'WTI (West Texas Intermediate) ist die US-Referenzsorte für Rohöl. Der Preis reagiert auf OPEC-Entscheidungen, geopolitische Krisen und die Weltkonjunktur — kaum ein Rohstoff bewegt Märkte und Schlagzeilen so stark.',
        'BZ=F': 'Brent ist die europäische Referenzsorte für Rohöl aus der Nordsee, an der sich rund zwei Drittel des weltweiten Ölhandels orientieren. Der Preis läuft meist parallel zu WTI, in der Regel mit einem kleinen Aufschlag.',
        'NG=F': 'Dieser Future bildet den US-Erdgaspreis am Handelspunkt Henry Hub ab. Erdgas ist extrem wetterabhängig — kalte Winter und heiße Sommer treiben die Nachfrage — und gehört zu den schwankungsstärksten Rohstoffen überhaupt.',
        'BTC-USD': 'Bitcoin ist die erste und mit Abstand größte Kryptowährung — dezentral, ohne Zentralbank und fest auf 21 Millionen Stück begrenzt. Befürworter sehen darin „digitales Gold" als Schutz vor Geldentwertung; der Kurs bleibt trotzdem hochvolatil.',
        'ETH-USD': 'Ethereum ist die zweitgrößte Kryptowährung und vor allem eine Plattform: Smart Contracts, DeFi-Anwendungen, NFTs und tausende Token laufen auf ihr. Wer auf Krypto als Technologie statt nur als Wertspeicher setzt, landet meist bei Ethereum.',
        'SOL-USD': 'Solana ist eine besonders schnelle und günstige Blockchain und hat sich als Heimat von DeFi-Anwendungen und Meme-Coins etabliert. Technisch beeindruckend, aber mit einer Historie von Netzwerk-Ausfällen — Chance und Risiko liegen eng beieinander.',
        'BNB-USD': 'BNB ist der hauseigene Token der größten Krypto-Börse Binance: Er senkt dort die Handelsgebühren und ist die Basis der BNB Chain. Sein Wert hängt eng am Erfolg — und an den Rechtsrisiken — von Binance selbst.',
        'XRP-USD': 'XRP stammt vom Zahlungsunternehmen Ripple und soll internationale Überweisungen in Sekunden statt Tagen abwickeln. Der jahrelange Rechtsstreit mit der US-Börsenaufsicht hat den Kurs immer wieder bewegt — XRP ist stark nachrichtengetrieben.',
        'ADA-USD': 'Cardano ist eine forschungsgetriebene Smart-Contract-Blockchain, deren Neuerungen wissenschaftlich begutachtet werden. Das macht die Entwicklung gründlich, aber langsamer als bei der Konkurrenz — die Community gehört zu den treuesten im Kryptomarkt.',
        'DOGE-USD': 'Dogecoin startete 2013 als Parodie auf den Krypto-Hype — und wurde nicht zuletzt dank Elon Musks Tweets selbst zum Phänomen. Kein Mengenlimit, kaum Weiterentwicklung, dafür Meme-Power: der Inbegriff der Spaß-Spekulation.',
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

    // Curated blurbs are ours and stay unmarked; anything pulled from the
    // provider is credited so the language switch to English reads as
    // sourced text rather than an inconsistency.
    const setDescription = (text, fromProvider) => {
        if (!text) {
            detailDescEl.textContent = '';
            return;
        }
        detailDescEl.innerHTML = escapeHtml(text)
            + (fromProvider ? ' <span class="detail-desc-source">via Yahoo Finance</span>' : '');
    };

    const renderDetailDescription = (symbol) => {
        const curated = STOCK_DESCRIPTIONS[symbol];
        if (curated) {
            setDescription(curated, false);
            return;
        }
        const typeFallback = TYPE_DESCRIPTIONS[getStockType(symbol)] || '';
        const cached = profileCache.get(symbol);
        if (cached !== undefined) {
            setDescription(cached || typeFallback, !!cached);
            return;
        }
        setDescription(typeFallback, false);
        fetch(`/api/stock-profile?symbol=${encodeURIComponent(symbol)}`)
            .then((r) => r.json())
            .then((data) => {
                const summary = (data && typeof data.summary === 'string') ? data.summary : '';
                profileCache.set(symbol, summary);
                if (summary && detailSymbol === symbol) {
                    setDescription(summary, true);
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
                        + `<td>${escapeHtml(h.symbol)}</td>`
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
                        + `<td>${escapeHtml(h.symbol)}</td>`
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
