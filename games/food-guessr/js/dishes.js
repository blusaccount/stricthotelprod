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
      description: "Soft egg-noodle dumplings, often served with cheese (Käsespätzle) and fried onions." },

    // ============================================================
    // 🌶️ DIVISIVE TIER — acquired tastes, offal, fermented goods,
    // insects, meme foods. These are flagged `controversial: true`
    // so the Rate UI can warn the voter before they swipe.
    // ============================================================

    // ─── Asian acquired tastes ───
    { name: "Durian", wikiTitle: "Durian", country: "Malaysia", emoji: "🦨", controversial: true,
      description: "Spiky tropical fruit infamous for its overpowering, sulfur-and-onion stench — banned on many subways." },
    { name: "Nattō", wikiTitle: "Nattō", country: "Japan", emoji: "🫘", controversial: true,
      description: "Fermented soybeans bound by sticky, stringy slime — pungent, ammoniac, slimy, divisive." },
    { name: "Balut", wikiTitle: "Balut_(food)", country: "Philippines", emoji: "🥚", controversial: true,
      description: "Fertilised duck egg boiled and eaten with the partly-formed embryo inside the shell." },
    { name: "Century Egg", wikiTitle: "Century_egg", country: "China", emoji: "🥚", controversial: true,
      description: "Duck egg cured for weeks until the yolk turns dark green and the white becomes a translucent black jelly." },
    { name: "Stinky Tofu", wikiTitle: "Stinky_tofu", country: "Taiwan", emoji: "🧀", controversial: true,
      description: "Fermented tofu deep-fried until crisp — smells like a dumpster in summer, beloved across Taiwan." },
    { name: "Sannakji", wikiTitle: "Sannakji", country: "South Korea", emoji: "🐙", controversial: true,
      description: "Freshly-cut octopus tentacles served still wriggling, with suction cups that grip your tongue." },
    { name: "Hongeo-hoe", wikiTitle: "Hongeo-hoe", country: "South Korea", emoji: "🐟", controversial: true,
      description: "Skate fermented in its own urea — releases ammonia so strong it makes your eyes water." },
    { name: "Beondegi", wikiTitle: "Beondegi", country: "South Korea", emoji: "🐛", controversial: true,
      description: "Boiled silkworm pupae — soft, slightly nutty, with a chewy popping shell. Sold from street carts." },
    { name: "Bird's Nest Soup", wikiTitle: "Edible_bird's_nest", country: "China", emoji: "🪺", controversial: true,
      description: "Soup made from nests that swiftlets build entirely out of their own hardened saliva." },
    { name: "Fugu", wikiTitle: "Fugu", country: "Japan", emoji: "🐡", controversial: true,
      description: "Pufferfish sashimi — the wrong cut contains enough tetrodotoxin to kill an adult in minutes." },

    // ─── Scandinavian / Icelandic fermented stuff ───
    { name: "Surströmming", wikiTitle: "Surströmming", country: "Sweden", emoji: "🥫", controversial: true,
      description: "Baltic herring fermented in the tin until it bulges — opened outdoors because the smell can clear a room." },
    { name: "Hákarl", wikiTitle: "Hákarl", country: "Iceland", emoji: "🦈", controversial: true,
      description: "Greenland shark buried for months until the toxic urea breaks down — eaten in small ammonia-soaked cubes." },
    { name: "Lutefisk", wikiTitle: "Lutefisk", country: "Norway", emoji: "🐟", controversial: true,
      description: "Whitefish soaked in lye until it becomes a translucent, jelly-textured slab. Christmas tradition." },
    { name: "Smalahove", wikiTitle: "Smalahove", country: "Norway", emoji: "🐑", controversial: true,
      description: "Whole sheep's head — singed, salted, smoked — eaten eyeball, ear and tongue first." },
    { name: "Salty Liquorice", wikiTitle: "Salty_liquorice", country: "Finland", emoji: "🍬", controversial: true,
      description: "Liquorice dosed with ammonium chloride — tastes like burnt rubber dipped in salt to outsiders." },

    // ─── British / Irish divisive classics ───
    { name: "Jellied Eels", wikiTitle: "Jellied_eels", country: "United Kingdom", emoji: "🐍", controversial: true,
      description: "Chopped eels boiled in spiced stock that sets into a cold, savoury jelly. East End classic." },
    { name: "Mushy Peas", wikiTitle: "Mushy_peas", country: "United Kingdom", emoji: "🟢", controversial: true,
      description: "Marrowfat peas soaked, simmered and mashed into a thick green sludge served beside chippy fish." },
    { name: "Spotted Dick", wikiTitle: "Spotted_dick", country: "United Kingdom", emoji: "🍮", controversial: true,
      description: "Suet sponge studded with currants, steamed for hours and drowned in custard." },
    { name: "Black Pudding", wikiTitle: "Black_pudding", country: "United Kingdom", emoji: "⚫", controversial: true,
      description: "Sausage of pork blood, oats and fat — sliced and fried in a Full English breakfast." },
    { name: "Marmite on Toast", wikiTitle: "Marmite", country: "United Kingdom", emoji: "🟤", controversial: true,
      description: "Sticky black yeast extract spread thin on buttered toast. Their slogan literally says you either love it or hate it." },
    { name: "Stargazy Pie", wikiTitle: "Stargazy_pie", country: "United Kingdom", emoji: "🐟", controversial: true,
      description: "Cornish pie with whole sardine heads poking up through the crust as if staring at the stars." },
    { name: "Haggis Neeps Tatties", wikiTitle: "Haggis", country: "United Kingdom", emoji: "🥘", controversial: true,
      description: "Sheep's pluck minced with oats and spices, traditionally cooked inside the stomach. Burns Night standard." },
    { name: "Deep-Fried Mars Bar", wikiTitle: "Deep-fried_Mars_bar", country: "United Kingdom", emoji: "🍫", controversial: true,
      description: "A regular Mars bar dipped in fish-and-chip batter and deep-fried until the chocolate melts inside." },

    // ─── Offal & exotic meat cuts ───
    { name: "Trippa alla Romana", wikiTitle: "Tripe", country: "Italy", emoji: "🫀", controversial: true,
      description: "Beef stomach lining slow-simmered in tomato with mint and pecorino — chewy, honeycomb texture." },
    { name: "Kokoreç", wikiTitle: "Kokoreç", country: "Turkey", emoji: "🌯", controversial: true,
      description: "Seasoned lamb intestines wrapped around offal and grilled on a spit, sliced into bread." },
    { name: "Andouillette", wikiTitle: "Andouillette", country: "France", emoji: "🌭", controversial: true,
      description: "Coarse pork-tripe sausage with a distinctly barnyard, ammonia-tinged aroma. Lyon specialty." },
    { name: "Steak and Kidney Pie", wikiTitle: "Steak_and_kidney_pie", country: "United Kingdom", emoji: "🥧", controversial: true,
      description: "Diced beef braised with chopped lamb or pork kidneys, baked under a pastry lid. Kidney funk included." },
    { name: "Lengua Tacos", wikiTitle: "Lengua", country: "Mexico", emoji: "👅", controversial: true,
      description: "Soft, slow-braised beef tongue diced fine and tucked into corn tortillas with onion and cilantro." },
    { name: "Brain Sandwich", wikiTitle: "Brain_sandwich", country: "United States", emoji: "🧠", controversial: true,
      description: "Battered, deep-fried calf-brain slices in a bun with pickle and onion. St. Louis throwback." },
    { name: "Chicken Feet", wikiTitle: "Chicken_feet", country: "China", emoji: "🐓", controversial: true,
      description: "Braised in black-bean sauce or steamed at dim sum — all skin, tendon and tiny bones." },
    { name: "Sweetbreads", wikiTitle: "Sweetbread", country: "France", emoji: "🥩", controversial: true,
      description: "Thymus or pancreas glands, blanched and pan-fried — pale, creamy, faintly metallic." },
    { name: "Czernina", wikiTitle: "Czernina", country: "Poland", emoji: "🦆", controversial: true,
      description: "Sweet-sour duck-blood soup with dried fruit and noodles — traditionally served to rejected suitors." },

    // ─── Insects & extreme ───
    { name: "Chapulines", wikiTitle: "Chapulines", country: "Mexico", emoji: "🦗", controversial: true,
      description: "Grasshoppers toasted on a comal with chilli, lime and salt — crunchy bar snack from Oaxaca." },
    { name: "Escamoles", wikiTitle: "Escamoles", country: "Mexico", emoji: "🐜", controversial: true,
      description: "Pale, plump ant larvae from agave roots — Aztec caviar, sautéed in butter and folded into tacos." },
    { name: "Witchetty Grub", wikiTitle: "Witchetty_grub", country: "Australia", emoji: "🐛", controversial: true,
      description: "Fat white wood-eating larvae eaten raw or briefly roasted — tastes like almond-buttered egg yolk." },
    { name: "Casu Marzu", wikiTitle: "Casu_martzu", country: "Italy", emoji: "🧀", controversial: true,
      description: "Pecorino deliberately infested with cheese-fly larvae that wriggle through it — illegal in the EU." },

    // ─── Meme / polarising / fusion ───
    { name: "Hawaiian Pizza", wikiTitle: "Hawaiian_pizza", country: "Canada", emoji: "🍍", controversial: true,
      description: "Ham, mozzarella, tomato sauce — and chunks of canned pineapple. Invented in Ontario, hated in Naples." },
    { name: "Spam Musubi", wikiTitle: "Spam_musubi", country: "United States", emoji: "🥢", controversial: true,
      description: "A slab of grilled Spam over a brick of sushi rice, belted with a strip of nori. Hawaii's gas-station hero." },
    { name: "Vegemite on Toast", wikiTitle: "Vegemite", country: "Australia", emoji: "🟫", controversial: true,
      description: "Salty-bitter brewer's-yeast paste smeared (very thinly!) on buttered toast for Australian breakfast." },
    { name: "Frog Legs", wikiTitle: "Frog_legs", country: "France", emoji: "🐸", controversial: true,
      description: "Pan-fried in garlic butter — supposedly tastes like chicken, looks like little drumsticks." },
    { name: "Escargots de Bourgogne", wikiTitle: "Escargot", country: "France", emoji: "🐌", controversial: true,
      description: "Land snails baked in their shells with parsley-garlic butter, plucked out with a tiny fork." },
    { name: "Candy Corn", wikiTitle: "Candy_corn", country: "United States", emoji: "🌽", controversial: true,
      description: "Tri-colour Halloween candy of fondant, marshmallow and wax. Either nostalgic or universally hated." },
    { name: "Filipino Spaghetti", wikiTitle: "Filipino_spaghetti", country: "Philippines", emoji: "🍝", controversial: true,
      description: "Spaghetti in a sweet banana-ketchup tomato sauce with hot dogs and grated cheddar. Birthday-party staple." },
    { name: "Bunny Chow", wikiTitle: "Bunny_chow", country: "South Africa", emoji: "🥖", controversial: true,
      description: "Hollowed-out half loaf of white bread filled to the brim with curry — eaten with bare hands." },

    // ============================================================
    // 🏟️ STADIUM / CHIPPY / FAIRGROUND TIER — the matchday food that
    // fans actually argue about. Cheap, greasy, regional. Also flagged
    // `controversial: true` so the Rate UI marks them as divisive.
    // ============================================================

    // ─── British chippy / matchday ───
    { name: "Cornish Pasty", wikiTitle: "Cornish_pasty", country: "United Kingdom", emoji: "🥟", controversial: true,
      description: "Crimped half-moon pastry stuffed with diced beef, swede, potato and onion. Miner's lunch turned national icon." },
    { name: "Sausage Roll", wikiTitle: "Sausage_roll", country: "United Kingdom", emoji: "🥐", controversial: true,
      description: "Seasoned pork sausagemeat wrapped in flaky puff pastry. Greggs queue forms at 7 a.m." },
    { name: "Scotch Egg", wikiTitle: "Scotch_egg", country: "United Kingdom", emoji: "🥚", controversial: true,
      description: "Hard-boiled egg wrapped in sausagemeat, breadcrumbed and deep-fried — picnic and pub staple." },
    { name: "Chip Butty", wikiTitle: "Chip_butty", country: "United Kingdom", emoji: "🍞", controversial: true,
      description: "Hot chips piled inside a buttered white-bread roll. Carbs on carbs. Often with ketchup or brown sauce." },
    { name: "Battered Sausage", wikiTitle: "Battered_sausage", country: "United Kingdom", emoji: "🌭", controversial: true,
      description: "Pork sausage dunked in chip-shop batter and deep-fried alongside the fish. Crispy on the outside, snappy inside." },
    { name: "Pickled Egg", wikiTitle: "Pickled_egg", country: "United Kingdom", emoji: "🥚", controversial: true,
      description: "Hard-boiled egg preserved in spiced vinegar, kept in a giant jar on the chippy counter." },
    { name: "Beans on Toast", wikiTitle: "Beans_on_toast", country: "United Kingdom", emoji: "🫘", controversial: true,
      description: "Tinned baked beans poured over hot buttered toast. Cheap, fast, surprisingly polarising worldwide." },
    { name: "Steak and Ale Pie", wikiTitle: "Meat_pie", country: "United Kingdom", emoji: "🥧", controversial: true,
      description: "Diced beef slow-braised in dark ale under a shortcrust lid — staple of every matchday concourse." },
    { name: "Toad in the Hole", wikiTitle: "Toad_in_the_hole", country: "United Kingdom", emoji: "🐸", controversial: true,
      description: "Pork sausages baked into a giant Yorkshire pudding batter, drowned in onion gravy." },
    { name: "Saveloy", wikiTitle: "Saveloy", country: "United Kingdom", emoji: "🌭", controversial: true,
      description: "Bright red, smoked pork sausage from the chippy — heated in the warmer, often eaten with chips and curry sauce." },

    // ─── American stadium / fairground / diner ───
    { name: "Corn Dog", wikiTitle: "Corn_dog", country: "United States", emoji: "🌭", controversial: true,
      description: "Hot dog jammed onto a stick, dipped in sweet cornmeal batter, deep-fried until golden. State-fair classic." },
    { name: "Funnel Cake", wikiTitle: "Funnel_cake", country: "United States", emoji: "🍩", controversial: true,
      description: "Ribbons of batter poured into hot oil through a funnel, then dusted with mountains of powdered sugar." },
    { name: "Frito Pie", wikiTitle: "Frito_pie", country: "United States", emoji: "🌶️", controversial: true,
      description: "Chili poured straight into a slit-open bag of Fritos, topped with cheese and onions. Eaten with a plastic fork." },
    { name: "Tater Tots", wikiTitle: "Tater_tots", country: "United States", emoji: "🥔", controversial: true,
      description: "Cylinders of shredded potato deep-fried to a crisp shell — school-cafeteria icon." },
    { name: "Sloppy Joe", wikiTitle: "Sloppy_joe", country: "United States", emoji: "🍔", controversial: true,
      description: "Loose ground beef in a sweet tomato sauce, piled into a soft hamburger bun until it inevitably spills." },
    { name: "Philly Cheesesteak", wikiTitle: "Cheesesteak", country: "United States", emoji: "🥖", controversial: true,
      description: "Thin-sliced ribeye on a hoagie roll with melted Cheez Whiz and griddled onions. Wiz vs. Provolone wars never end." },
    { name: "Loaded Nachos", wikiTitle: "Nachos", country: "United States", emoji: "🧀", controversial: true,
      description: "Tortilla chips drowned in neon cheese sauce, jalapeños and ground beef. Stadium concession staple." },
    { name: "Buffalo Wings", wikiTitle: "Buffalo_wing", country: "United States", emoji: "🌶️", controversial: true,
      description: "Deep-fried chicken wings tossed in vinegary cayenne-butter sauce, served with celery and blue-cheese dip." },
    { name: "Cracker Jack", wikiTitle: "Cracker_Jack", country: "United States", emoji: "🍿", controversial: true,
      description: "Caramel-glazed popcorn and peanuts in a striped box — handed out at baseball games since 1896." },

    // ─── Canadian / Wisconsin ───
    { name: "Cheese Curds", wikiTitle: "Cheese_curds", country: "Canada", emoji: "🧀", controversial: true,
      description: "Fresh, squeaky curds of cheddar before pressing — eaten by the handful or deep-fried for stadium snacks." },

    // ─── German / Austrian Imbiss / Stadion ───
    { name: "Käsekrainer", wikiTitle: "Käsekrainer", country: "Austria", emoji: "🧀", controversial: true,
      description: "Smoked pork sausage flecked with cheese cubes that bubble out when bitten. Vienna stand-up classic." },
    { name: "Leberkäse Semmel", wikiTitle: "Leberkäse", country: "Germany", emoji: "🥪", controversial: true,
      description: "Slab of warm, finely ground 'meat loaf' (no liver, no cheese) tucked into a crispy bread roll with mustard." },
    { name: "Mettbrötchen", wikiTitle: "Mett", country: "Germany", emoji: "🐷", controversial: true,
      description: "Raw seasoned minced pork piled on a bread roll, topped with raw onion rings. Yes, raw. Yes, eaten cold." },
    { name: "Strammer Max", wikiTitle: "Strammer_Max", country: "Germany", emoji: "🍳", controversial: true,
      description: "Slice of dark bread heaped with ham and topped with a sunny-side-up egg. Stout-friendly Imbiss order." },
    { name: "Bockwurst", wikiTitle: "Bockwurst", country: "Germany", emoji: "🌭", controversial: true,
      description: "Pale, smooth veal-and-pork sausage simmered in water, eaten with mustard and a Brötchen." },

    // ─── Italian quick / fast ───
    { name: "Arancini", wikiTitle: "Arancini", country: "Italy", emoji: "🍙", controversial: true,
      description: "Sicilian risotto balls stuffed with ragù or mozzarella, breadcrumbed and deep-fried. Sold from train-station counters." },
    { name: "Calzone", wikiTitle: "Calzone", country: "Italy", emoji: "🥟", controversial: true,
      description: "Pizza dough folded into a half-moon over mozzarella, ricotta and salami, baked until puffed." },

    // ─── Latin American street ───
    { name: "Elote", wikiTitle: "Elote", country: "Mexico", emoji: "🌽", controversial: true,
      description: "Grilled corn on the cob slathered in mayo, crema, cotija cheese, chilli powder and lime. Sold from carts." },
    { name: "Choripán", wikiTitle: "Choripán", country: "Argentina", emoji: "🌭", controversial: true,
      description: "Chorizo butterflied and grilled hot, slapped between crusty bread with bright green chimichurri." }
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
