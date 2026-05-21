// ============================================================
// Food Guessr — Dish Catalog (~100 dishes from around the world)
// Image is fetched lazily via Wikipedia REST API (page summary)
// using the wikiTitle slug. CORS-enabled — works in browser.
// ============================================================

window.FG_DISHES = [
    // ─────────── ITALY ───────────
    { name: "Pizza Margherita", wikiTitle: "Pizza", country: "Italy", emoji: "🍕",
      description: "Flat bread baked in a wood-fired oven, topped with tomato, mozzarella and basil." },
    { name: "Spaghetti Carbonara", wikiTitle: "Carbonara", country: "Italy", emoji: "🍝",
      description: "Pasta with eggs, hard cheese, cured pork (guanciale) and black pepper." },
    { name: "Lasagne", wikiTitle: "Lasagne", country: "Italy", emoji: "🍲",
      description: "Layered pasta sheets baked with ragù, béchamel and cheese." },
    { name: "Risotto alla Milanese", wikiTitle: "Risotto", country: "Italy", emoji: "🍚",
      description: "Slow-cooked short-grain rice with broth, butter and parmesan — often saffron-yellow." },
    { name: "Tiramisu", wikiTitle: "Tiramisu", country: "Italy", emoji: "🍰",
      description: "Layered coffee-soaked ladyfingers with mascarpone cream and cocoa." },
    { name: "Gnocchi", wikiTitle: "Gnocchi", country: "Italy", emoji: "🥟",
      description: "Soft potato (or semolina) dumplings, usually served with sauce." },

    // ─────────── FRANCE ───────────
    { name: "Croissant", wikiTitle: "Croissant", country: "France", emoji: "🥐",
      description: "Crescent-shaped, buttery, flaky laminated pastry." },
    { name: "Ratatouille", wikiTitle: "Ratatouille", country: "France", emoji: "🍆",
      description: "Stewed summer vegetables — eggplant, zucchini, tomato, pepper — from Provence." },
    { name: "Coq au Vin", wikiTitle: "Coq_au_vin", country: "France", emoji: "🍗",
      description: "Chicken braised in red wine with lardons, mushrooms and onions." },
    { name: "Crêpe Suzette", wikiTitle: "Crêpe", country: "France", emoji: "🥞",
      description: "Very thin pancake, sweet or savoury — Suzette flambéed in orange liqueur." },
    { name: "Macaron", wikiTitle: "Macaron", country: "France", emoji: "🍪",
      description: "Two almond-meringue shells sandwiched with ganache or buttercream." },
    { name: "Quiche Lorraine", wikiTitle: "Quiche", country: "France", emoji: "🥧",
      description: "Open pastry tart with egg-cream custard, lardons and sometimes cheese." },

    // ─────────── SPAIN ───────────
    { name: "Paella Valenciana", wikiTitle: "Paella", country: "Spain", emoji: "🥘",
      description: "Saffron rice cooked in a wide shallow pan with rabbit, chicken or seafood." },
    { name: "Gazpacho", wikiTitle: "Gazpacho", country: "Spain", emoji: "🍅",
      description: "Cold raw-vegetable soup of tomato, cucumber, pepper and bread, from Andalusia." },
    { name: "Tortilla Española", wikiTitle: "Spanish_omelette", country: "Spain", emoji: "🥚",
      description: "Thick omelette of eggs, potatoes and onion — served in wedges." },
    { name: "Churros", wikiTitle: "Churro", country: "Spain", emoji: "🍩",
      description: "Fried-dough sticks dusted with sugar, dipped in thick hot chocolate." },

    // ─────────── GREECE ───────────
    { name: "Moussaka", wikiTitle: "Moussaka", country: "Greece", emoji: "🍆",
      description: "Layered eggplant, ground-lamb ragù and béchamel, baked golden." },
    { name: "Tzatziki", wikiTitle: "Tzatziki", country: "Greece", emoji: "🥒",
      description: "Strained-yoghurt dip with cucumber, garlic and olive oil." },
    { name: "Souvlaki", wikiTitle: "Souvlaki", country: "Greece", emoji: "🍢",
      description: "Small skewered cubes of marinated grilled meat, served with pita." },

    // ─────────── GERMANY ───────────
    { name: "Bratwurst", wikiTitle: "Bratwurst", country: "Germany", emoji: "🌭",
      description: "Pan-fried or grilled pork sausage, usually served with mustard and bread." },
    { name: "Currywurst", wikiTitle: "Currywurst", country: "Germany", emoji: "🌭",
      description: "Sliced sausage topped with a curry-spiced tomato sauce." },
    { name: "Pretzel", wikiTitle: "Pretzel", country: "Germany", emoji: "🥨",
      description: "Knotted lye-bath bread with a glossy mahogany crust and coarse salt." },

    // ─────────── AUSTRIA ───────────
    { name: "Wiener Schnitzel", wikiTitle: "Wiener_schnitzel", country: "Austria", emoji: "🍖",
      description: "Thinly pounded breaded veal cutlet, pan-fried golden." },
    { name: "Sachertorte", wikiTitle: "Sachertorte", country: "Austria", emoji: "🎂",
      description: "Dense chocolate cake with apricot jam and a dark chocolate glaze." },

    // ─────────── SWITZERLAND ───────────
    { name: "Cheese Fondue", wikiTitle: "Fondue", country: "Switzerland", emoji: "🧀",
      description: "Melted cheese (Gruyère, Vacherin) with wine — dipped with bread cubes on forks." },

    // ─────────── BELGIUM ───────────
    { name: "Belgian Waffle", wikiTitle: "Belgian_waffle", country: "Belgium", emoji: "🧇",
      description: "Crisp, deep-pocketed leavened waffle, often dusted with powdered sugar." },

    // ─────────── NETHERLANDS ───────────
    { name: "Stroopwafel", wikiTitle: "Stroopwafel", country: "Netherlands", emoji: "🍪",
      description: "Two thin wafers with a chewy caramel-syrup filling." },

    // ─────────── UNITED KINGDOM ───────────
    { name: "Fish and Chips", wikiTitle: "Fish_and_chips", country: "United Kingdom", emoji: "🐟",
      description: "Battered deep-fried white fish served with thick-cut chips." },
    { name: "Haggis", wikiTitle: "Haggis", country: "United Kingdom", emoji: "🥘",
      description: "Sheep's pluck minced with oats and spices, traditionally cooked in the stomach." },

    // ─────────── IRELAND ───────────
    { name: "Irish Stew", wikiTitle: "Irish_stew", country: "Ireland", emoji: "🍲",
      description: "Slow-simmered mutton or lamb with potatoes, onions and root vegetables." },

    // ─────────── SWEDEN ───────────
    { name: "Köttbullar", wikiTitle: "Swedish_meatballs", country: "Sweden", emoji: "🍖",
      description: "Small meatballs in cream gravy with lingonberry jam and mashed potatoes." },

    // ─────────── DENMARK ───────────
    { name: "Smørrebrød", wikiTitle: "Smørrebrød", country: "Denmark", emoji: "🥪",
      description: "Open-faced rye-bread sandwich with cured fish, meats or pickled toppings." },

    // ─────────── POLAND ───────────
    { name: "Pierogi", wikiTitle: "Pierogi", country: "Poland", emoji: "🥟",
      description: "Boiled or pan-fried filled dumplings — potato-cheese, meat, sauerkraut or fruit." },

    // ─────────── HUNGARY ───────────
    { name: "Goulash", wikiTitle: "Goulash", country: "Hungary", emoji: "🍲",
      description: "Beef stew heavily seasoned with sweet paprika, onions and caraway." },

    // ─────────── RUSSIA ───────────
    { name: "Borscht", wikiTitle: "Borscht", country: "Ukraine", emoji: "🥣",
      description: "Sour beetroot soup — deep magenta — topped with smetana (sour cream)." },
    { name: "Beef Stroganoff", wikiTitle: "Beef_Stroganoff", country: "Russia", emoji: "🍖",
      description: "Sautéed beef strips in a sour-cream and mustard sauce with mushrooms." },

    // ─────────── GEORGIA ───────────
    { name: "Khachapuri", wikiTitle: "Khachapuri", country: "Georgia", emoji: "🫓",
      description: "Boat-shaped bread filled with melted sulguni cheese, butter and a raw egg yolk." },

    // ─────────── TURKEY ───────────
    { name: "Doner Kebab", wikiTitle: "Doner_kebab", country: "Turkey", emoji: "🥙",
      description: "Stacked spit-roasted meat shaved into thin slices, served in flatbread." },
    { name: "Baklava", wikiTitle: "Baklava", country: "Turkey", emoji: "🍯",
      description: "Layered filo pastry with chopped nuts, soaked in sugar or honey syrup." },
    { name: "Turkish Delight", wikiTitle: "Turkish_delight", country: "Turkey", emoji: "🍬",
      description: "Soft starch-and-sugar candy flavoured with rosewater or mastic, dusted in powdered sugar." },

    // ─────────── LEBANON ───────────
    { name: "Hummus", wikiTitle: "Hummus", country: "Lebanon", emoji: "🫘",
      description: "Smooth chickpea purée with tahini, lemon and garlic — drizzled with olive oil." },
    { name: "Tabbouleh", wikiTitle: "Tabbouleh", country: "Lebanon", emoji: "🌿",
      description: "Bright parsley-and-bulgur salad with tomato, mint and lemon dressing." },

    // ─────────── ISRAEL ───────────
    { name: "Shakshouka", wikiTitle: "Shakshouka", country: "Israel", emoji: "🍳",
      description: "Eggs poached in a spiced tomato-and-pepper sauce, served in the pan." },

    // ─────────── SYRIA ───────────
    { name: "Shawarma", wikiTitle: "Shawarma", country: "Syria", emoji: "🥙",
      description: "Spit-roasted seasoned meat shaved off and wrapped in flatbread with sauces." },

    // ─────────── EGYPT ───────────
    { name: "Falafel", wikiTitle: "Falafel", country: "Egypt", emoji: "🧆",
      description: "Deep-fried balls of seasoned ground fava beans (or chickpeas), crisp outside." },
    { name: "Koshari", wikiTitle: "Koshary", country: "Egypt", emoji: "🍚",
      description: "Rice, macaroni and lentils topped with tomato sauce and crispy fried onions." },

    // ─────────── MOROCCO ───────────
    { name: "Couscous", wikiTitle: "Couscous", country: "Morocco", emoji: "🥘",
      description: "Tiny steamed semolina pearls served with stewed meat and vegetables." },
    { name: "Tagine", wikiTitle: "Tagine", country: "Morocco", emoji: "🫕",
      description: "Slow-cooked stew named after its conical earthenware pot." },

    // ─────────── ETHIOPIA ───────────
    { name: "Injera with Wat", wikiTitle: "Injera", country: "Ethiopia", emoji: "🫓",
      description: "Spongy sour teff flatbread used to scoop up spiced stews (wat)." },

    // ─────────── NIGERIA ───────────
    { name: "Jollof Rice", wikiTitle: "Jollof_rice", country: "Nigeria", emoji: "🍚",
      description: "One-pot rice cooked in spiced tomato-pepper broth — fiercely debated across West Africa." },

    // ─────────── SOUTH AFRICA ───────────
    { name: "Bobotie", wikiTitle: "Bobotie", country: "South Africa", emoji: "🍛",
      description: "Spiced minced meat baked with an egg-and-milk custard topping." },

    // ─────────── JAPAN ───────────
    { name: "Sushi", wikiTitle: "Sushi", country: "Japan", emoji: "🍣",
      description: "Vinegared rice served with raw fish, vegetables or wrapped in nori." },
    { name: "Ramen", wikiTitle: "Ramen", country: "Japan", emoji: "🍜",
      description: "Wheat noodles in a savoury broth — tonkotsu, shoyu, miso or shio." },
    { name: "Tempura", wikiTitle: "Tempura", country: "Japan", emoji: "🍤",
      description: "Seafood and vegetables coated in a feather-light batter and deep-fried." },
    { name: "Takoyaki", wikiTitle: "Takoyaki", country: "Japan", emoji: "🐙",
      description: "Round Osaka street snack — wheat-flour balls filled with octopus, topped with bonito flakes." },
    { name: "Okonomiyaki", wikiTitle: "Okonomiyaki", country: "Japan", emoji: "🥞",
      description: "Savoury cabbage pancake topped with sauce, mayo, bonito flakes and seaweed." },
    { name: "Onigiri", wikiTitle: "Onigiri", country: "Japan", emoji: "🍙",
      description: "Triangular rice ball, usually wrapped in nori, with a salty filling inside." },

    // ─────────── SOUTH KOREA ───────────
    { name: "Kimchi", wikiTitle: "Kimchi", country: "South Korea", emoji: "🌶️",
      description: "Fermented vegetables (most often napa cabbage) seasoned with chilli and garlic." },
    { name: "Bibimbap", wikiTitle: "Bibimbap", country: "South Korea", emoji: "🍲",
      description: "Mixed rice bowl topped with vegetables, beef, a fried egg and gochujang." },
    { name: "Bulgogi", wikiTitle: "Bulgogi", country: "South Korea", emoji: "🥩",
      description: "Thinly sliced beef marinated in soy, pear, garlic and sesame, then grilled." },

    // ─────────── CHINA ───────────
    { name: "Peking Duck", wikiTitle: "Peking_duck", country: "China", emoji: "🦆",
      description: "Roasted duck with crisp lacquered skin, sliced and rolled in thin pancakes." },
    { name: "Dim Sum", wikiTitle: "Dim_sum", country: "China", emoji: "🥟",
      description: "Bite-sized Cantonese steamed or fried snacks served in bamboo baskets with tea." },
    { name: "Mapo Tofu", wikiTitle: "Mapo_tofu", country: "China", emoji: "🌶️",
      description: "Sichuan tofu in a fiery sauce of doubanjiang, chilli oil and ground meat." },
    { name: "Xiao Long Bao", wikiTitle: "Xiaolongbao", country: "China", emoji: "🥟",
      description: "Steamed soup dumplings — pleated buns with hot broth inside." },
    { name: "Hot Pot", wikiTitle: "Hot_pot", country: "China", emoji: "🍲",
      description: "Communal simmering broth in which raw meat, seafood and vegetables are cooked at table." },

    // ─────────── VIETNAM ───────────
    { name: "Phở", wikiTitle: "Pho", country: "Vietnam", emoji: "🍜",
      description: "Clear, fragrant beef-or-chicken broth with rice noodles, herbs and lime." },
    { name: "Bánh Mì", wikiTitle: "Bánh_mì", country: "Vietnam", emoji: "🥖",
      description: "Crusty baguette sandwich with pâté, cold cuts, pickled veg, cilantro and chilli." },
    { name: "Gỏi Cuốn", wikiTitle: "Gỏi_cuốn", country: "Vietnam", emoji: "🌯",
      description: "Fresh translucent rice-paper rolls with shrimp, herbs and rice noodles." },

    // ─────────── THAILAND ───────────
    { name: "Pad Thai", wikiTitle: "Pad_thai", country: "Thailand", emoji: "🍤",
      description: "Stir-fried rice noodles with egg, tofu or shrimp, tamarind, peanuts and lime." },
    { name: "Tom Yum", wikiTitle: "Tom_yum", country: "Thailand", emoji: "🍤",
      description: "Hot-and-sour broth with lemongrass, galangal, kaffir lime and shrimp." },
    { name: "Green Curry", wikiTitle: "Green_curry", country: "Thailand", emoji: "🍛",
      description: "Coconut curry coloured by fresh green chillies, basil and kaffir lime leaves." },
    { name: "Massaman Curry", wikiTitle: "Massaman_curry", country: "Thailand", emoji: "🍛",
      description: "Mild, fragrant curry with peanuts, potatoes and tender meat — spice-route influence." },

    // ─────────── INDONESIA ───────────
    { name: "Nasi Goreng", wikiTitle: "Nasi_goreng", country: "Indonesia", emoji: "🍚",
      description: "Wok-fried rice with kecap manis, shallots and a fried egg on top." },
    { name: "Rendang", wikiTitle: "Rendang", country: "Indonesia", emoji: "🍛",
      description: "Slow-cooked dry beef curry of Minangkabau origin — dark, intensely spiced." },

    // ─────────── MALAYSIA ───────────
    { name: "Laksa", wikiTitle: "Laksa", country: "Malaysia", emoji: "🍜",
      description: "Spicy noodle soup with coconut curry broth, shrimp and tofu puffs." },

    // ─────────── SINGAPORE ───────────
    { name: "Hainanese Chicken Rice", wikiTitle: "Hainanese_chicken_rice", country: "Singapore", emoji: "🍚",
      description: "Poached chicken served over rice cooked in the chicken broth, with chilli-ginger dips." },

    // ─────────── PHILIPPINES ───────────
    { name: "Adobo", wikiTitle: "Philippine_adobo", country: "Philippines", emoji: "🍗",
      description: "Meat braised in vinegar, soy sauce, garlic, bay leaf and black pepper." },

    // ─────────── INDIA ───────────
    { name: "Biryani", wikiTitle: "Biryani", country: "India", emoji: "🍚",
      description: "Layered, spiced rice baked with marinated meat — saffron streaks throughout." },
    { name: "Butter Chicken", wikiTitle: "Butter_chicken", country: "India", emoji: "🍛",
      description: "Tandoori chicken in a creamy tomato-butter sauce." },
    { name: "Samosa", wikiTitle: "Samosa", country: "India", emoji: "🥟",
      description: "Triangular deep-fried pastry filled with spiced potato and peas." },
    { name: "Naan", wikiTitle: "Naan", country: "India", emoji: "🫓",
      description: "Leavened flatbread baked stuck to the wall of a tandoor oven." },
    { name: "Masala Dosa", wikiTitle: "Dosa_(food)", country: "India", emoji: "🥞",
      description: "Thin fermented rice-and-lentil crêpe wrapped around spiced potato filling." },

    // ─────────── MEXICO ───────────
    { name: "Tacos al Pastor", wikiTitle: "Taco", country: "Mexico", emoji: "🌮",
      description: "Soft corn tortilla folded around grilled meat, onion, cilantro, salsa, lime." },
    { name: "Burrito", wikiTitle: "Burrito", country: "Mexico", emoji: "🌯",
      description: "Large wheat-flour tortilla wrapped around beans, rice, meat and toppings." },
    { name: "Enchiladas", wikiTitle: "Enchilada", country: "Mexico", emoji: "🌶️",
      description: "Rolled corn tortillas filled with meat or cheese, smothered in chilli sauce." },
    { name: "Guacamole", wikiTitle: "Guacamole", country: "Mexico", emoji: "🥑",
      description: "Mashed avocado dip with lime, onion, tomato, cilantro and chilli." },
    { name: "Tamales", wikiTitle: "Tamale", country: "Mexico", emoji: "🌽",
      description: "Steamed masa dough parcels wrapped in corn husks or banana leaves." },

    // ─────────── USA ───────────
    { name: "Hamburger", wikiTitle: "Hamburger", country: "United States", emoji: "🍔",
      description: "Grilled beef patty in a bun with lettuce, tomato, cheese and pickles." },
    { name: "Hot Dog", wikiTitle: "Hot_dog", country: "United States", emoji: "🌭",
      description: "Steamed or grilled sausage served in a sliced bun with mustard or ketchup." },
    { name: "Apple Pie", wikiTitle: "Apple_pie", country: "United States", emoji: "🥧",
      description: "Double-crust pie filled with spiced sweetened apples — often à la mode." },
    { name: "New England Clam Chowder", wikiTitle: "Clam_chowder", country: "United States", emoji: "🥣",
      description: "Thick creamy soup with clams, potatoes and salt pork — typically served in a bread bowl." },

    // ─────────── CANADA ───────────
    { name: "Poutine", wikiTitle: "Poutine", country: "Canada", emoji: "🍟",
      description: "Fries topped with fresh cheese curds and brown gravy — Quebec origin." },

    // ─────────── ARGENTINA ───────────
    { name: "Empanadas", wikiTitle: "Empanada", country: "Argentina", emoji: "🥟",
      description: "Hand-held baked or fried turnovers filled with spiced beef, chicken or cheese." },
    { name: "Asado", wikiTitle: "Asado", country: "Argentina", emoji: "🥩",
      description: "Open-flame grilling of mixed beef cuts and sausages — a national social ritual." },

    // ─────────── BRAZIL ───────────
    { name: "Feijoada", wikiTitle: "Feijoada", country: "Brazil", emoji: "🍲",
      description: "Black-bean stew with pork shoulder, ribs and sausage, served with rice and orange." },
    { name: "Brigadeiro", wikiTitle: "Brigadeiro", country: "Brazil", emoji: "🍫",
      description: "Soft chocolate-and-condensed-milk truffles rolled in chocolate sprinkles." },

    // ─────────── PERU ───────────
    { name: "Ceviche", wikiTitle: "Ceviche", country: "Peru", emoji: "🐟",
      description: "Raw fish cured in citrus juice with onion, chilli, salt and cilantro." },

    // ─────────── VENEZUELA ───────────
    { name: "Arepa", wikiTitle: "Arepa", country: "Venezuela", emoji: "🫓",
      description: "Grilled white-corn cake split open and stuffed with cheese, beans or shredded beef." },

    // ─────────── AUSTRALIA ───────────
    { name: "Pavlova", wikiTitle: "Pavlova_(cake)", country: "Australia", emoji: "🍰",
      description: "Crisp-shelled meringue with a marshmallow centre, topped with cream and fresh fruit." },

    // ─────────── MONGOLIA ───────────
    { name: "Buuz", wikiTitle: "Buuz", country: "Mongolia", emoji: "🥟",
      description: "Steamed mutton or beef dumplings, traditionally eaten around Lunar New Year." },

    // ─────────── EXTRAS to reach ~100 ───────────
    { name: "Pad See Ew", wikiTitle: "Pad_see_ew", country: "Thailand", emoji: "🍜",
      description: "Wide flat rice noodles stir-fried in dark soy with egg, Chinese broccoli and meat." },
    { name: "Bún Chả", wikiTitle: "Bún_chả", country: "Vietnam", emoji: "🍜",
      description: "Hanoi specialty — grilled fatty pork served over rice vermicelli with herbs and dipping sauce." },
    { name: "Tonkatsu", wikiTitle: "Tonkatsu", country: "Japan", emoji: "🍖",
      description: "Breaded deep-fried pork cutlet served with shredded cabbage and a thick brown sauce." },
    { name: "Mochi", wikiTitle: "Mochi", country: "Japan", emoji: "🍡",
      description: "Pounded glutinous-rice cake — chewy, often filled with sweet bean paste or ice cream." },
    { name: "Bún Bò Huế", wikiTitle: "Bún_bò_Huế", country: "Vietnam", emoji: "🍜",
      description: "Spicy lemongrass beef noodle soup from the imperial city of Huế." },
    { name: "Khinkali", wikiTitle: "Khinkali", country: "Georgia", emoji: "🥟",
      description: "Twisted-top dumplings filled with seasoned broth and meat — bitten, sipped, then eaten." },
    { name: "Hortobágyi Palacsinta", wikiTitle: "Palacsinta", country: "Hungary", emoji: "🥞",
      description: "Thin crêpes rolled around savoury veal stew under a sour-cream paprika sauce." },
    { name: "Pastéis de Nata", wikiTitle: "Pastel_de_nata", country: "Portugal", emoji: "🥧",
      description: "Small flaky pastry shells filled with caramelised egg custard." },
    { name: "Bacalhau à Brás", wikiTitle: "Bacalhau_à_Brás", country: "Portugal", emoji: "🐟",
      description: "Salt-cod shredded with onions, straw potatoes and scrambled eggs." },
    { name: "Spätzle", wikiTitle: "Spätzle", country: "Germany", emoji: "🍝",
      description: "Soft egg-noodle dumplings, often served with cheese (Käsespätzle) and fried onions." }
];

// ============================================================
// Wikipedia Pageviews — used as the rating signal in the
// "Scrandle Wiki" mode. Fetches monthly views for the article
// over the last 6 months, returns the average per month.
// Cached in localStorage (7-day TTL) to keep things snappy.
// ============================================================

var FG_VIEWS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function fgReadViewsCache() {
    try { return JSON.parse(localStorage.getItem('fg-wiki-views') || '{}') || {}; }
    catch (e) { return {}; }
}
function fgWriteViewsCache(cache) {
    try { localStorage.setItem('fg-wiki-views', JSON.stringify(cache)); } catch (e) {}
}
function fgYyyymmddhh(date) {
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return date.getUTCFullYear() +
        pad(date.getUTCMonth() + 1) +
        pad(date.getUTCDate()) + '00';
}

window.FG_fetchDishViews = async function (wikiTitle) {
    var cache = fgReadViewsCache();
    var entry = cache[wikiTitle];
    if (entry && (Date.now() - entry.ts) < FG_VIEWS_TTL_MS) {
        return entry.views;
    }
    try {
        // 6 month window ending last full month
        var end = new Date();
        end.setUTCDate(1); // first of current month
        end.setUTCHours(0, 0, 0, 0);
        end.setUTCDate(end.getUTCDate() - 1); // last day of previous month
        var start = new Date(end);
        start.setUTCMonth(start.getUTCMonth() - 5); // 6 months back
        start.setUTCDate(1);

        var url = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/' +
            'en.wikipedia/all-access/all-agents/' +
            encodeURIComponent(wikiTitle) +
            '/monthly/' + fgYyyymmddhh(start) + '/' + fgYyyymmddhh(end);
        var res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        var items = (data && data.items) || [];
        if (!items.length) throw new Error('no data');
        var sum = 0;
        for (var i = 0; i < items.length; i++) sum += Number(items[i].views) || 0;
        var avg = Math.round(sum / items.length);

        cache[wikiTitle] = { views: avg, ts: Date.now() };
        fgWriteViewsCache(cache);
        return avg;
    } catch (err) {
        console.warn('FoodGuessr views fetch failed for', wikiTitle, err.message || err);
        // Soft-cache the failure so we don't hammer on every round (1h)
        cache[wikiTitle] = { views: null, ts: Date.now() - FG_VIEWS_TTL_MS + 60 * 60 * 1000 };
        fgWriteViewsCache(cache);
        return null;
    }
};

// Dish image cache — Wikipedia REST summary endpoint
window.FG_imageCache = {};

window.FG_fetchDishImage = async function (wikiTitle) {
    if (window.FG_imageCache[wikiTitle]) return window.FG_imageCache[wikiTitle];
    try {
        const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(wikiTitle);
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const src = (data.originalimage && data.originalimage.source) ||
                    (data.thumbnail && data.thumbnail.source) ||
                    null;
        window.FG_imageCache[wikiTitle] = src;
        return src;
    } catch (err) {
        console.warn('FoodGuessr image fetch failed for', wikiTitle, err);
        window.FG_imageCache[wikiTitle] = null;
        return null;
    }
};
