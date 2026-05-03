// ============================================================
// Thing of the Week — Item Catalog & Weekly Selection
// ============================================================

var ITEM_CATALOG = [
    { name: "Pizza", image: "/assets/tierlist/pizza.jpg", category: "food" },
    { name: "Sushi", image: "/assets/tierlist/sushi.jpg", category: "food" },
    { name: "Tacos", image: "/assets/tierlist/tacos.jpg", category: "food" },
    { name: "Hamburger", image: "/assets/tierlist/hamburger.jpg", category: "food" },
    { name: "Ice cream", image: "/assets/tierlist/ice-cream.jpg", category: "food" },
    { name: "Ramen", image: "/assets/tierlist/ramen.jpg", category: "food" },
    { name: "Croissant", image: "/assets/tierlist/croissant.jpg", category: "food" },
    { name: "Steak", image: "/assets/tierlist/steak.jpg", category: "food" },
    { name: "Pad Thai", image: "/assets/tierlist/pad-thai.jpg", category: "food" },
    { name: "Doner kebab", image: "/assets/tierlist/doner-kebab.jpg", category: "food" },
    { name: "Chocolate", image: "/assets/tierlist/chocolate.jpg", category: "food" },
    { name: "Pancake", image: "/assets/tierlist/pancake.jpg", category: "food" },
    { name: "French fries", image: "/assets/tierlist/french-fries.jpg", category: "food" },
    { name: "Dim sum", image: "/assets/tierlist/dim-sum.jpg", category: "food" },
    { name: "Curry", image: "/assets/tierlist/curry.jpg", category: "food" },
    { name: "Pasta", image: "/assets/tierlist/pasta.jpg", category: "food" },
    { name: "Waffle", image: "/assets/tierlist/waffle.jpg", category: "food" },
    { name: "Nachos", image: "/assets/tierlist/nachos.jpg", category: "food" },
    { name: "Pho", image: "/assets/tierlist/pho.jpg", category: "food" },
    { name: "Cheesecake", image: "/assets/tierlist/cheesecake.jpg", category: "food" },
    { name: "Coffee", image: "/assets/tierlist/coffee.jpg", category: "food" },
    { name: "Bubble tea", image: "/assets/tierlist/bubble-tea.png", category: "food" },
    { name: "Pretzel", image: "/assets/tierlist/pretzel.jpg", category: "food" },
    { name: "Baklava", image: "/assets/tierlist/baklava.png", category: "food" },
    { name: "Tiramisu", image: "/assets/tierlist/tiramisu.jpg", category: "food" },
    { name: "Popcorn", image: "/assets/tierlist/popcorn.jpg", category: "food" },
    { name: "Avocado", image: "/assets/tierlist/avocado.jpg", category: "food" },
    { name: "Poutine", image: "/assets/tierlist/poutine.jpg", category: "food" },
    { name: "Spring roll", image: "/assets/tierlist/spring-roll.jpg", category: "food" },
    { name: "Donut", image: "/assets/tierlist/donut.jpg", category: "food" },
    { name: "Espresso", image: "/assets/tierlist/espresso.jpg", category: "food" },
    { name: "Matcha", image: "/assets/tierlist/matcha.jpg", category: "food" },
    { name: "Lasagna", image: "/assets/tierlist/lasagna.jpg", category: "food" },
    { name: "Falafel", image: "/assets/tierlist/falafel.jpg", category: "food" },
    { name: "Pierogi", image: "/assets/tierlist/pierogi.jpg", category: "food" },
    { name: "Goulash", image: "/assets/tierlist/goulash.jpg", category: "food" },
    { name: "Risotto", image: "/assets/tierlist/risotto.jpg", category: "food" },
    { name: "Macaron", image: "/assets/tierlist/macaron.jpg", category: "food" },
    { name: "Burrito", image: "/assets/tierlist/burrito.jpg", category: "food" },
    { name: "Quesadilla", image: "/assets/tierlist/quesadilla.jpg", category: "food" },
    { name: "Empanada", image: "/assets/tierlist/empanada.jpg", category: "food" },
    { name: "Hot dog", image: "/assets/tierlist/hot-dog.png", category: "food" },
    { name: "Sandwich", image: "/assets/tierlist/sandwich.jpg", category: "food" },
    { name: "Bagel", image: "/assets/tierlist/bagel.jpg", category: "food" },
    { name: "Schnitzel", image: "/assets/tierlist/schnitzel.jpg", category: "food" },
    { name: "Bratwurst", image: "/assets/tierlist/bratwurst.jpg", category: "food" },
    { name: "Currywurst", image: "/assets/tierlist/currywurst.jpg", category: "food" },
    { name: "Fish and chips", image: "/assets/tierlist/fish-and-chips.jpg", category: "food" },
    { name: "Paella", image: "/assets/tierlist/paella.jpg", category: "food" },
    { name: "Gazpacho", image: "/assets/tierlist/gazpacho.jpg", category: "food" },
    { name: "Fondue", image: "/assets/tierlist/fondue.jpg", category: "food" },
    { name: "Raclette", image: "/assets/tierlist/raclette.jpg", category: "food" },
    { name: "Hummus", image: "/assets/tierlist/hummus.jpg", category: "food" },
    { name: "Shawarma", image: "/assets/tierlist/shawarma.jpg", category: "food" },
    { name: "Mochi", image: "/assets/tierlist/mochi.jpg", category: "food" },
    { name: "Onigiri", image: "/assets/tierlist/onigiri.jpg", category: "food" },
    { name: "Tempura", image: "/assets/tierlist/tempura.jpg", category: "food" },
    { name: "Gyoza", image: "/assets/tierlist/gyoza.jpg", category: "food" },
    { name: "Bibimbap", image: "/assets/tierlist/bibimbap.jpg", category: "food" },
    { name: "Kimchi", image: "/assets/tierlist/kimchi.jpg", category: "food" },
    { name: "Pad See Ew", image: "/assets/tierlist/pad-see-ew.jpg", category: "food" },
    { name: "Banh Mi", image: "/assets/tierlist/banh-mi.png", category: "food" },
    { name: "Massaman curry", image: "/assets/tierlist/massaman-curry.jpg", category: "food" },
    { name: "Tom Yum", image: "/assets/tierlist/tom-yum.jpg", category: "food" },
    { name: "Beer", image: "/assets/tierlist/beer.jpg", category: "food" },
    { name: "Whiskey", image: "/assets/tierlist/whiskey.jpg", category: "food" },
    { name: "Wine", image: "/assets/tierlist/wine.jpg", category: "food" },
    { name: "Champagne", image: "/assets/tierlist/champagne.jpg", category: "food" },
    { name: "Mojito", image: "/assets/tierlist/mojito.jpg", category: "food" },
    { name: "Margarita (cocktail)", image: "/assets/tierlist/margarita-cocktail.jpg", category: "food" },
    { name: "Pina Colada", image: "/assets/tierlist/pina-colada.jpg", category: "food" },
    { name: "Aperol Spritz", image: "/assets/tierlist/aperol-spritz.jpg", category: "food" },
    { name: "Sangria", image: "/assets/tierlist/sangria.jpg", category: "food" },
    { name: "Lemonade", image: "/assets/tierlist/lemonade.jpg", category: "food" },
    { name: "Iced tea", image: "/assets/tierlist/iced-tea.jpg", category: "food" },
    { name: "Smoothie", image: "/assets/tierlist/smoothie.jpg", category: "food" },
    { name: "Milkshake", image: "/assets/tierlist/milkshake.jpg", category: "food" },
    { name: "Cinnamon roll", image: "/assets/tierlist/cinnamon-roll.jpg", category: "food" },
    { name: "Apple pie", image: "/assets/tierlist/apple-pie.png", category: "food" },
    { name: "Cookie", image: "/assets/tierlist/cookie.png", category: "food" },
    { name: "Cat", image: "/assets/tierlist/cat.jpg", category: "animals" },
    { name: "Dog", image: "/assets/tierlist/dog.jpg", category: "animals" },
    { name: "Red panda", image: "/assets/tierlist/red-panda.jpg", category: "animals" },
    { name: "Penguin", image: "/assets/tierlist/penguin.jpg", category: "animals" },
    { name: "Owl", image: "/assets/tierlist/owl.jpg", category: "animals" },
    { name: "Dolphin", image: "/assets/tierlist/dolphin.jpg", category: "animals" },
    { name: "Elephant", image: "/assets/tierlist/elephant.jpg", category: "animals" },
    { name: "Otter", image: "/assets/tierlist/otter.jpg", category: "animals" },
    { name: "Koala", image: "/assets/tierlist/koala.jpg", category: "animals" },
    { name: "Turtle", image: "/assets/tierlist/turtle.jpg", category: "animals" },
    { name: "Octopus", image: "/assets/tierlist/octopus.jpg", category: "animals" },
    { name: "Hedgehog", image: "/assets/tierlist/hedgehog.jpg", category: "animals" },
    { name: "Giant panda", image: "/assets/tierlist/giant-panda.jpg", category: "animals" },
    { name: "Tiger", image: "/assets/tierlist/tiger.jpg", category: "animals" },
    { name: "Jellyfish", image: "/assets/tierlist/jellyfish.jpg", category: "animals" },
    { name: "Frog", image: "/assets/tierlist/frog.jpg", category: "animals" },
    { name: "Bee", image: "/assets/tierlist/bee.jpg", category: "animals" },
    { name: "Shark", image: "/assets/tierlist/shark.jpg", category: "animals" },
    { name: "Eagle", image: "/assets/tierlist/eagle.jpg", category: "animals" },
    { name: "Lion", image: "/assets/tierlist/lion.jpg", category: "animals" },
    { name: "Giraffe", image: "/assets/tierlist/giraffe.jpg", category: "animals" },
    { name: "Zebra", image: "/assets/tierlist/zebra.jpg", category: "animals" },
    { name: "Hippopotamus", image: "/assets/tierlist/hippopotamus.jpg", category: "animals" },
    { name: "Rhinoceros", image: "/assets/tierlist/rhinoceros.png", category: "animals" },
    { name: "Kangaroo", image: "/assets/tierlist/kangaroo.jpg", category: "animals" },
    { name: "Platypus", image: "/assets/tierlist/platypus.jpg", category: "animals" },
    { name: "Sloth", image: "/assets/tierlist/sloth.jpg", category: "animals" },
    { name: "Capybara", image: "/assets/tierlist/capybara.jpg", category: "animals" },
    { name: "Axolotl", image: "/assets/tierlist/axolotl.jpg", category: "animals" },
    { name: "Tardigrade", image: "/assets/tierlist/tardigrade.png", category: "animals" },
    { name: "Naked mole-rat", image: "/assets/tierlist/naked-mole-rat.jpg", category: "animals" },
    { name: "Aye-aye", image: "/assets/tierlist/aye-aye.jpg", category: "animals" },
    { name: "Pangolin", image: "/assets/tierlist/pangolin.jpg", category: "animals" },
    { name: "Quokka", image: "/assets/tierlist/quokka.jpg", category: "animals" },
    { name: "Narwhal", image: "/assets/tierlist/narwhal.jpg", category: "animals" },
    { name: "Manatee", image: "/assets/tierlist/manatee.jpg", category: "animals" },
    { name: "Walrus", image: "/assets/tierlist/walrus.jpg", category: "animals" },
    { name: "Polar bear", image: "/assets/tierlist/polar-bear.jpg", category: "animals" },
    { name: "Grizzly bear", image: "/assets/tierlist/grizzly-bear.jpg", category: "animals" },
    { name: "Wolf", image: "/assets/tierlist/wolf.jpg", category: "animals" },
    { name: "Fox", image: "/assets/tierlist/fox.jpg", category: "animals" },
    { name: "Raccoon", image: "/assets/tierlist/raccoon.jpg", category: "animals" },
    { name: "Squirrel", image: "/assets/tierlist/squirrel.jpg", category: "animals" },
    { name: "Chipmunk", image: "/assets/tierlist/chipmunk.jpg", category: "animals" },
    { name: "Beaver", image: "/assets/tierlist/beaver.jpg", category: "animals" },
    { name: "Hamster", image: "/assets/tierlist/hamster.jpg", category: "animals" },
    { name: "Guinea pig", image: "/assets/tierlist/guinea-pig.jpg", category: "animals" },
    { name: "Ferret", image: "/assets/tierlist/ferret.png", category: "animals" },
    { name: "Hummingbird", image: "/assets/tierlist/hummingbird.jpg", category: "animals" },
    { name: "Flamingo", image: "/assets/tierlist/flamingo.jpg", category: "animals" },
    { name: "Peacock", image: "/assets/tierlist/peacock.jpg", category: "animals" },
    { name: "Toucan", image: "/assets/tierlist/toucan.jpg", category: "animals" },
    { name: "Parrot", image: "/assets/tierlist/parrot.jpg", category: "animals" },
    { name: "Crow", image: "/assets/tierlist/crow.jpg", category: "animals" },
    { name: "Ostrich", image: "/assets/tierlist/ostrich.jpg", category: "animals" },
    { name: "Goose", image: "/assets/tierlist/goose.jpg", category: "animals" },
    { name: "Duck", image: "/assets/tierlist/duck.jpg", category: "animals" },
    { name: "Chicken", image: "/assets/tierlist/chicken.jpg", category: "animals" },
    { name: "Pig", image: "/assets/tierlist/pig.jpg", category: "animals" },
    { name: "Cow", image: "/assets/tierlist/cow.jpg", category: "animals" },
    { name: "Sheep", image: "/assets/tierlist/sheep.jpg", category: "animals" },
    { name: "Goat", image: "/assets/tierlist/goat.jpg", category: "animals" },
    { name: "Horse", image: "/assets/tierlist/horse.jpg", category: "animals" },
    { name: "Camel", image: "/assets/tierlist/camel.jpg", category: "animals" },
    { name: "Llama", image: "/assets/tierlist/llama.jpg", category: "animals" },
    { name: "Alpaca", image: "/assets/tierlist/alpaca.jpg", category: "animals" },
    { name: "Bison", image: "/assets/tierlist/bison.jpg", category: "animals" },
    { name: "Moose", image: "/assets/tierlist/moose.jpg", category: "animals" },
    { name: "Reindeer", image: "/assets/tierlist/reindeer.jpg", category: "animals" },
    { name: "Stag beetle", image: "/assets/tierlist/stag-beetle.jpg", category: "animals" },
    { name: "Praying mantis", image: "/assets/tierlist/praying-mantis.jpg", category: "animals" },
    { name: "Butterfly", image: "/assets/tierlist/butterfly.jpg", category: "animals" },
    { name: "Dragonfly", image: "/assets/tierlist/dragonfly.jpg", category: "animals" },
    { name: "Ladybug", image: "/assets/tierlist/ladybug.jpg", category: "animals" },
    { name: "Spider", image: "/assets/tierlist/spider.jpg", category: "animals" },
    { name: "Scorpion", image: "/assets/tierlist/scorpion.jpg", category: "animals" },
    { name: "Centipede", image: "/assets/tierlist/centipede.png", category: "animals" },
    { name: "Crab", image: "/assets/tierlist/crab.jpg", category: "animals" },
    { name: "Lobster", image: "/assets/tierlist/lobster.jpg", category: "animals" },
    { name: "Shrimp", image: "/assets/tierlist/shrimp.jpg", category: "animals" },
    { name: "Squid", image: "/assets/tierlist/squid.jpg", category: "animals" },
    { name: "Seahorse", image: "/assets/tierlist/seahorse.jpg", category: "animals" },
    { name: "Starfish", image: "/assets/tierlist/starfish.png", category: "animals" },
    { name: "Coral", image: "/assets/tierlist/coral.jpg", category: "animals" },
    { name: "Snail", image: "/assets/tierlist/snail.jpg", category: "animals" },
    { name: "Slug", image: "/assets/tierlist/slug.png", category: "animals" },
    { name: "Tarantula", image: "/assets/tierlist/tarantula.jpg", category: "animals" },
    { name: "Loch Ness Monster", image: "/assets/tierlist/loch-ness-monster.jpg", category: "absurd" },
    { name: "Bigfoot", image: "/assets/tierlist/bigfoot.jpg", category: "absurd" },
    { name: "Yeti", image: "/assets/tierlist/yeti.jpg", category: "absurd" },
    { name: "Mothman", image: "/assets/tierlist/mothman.png", category: "absurd" },
    { name: "Chupacabra", image: "/assets/tierlist/chupacabra.jpg", category: "absurd" },
    { name: "Kraken", image: "/assets/tierlist/kraken.jpg", category: "absurd" },
    { name: "Unicorn", image: "/assets/tierlist/unicorn.jpg", category: "absurd" },
    { name: "Mermaid", image: "/assets/tierlist/mermaid.jpg", category: "absurd" },
    { name: "Phoenix (mythology)", image: "/assets/tierlist/phoenix-mythology.png", category: "absurd" },
    { name: "Bermuda Triangle", image: "/assets/tierlist/bermuda-triangle.png", category: "absurd" },
    { name: "Area 51", image: "/assets/tierlist/area-51.png", category: "absurd" },
    { name: "Stonehenge", image: "/assets/tierlist/stonehenge.jpg", category: "absurd" },
    { name: "Easter Island", image: "/assets/tierlist/easter-island.jpg", category: "absurd" },
    { name: "Atlantis", image: "/assets/tierlist/atlantis.jpg", category: "absurd" },
    { name: "El Dorado", image: "/assets/tierlist/el-dorado.jpg", category: "absurd" },
    { name: "Holy Grail", image: "/assets/tierlist/holy-grail.jpg", category: "absurd" },
    { name: "Excalibur", image: "/assets/tierlist/excalibur.jpg", category: "absurd" },
    { name: "Pandora's box", image: "/assets/tierlist/pandora-s-box.jpg", category: "absurd" },
    { name: "Trojan Horse", image: "/assets/tierlist/trojan-horse.jpg", category: "absurd" },
    { name: "Gargoyle", image: "/assets/tierlist/gargoyle.jpg", category: "absurd" },
    { name: "Garden gnome", image: "/assets/tierlist/garden-gnome.jpg", category: "absurd" },
    { name: "Rubber duck", image: "/assets/tierlist/rubber-duck.jpg", category: "absurd" },
    { name: "Yo-yo", image: "/assets/tierlist/yo-yo.jpg", category: "absurd" },
    { name: "Slinky", image: "/assets/tierlist/slinky.jpg", category: "absurd" },
    { name: "Boomerang", image: "/assets/tierlist/boomerang.jpg", category: "absurd" },
    { name: "Magic 8-ball", image: "/assets/tierlist/magic-8-ball.jpg", category: "absurd" },
    { name: "Whoopee cushion", image: "/assets/tierlist/whoopee-cushion.jpg", category: "absurd" },
    { name: "Bobblehead", image: "/assets/tierlist/bobblehead.jpg", category: "absurd" },
    { name: "Gummy bear", image: "/assets/tierlist/gummy-bear.jpg", category: "absurd" },
    { name: "Plastic flamingo", image: "/assets/tierlist/plastic-flamingo.jpg", category: "absurd" },
    { name: "Lawn gnome", image: "/assets/tierlist/lawn-gnome.jpg", category: "absurd" },
    { name: "Mood ring", image: "/assets/tierlist/mood-ring.jpg", category: "absurd" },
    { name: "Lava lamp", image: "/assets/tierlist/lava-lamp.jpg", category: "absurd" },
    { name: "Disco ball", image: "/assets/tierlist/disco-ball.jpg", category: "absurd" },
    { name: "Snow globe", image: "/assets/tierlist/snow-globe.jpg", category: "absurd" },
    { name: "Pet rock", image: "/assets/tierlist/pet-rock.jpg", category: "absurd" },
    { name: "Tamagotchi", image: "/assets/tierlist/tamagotchi.jpg", category: "absurd" },
    { name: "Furby", image: "/assets/tierlist/furby.png", category: "absurd" },
    { name: "Stick figure", image: "/assets/tierlist/stick-figure.png", category: "absurd" },
    { name: "Toilet paper", image: "/assets/tierlist/toilet-paper.jpg", category: "absurd" },
    { name: "Toaster", image: "/assets/tierlist/toaster.png", category: "absurd" },
    { name: "Rubik's Cube", image: "/assets/tierlist/rubik-s-cube.jpg", category: "absurd" },
    { name: "Pogo stick", image: "/assets/tierlist/pogo-stick.jpg", category: "absurd" },
    { name: "Slip 'N Slide", image: "/assets/tierlist/slip-n-slide.png", category: "absurd" },
    { name: "Trampoline", image: "/assets/tierlist/trampoline.jpg", category: "absurd" },
    { name: "Pool noodle", image: "/assets/tierlist/pool-noodle.jpg", category: "absurd" },
    { name: "Inflatable castle", image: "/assets/tierlist/inflatable-castle.jpg", category: "absurd" },
    { name: "Bubble wrap", image: "/assets/tierlist/bubble-wrap.jpg", category: "absurd" },
    { name: "Duct tape", image: "/assets/tierlist/duct-tape.jpg", category: "absurd" },
    { name: "WD-40", image: "/assets/tierlist/wd-40.png", category: "absurd" },
    { name: "Spam (food)", image: "/assets/tierlist/spam-food.jpg", category: "absurd" },
    { name: "Marmite", image: "/assets/tierlist/marmite.png", category: "absurd" },
    { name: "Rickrolling", image: "/assets/tierlist/rickrolling.png", category: "internet" },
    { name: "Doge (meme)", image: "/assets/tierlist/doge-meme.jpg", category: "internet" },
    { name: "Grumpy Cat", image: "/assets/tierlist/grumpy-cat.jpg", category: "internet" },
    { name: "Keyboard Cat", image: "/assets/tierlist/keyboard-cat.jpg", category: "internet" },
    { name: "Nyan Cat", image: "/assets/tierlist/nyan-cat.png", category: "internet" },
    { name: "Pepe the Frog", image: "/assets/tierlist/pepe-the-frog.jpg", category: "internet" },
    { name: "Trollface", image: "/assets/tierlist/trollface.png", category: "internet" },
    { name: "LOLcat", image: "/assets/tierlist/lolcat.jpg", category: "internet" },
    { name: "Distracted boyfriend", image: "/assets/tierlist/distracted-boyfriend.jpg", category: "internet" },
    { name: "Harambe", image: "/assets/tierlist/harambe.jpg", category: "internet" },
    { name: "QR code", image: "/assets/tierlist/qr-code.png", category: "internet" },
    { name: "Emoji", image: "/assets/tierlist/emoji.png", category: "internet" },
    { name: "Association football", image: "/assets/tierlist/association-football.jpg", category: "sports" },
    { name: "Basketball", image: "/assets/tierlist/basketball.jpg", category: "sports" },
    { name: "Skateboarding", image: "/assets/tierlist/skateboarding.jpg", category: "sports" },
    { name: "Tennis", image: "/assets/tierlist/tennis.jpg", category: "sports" },
    { name: "Boxing", image: "/assets/tierlist/boxing.jpg", category: "sports" },
    { name: "Archery", image: "/assets/tierlist/archery.jpg", category: "sports" },
    { name: "Chess", image: "/assets/tierlist/chess.jpg", category: "sports" },
    { name: "Golf", image: "/assets/tierlist/golf.jpg", category: "sports" },
    { name: "Baseball", image: "/assets/tierlist/baseball.jpg", category: "sports" },
    { name: "American football", image: "/assets/tierlist/american-football.jpg", category: "sports" },
    { name: "Rugby football", image: "/assets/tierlist/rugby-football.jpg", category: "sports" },
    { name: "Cricket", image: "/assets/tierlist/cricket.jpg", category: "sports" },
    { name: "Volleyball", image: "/assets/tierlist/volleyball.jpg", category: "sports" },
    { name: "Bowling", image: "/assets/tierlist/bowling.jpg", category: "sports" },
    { name: "Darts", image: "/assets/tierlist/darts.jpg", category: "sports" },
    { name: "Curling", image: "/assets/tierlist/curling.jpg", category: "sports" },
    { name: "Skiing", image: "/assets/tierlist/skiing.jpg", category: "sports" },
    { name: "Snowboarding", image: "/assets/tierlist/snowboarding.jpg", category: "sports" },
    { name: "Surfing", image: "/assets/tierlist/surfing.jpg", category: "sports" },
    { name: "Climbing", image: "/assets/tierlist/climbing.jpg", category: "sports" },
    { name: "Cycling", image: "/assets/tierlist/cycling.jpg", category: "sports" },
    { name: "Marathon", image: "/assets/tierlist/marathon.jpg", category: "sports" },
    { name: "Yoga", image: "/assets/tierlist/yoga.jpg", category: "sports" },
    { name: "Karate", image: "/assets/tierlist/karate.jpg", category: "sports" },
    { name: "Taekwondo", image: "/assets/tierlist/taekwondo.jpg", category: "sports" },
    { name: "Sumo", image: "/assets/tierlist/sumo.jpg", category: "sports" },
    { name: "Fencing", image: "/assets/tierlist/fencing.jpg", category: "sports" },
    { name: "Wrestling", image: "/assets/tierlist/wrestling.jpg", category: "sports" },
    { name: "Rowing", image: "/assets/tierlist/rowing.jpg", category: "sports" },
    { name: "Sailing", image: "/assets/tierlist/sailing.jpg", category: "sports" },
    { name: "Swimming", image: "/assets/tierlist/swimming.jpg", category: "sports" },
    { name: "Skydiving", image: "/assets/tierlist/skydiving.jpg", category: "sports" },
    { name: "Tokyo", image: "/assets/tierlist/tokyo.jpg", category: "places" },
    { name: "Paris", image: "/assets/tierlist/paris.jpg", category: "places" },
    { name: "Hawaii", image: "/assets/tierlist/hawaii.png", category: "places" },
    { name: "Rome", image: "/assets/tierlist/rome.jpg", category: "places" },
    { name: "Dubai", image: "/assets/tierlist/dubai.jpg", category: "places" },
    { name: "Machu Picchu", image: "/assets/tierlist/machu-picchu.jpg", category: "places" },
    { name: "London", image: "/assets/tierlist/london.jpg", category: "places" },
    { name: "Grand Canyon", image: "/assets/tierlist/grand-canyon.jpg", category: "places" },
    { name: "Santorini", image: "/assets/tierlist/santorini.png", category: "places" },
    { name: "Barcelona", image: "/assets/tierlist/barcelona.jpg", category: "places" },
    { name: "Great Wall of China", image: "/assets/tierlist/great-wall-of-china.jpg", category: "places" },
    { name: "Egyptian pyramids", image: "/assets/tierlist/egyptian-pyramids.jpg", category: "places" },
    { name: "Eiffel Tower", image: "/assets/tierlist/eiffel-tower.jpg", category: "places" },
    { name: "Statue of Liberty", image: "/assets/tierlist/statue-of-liberty.jpg", category: "places" },
    { name: "Big Ben", image: "/assets/tierlist/big-ben.jpg", category: "places" },
    { name: "Colosseum", image: "/assets/tierlist/colosseum.jpg", category: "places" },
    { name: "Taj Mahal", image: "/assets/tierlist/taj-mahal.jpg", category: "places" },
    { name: "Mount Everest", image: "/assets/tierlist/mount-everest.jpg", category: "places" },
    { name: "Niagara Falls", image: "/assets/tierlist/niagara-falls.jpg", category: "places" },
    { name: "Sydney Opera House", image: "/assets/tierlist/sydney-opera-house.jpg", category: "places" },
    { name: "Times Square", image: "/assets/tierlist/times-square.jpg", category: "places" },
    { name: "Las Vegas Strip", image: "/assets/tierlist/las-vegas-strip.jpg", category: "places" },
    { name: "Venice", image: "/assets/tierlist/venice.jpg", category: "places" },
    { name: "Amsterdam", image: "/assets/tierlist/amsterdam.png", category: "places" },
    { name: "Berlin", image: "/assets/tierlist/berlin.jpg", category: "places" },
    { name: "Prague", image: "/assets/tierlist/prague.jpg", category: "places" },
    { name: "Vienna", image: "/assets/tierlist/vienna.jpg", category: "places" },
    { name: "Reykjavik", image: "/assets/tierlist/reykjavik.jpg", category: "places" },
    { name: "Bali", image: "/assets/tierlist/bali.png", category: "places" },
    { name: "Maldives", image: "/assets/tierlist/maldives.png", category: "places" },
    { name: "Iceland", image: "/assets/tierlist/iceland.png", category: "places" },
    { name: "Sahara", image: "/assets/tierlist/sahara.jpg", category: "places" },
    { name: "Antarctica", image: "/assets/tierlist/antarctica.png", category: "places" },
    { name: "North Pole", image: "/assets/tierlist/north-pole.png", category: "places" },
    { name: "Mount Fuji", image: "/assets/tierlist/mount-fuji.jpg", category: "places" },
    { name: "Galapagos Islands", image: "/assets/tierlist/galapagos-islands.jpg", category: "places" },
    { name: "Yellowstone National Park", image: "/assets/tierlist/yellowstone-national-park.jpg", category: "places" },
    { name: "Electric guitar", image: "/assets/tierlist/electric-guitar.png", category: "music" },
    { name: "Drum kit", image: "/assets/tierlist/drum-kit.png", category: "music" },
    { name: "Violin", image: "/assets/tierlist/violin.png", category: "music" },
    { name: "Cello", image: "/assets/tierlist/cello.png", category: "music" },
    { name: "Piano", image: "/assets/tierlist/piano.jpg", category: "music" },
    { name: "Saxophone", image: "/assets/tierlist/saxophone.png", category: "music" },
    { name: "Trumpet", image: "/assets/tierlist/trumpet.jpg", category: "music" },
    { name: "Flute", image: "/assets/tierlist/flute.jpg", category: "music" },
    { name: "Harp", image: "/assets/tierlist/harp.png", category: "music" },
    { name: "Accordion", image: "/assets/tierlist/accordion.jpg", category: "music" },
    { name: "Bagpipes", image: "/assets/tierlist/bagpipes.jpg", category: "music" },
    { name: "Sitar", image: "/assets/tierlist/sitar.jpg", category: "music" },
    { name: "Didgeridoo", image: "/assets/tierlist/didgeridoo.jpg", category: "music" },
    { name: "Theremin", image: "/assets/tierlist/theremin.jpg", category: "music" },
    { name: "Synthesizer", image: "/assets/tierlist/synthesizer.jpg", category: "music" },
    { name: "DJ mixer", image: "/assets/tierlist/dj-mixer.jpg", category: "music" },
    { name: "Microphone", image: "/assets/tierlist/microphone.jpg", category: "music" },
    { name: "Vinyl record", image: "/assets/tierlist/vinyl-record.jpg", category: "music" },
    { name: "Headphones", image: "/assets/tierlist/headphones.jpg", category: "music" },
    { name: "Karaoke", image: "/assets/tierlist/karaoke.jpg", category: "entertainment" },
    { name: "Board game", image: "/assets/tierlist/board-game.jpg", category: "entertainment" },
    { name: "Pinball", image: "/assets/tierlist/pinball.jpg", category: "entertainment" },
    { name: "Slot machine", image: "/assets/tierlist/slot-machine.jpg", category: "entertainment" },
    { name: "Roller coaster", image: "/assets/tierlist/roller-coaster.jpg", category: "entertainment" },
    { name: "Ferris wheel", image: "/assets/tierlist/ferris-wheel.jpg", category: "entertainment" },
    { name: "Carousel", image: "/assets/tierlist/carousel.jpg", category: "entertainment" },
    { name: "Bumper cars", image: "/assets/tierlist/bumper-cars.jpg", category: "entertainment" },
    { name: "Bowling alley", image: "/assets/tierlist/bowling-alley.jpg", category: "entertainment" },
    { name: "Movie theater", image: "/assets/tierlist/movie-theater.jpg", category: "entertainment" },
    { name: "Theme park", image: "/assets/tierlist/theme-park.jpg", category: "entertainment" },
    { name: "Sunset", image: "/assets/tierlist/sunset.jpg", category: "nature" },
    { name: "Rainbow", image: "/assets/tierlist/rainbow.jpg", category: "nature" },
    { name: "Sunflower", image: "/assets/tierlist/sunflower.jpg", category: "nature" },
    { name: "Cherry blossom", image: "/assets/tierlist/cherry-blossom.jpg", category: "nature" },
    { name: "Aurora (astronomy)", image: "/assets/tierlist/aurora-astronomy.jpg", category: "nature" },
    { name: "Lightning", image: "/assets/tierlist/lightning.jpg", category: "nature" },
    { name: "Tornado", image: "/assets/tierlist/tornado.jpg", category: "nature" },
    { name: "Volcano", image: "/assets/tierlist/volcano.jpg", category: "nature" },
    { name: "Geyser", image: "/assets/tierlist/geyser.jpg", category: "nature" },
    { name: "Glacier", image: "/assets/tierlist/glacier.jpg", category: "nature" },
    { name: "Iceberg", image: "/assets/tierlist/iceberg.jpg", category: "nature" },
    { name: "Coral reef", image: "/assets/tierlist/coral-reef.jpg", category: "nature" },
    { name: "Rainforest", image: "/assets/tierlist/rainforest.jpg", category: "nature" },
    { name: "Bamboo forest", image: "/assets/tierlist/bamboo-forest.jpg", category: "nature" },
    { name: "Cactus", image: "/assets/tierlist/cactus.jpg", category: "nature" },
    { name: "Bonsai", image: "/assets/tierlist/bonsai.jpg", category: "nature" },
    { name: "Mushroom", image: "/assets/tierlist/mushroom.jpg", category: "nature" },
    { name: "Carnivorous plant", image: "/assets/tierlist/carnivorous-plant.jpg", category: "nature" },
    { name: "Venus flytrap", image: "/assets/tierlist/venus-flytrap.jpg", category: "nature" },
    { name: "Mechanical keyboard", image: "/assets/tierlist/mechanical-keyboard.jpg", category: "tech" },
    { name: "Telescope", image: "/assets/tierlist/telescope.jpg", category: "tech" },
    { name: "Microscope", image: "/assets/tierlist/microscope.jpg", category: "tech" },
    { name: "Game Boy", image: "/assets/tierlist/game-boy.png", category: "tech" },
    { name: "3D printing", image: "/assets/tierlist/3d-printing.jpg", category: "tech" },
    { name: "Robot", image: "/assets/tierlist/robot.jpg", category: "tech" },
    { name: "Smartphone", image: "/assets/tierlist/smartphone.jpg", category: "tech" },
    { name: "Smartwatch", image: "/assets/tierlist/smartwatch.jpg", category: "tech" },
    { name: "Virtual reality", image: "/assets/tierlist/virtual-reality.jpg", category: "tech" },
    { name: "Compact disc", image: "/assets/tierlist/compact-disc.png", category: "tech" },
    { name: "Floppy disk", image: "/assets/tierlist/floppy-disk.jpg", category: "tech" },
    { name: "Walkman", image: "/assets/tierlist/walkman.png", category: "tech" },
    { name: "Cassette tape", image: "/assets/tierlist/cassette-tape.jpg", category: "tech" },
    { name: "Pager", image: "/assets/tierlist/pager.jpg", category: "tech" },
    { name: "Calculator", image: "/assets/tierlist/calculator.jpg", category: "tech" },
    { name: "Sewing machine", image: "/assets/tierlist/sewing-machine.jpg", category: "tech" },
    { name: "Typewriter", image: "/assets/tierlist/typewriter.jpg", category: "tech" },
    { name: "Motorcycle", image: "/assets/tierlist/motorcycle.jpg", category: "vehicles" },
    { name: "Sailboat", image: "/assets/tierlist/sailboat.png", category: "vehicles" },
    { name: "Space Shuttle", image: "/assets/tierlist/space-shuttle.jpg", category: "vehicles" },
    { name: "Cable car (railway)", image: "/assets/tierlist/cable-car-railway.jpg", category: "vehicles" },
    { name: "Hot air balloon", image: "/assets/tierlist/hot-air-balloon.jpg", category: "vehicles" },
    { name: "Submarine", image: "/assets/tierlist/submarine.jpg", category: "vehicles" },
    { name: "Helicopter", image: "/assets/tierlist/helicopter.jpg", category: "vehicles" },
    { name: "Tank", image: "/assets/tierlist/tank.jpg", category: "vehicles" },
    { name: "Train", image: "/assets/tierlist/train.jpg", category: "vehicles" },
    { name: "Skateboard", image: "/assets/tierlist/skateboard.jpg", category: "vehicles" },
    { name: "Roller skates", image: "/assets/tierlist/roller-skates.jpg", category: "vehicles" },
    { name: "Segway", image: "/assets/tierlist/segway.jpg", category: "vehicles" },
    { name: "Unicycle", image: "/assets/tierlist/unicycle.jpg", category: "vehicles" },
    { name: "Tricycle", image: "/assets/tierlist/tricycle.jpg", category: "vehicles" },
    { name: "Hovercraft", image: "/assets/tierlist/hovercraft.jpg", category: "vehicles" },
    { name: "Zeppelin", image: "/assets/tierlist/zeppelin.jpg", category: "vehicles" },
    { name: "Steamboat", image: "/assets/tierlist/steamboat.jpg", category: "vehicles" },
    { name: "Tuk-tuk", image: "/assets/tierlist/tuk-tuk.jpg", category: "vehicles" },
    { name: "Gondola", image: "/assets/tierlist/gondola.jpg", category: "vehicles" },
    { name: "Kayak", image: "/assets/tierlist/kayak.jpg", category: "vehicles" },
    { name: "Canoe", image: "/assets/tierlist/canoe.jpg", category: "vehicles" },
    { name: "Black hole", image: "/assets/tierlist/black-hole.jpg", category: "space" },
    { name: "Saturn", image: "/assets/tierlist/saturn.jpg", category: "space" },
    { name: "Mars", image: "/assets/tierlist/mars.png", category: "space" },
    { name: "Jupiter", image: "/assets/tierlist/jupiter.png", category: "space" },
    { name: "Mercury (planet)", image: "/assets/tierlist/mercury-planet.jpg", category: "space" },
    { name: "Venus", image: "/assets/tierlist/venus.jpg", category: "space" },
    { name: "Pluto", image: "/assets/tierlist/pluto.png", category: "space" },
    { name: "Moon", image: "/assets/tierlist/moon.jpg", category: "space" },
    { name: "Sun", image: "/assets/tierlist/sun.jpg", category: "space" },
    { name: "Comet", image: "/assets/tierlist/comet.jpg", category: "space" },
    { name: "Asteroid", image: "/assets/tierlist/asteroid.jpg", category: "space" },
    { name: "Galaxy", image: "/assets/tierlist/galaxy.jpg", category: "space" },
    { name: "Milky Way", image: "/assets/tierlist/milky-way.jpg", category: "space" },
    { name: "Nebula", image: "/assets/tierlist/nebula.jpg", category: "space" },
    { name: "Supernova", image: "/assets/tierlist/supernova.jpg", category: "space" },
    { name: "International Space Station", image: "/assets/tierlist/international-space-station.jpg", category: "space" },
    { name: "Hubble Space Telescope", image: "/assets/tierlist/hubble-space-telescope.jpg", category: "space" },
    { name: "Mars rover", image: "/assets/tierlist/mars-rover.jpg", category: "space" },
    { name: "Astronaut", image: "/assets/tierlist/astronaut.jpg", category: "space" },
    { name: "Christmas tree", image: "/assets/tierlist/christmas-tree.jpg", category: "holidays" },
    { name: "Halloween", image: "/assets/tierlist/halloween.jpg", category: "holidays" },
    { name: "Easter Bunny", image: "/assets/tierlist/easter-bunny.jpg", category: "holidays" },
    { name: "Thanksgiving", image: "/assets/tierlist/thanksgiving.jpg", category: "holidays" },
    { name: "Valentine's Day", image: "/assets/tierlist/valentine-s-day.jpg", category: "holidays" },
    { name: "New Year's Eve", image: "/assets/tierlist/new-year-s-eve.jpg", category: "holidays" },
    { name: "Oktoberfest", image: "/assets/tierlist/oktoberfest.jpg", category: "holidays" },
    { name: "Carnival", image: "/assets/tierlist/carnival.jpg", category: "holidays" },
    { name: "Diwali", image: "/assets/tierlist/diwali.jpg", category: "holidays" },
    { name: "Hanukkah", image: "/assets/tierlist/hanukkah.jpg", category: "holidays" },
    { name: "Lunar New Year", image: "/assets/tierlist/lunar-new-year.jpg", category: "holidays" },
    { name: "Dragon", image: "/assets/tierlist/dragon.png", category: "fantasy" },
    { name: "Crown", image: "/assets/tierlist/crown.jpg", category: "fantasy" },
    { name: "Castle", image: "/assets/tierlist/castle.jpg", category: "fantasy" },
    { name: "Treasure chest", image: "/assets/tierlist/treasure-chest.jpg", category: "fantasy" },
    { name: "Magic wand", image: "/assets/tierlist/magic-wand.jpg", category: "fantasy" },
    { name: "Crystal ball", image: "/assets/tierlist/crystal-ball.jpg", category: "fantasy" },
    { name: "Cauldron", image: "/assets/tierlist/cauldron.jpg", category: "fantasy" },
    { name: "Spellbook", image: "/assets/tierlist/spellbook.jpg", category: "fantasy" },
    { name: "Lego", image: "/assets/tierlist/lego.png", category: "objects" },
    { name: "Hammock", image: "/assets/tierlist/hammock.jpg", category: "objects" },
    { name: "Origami", image: "/assets/tierlist/origami.jpg", category: "objects" },
    { name: "Pottery", image: "/assets/tierlist/pottery.jpg", category: "objects" },
    { name: "Knitting", image: "/assets/tierlist/knitting.jpg", category: "objects" },
    { name: "Calligraphy", image: "/assets/tierlist/calligraphy.jpg", category: "objects" },
    { name: "Photography", image: "/assets/tierlist/photography.jpg", category: "objects" },
    { name: "Birdwatching", image: "/assets/tierlist/birdwatching.jpg", category: "objects" },
    { name: "Stamp collecting", image: "/assets/tierlist/stamp-collecting.jpg", category: "objects" },
    { name: "Model railway", image: "/assets/tierlist/model-railway.png", category: "objects" },
    { name: "Jigsaw puzzle", image: "/assets/tierlist/jigsaw-puzzle.jpg", category: "objects" },
    { name: "Tarot", image: "/assets/tierlist/tarot.jpg", category: "objects" },
    { name: "Yoga mat", image: "/assets/tierlist/yoga-mat.jpg", category: "objects" },
    { name: "Tent", image: "/assets/tierlist/tent.jpg", category: "objects" },
    { name: "Sleeping bag", image: "/assets/tierlist/sleeping-bag.jpg", category: "objects" },
    { name: "Compass", image: "/assets/tierlist/compass.jpg", category: "objects" },
    { name: "Pocket watch", image: "/assets/tierlist/pocket-watch.jpg", category: "objects" },
    { name: "Hourglass", image: "/assets/tierlist/hourglass.jpg", category: "objects" },
    { name: "Globe", image: "/assets/tierlist/globe.jpg", category: "objects" },
    { name: "Map", image: "/assets/tierlist/map.jpg", category: "objects" },
    { name: "Postcard", image: "/assets/tierlist/postcard.jpg", category: "objects" },
    { name: "Polaroid camera", image: "/assets/tierlist/polaroid-camera.jpg", category: "objects" },
    { name: "Teddy bear", image: "/assets/tierlist/teddy-bear.jpg", category: "objects" },
    { name: "Music box", image: "/assets/tierlist/music-box.jpg", category: "objects" },
    { name: "Kaleidoscope", image: "/assets/tierlist/kaleidoscope.jpg", category: "objects" },
    { name: "Mustache", image: "/assets/tierlist/mustache.jpg", category: "body" },
    { name: "Tattoo", image: "/assets/tierlist/tattoo.jpg", category: "body" },
    { name: "Beard", image: "/assets/tierlist/beard.jpg", category: "body" },
    { name: "Eyebrow", image: "/assets/tierlist/eyebrow.jpg", category: "body" },
    { name: "Nose", image: "/assets/tierlist/nose.png", category: "body" },
    { name: "Tongue", image: "/assets/tierlist/tongue.jpg", category: "body" },
    { name: "Sneeze", image: "/assets/tierlist/sneeze.jpg", category: "body" },
    { name: "Yawn", image: "/assets/tierlist/yawn.jpg", category: "body" },
    { name: "Goosebumps", image: "/assets/tierlist/goosebumps.png", category: "body" },
];

// ============================================================
// Seeded PRNG — mulberry32
// ============================================================

function mulberry32(seed) {
    var t = seed | 0;
    return function () {
        t = (t + 0x6D2B79F5) | 0;
        var r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function hashString(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash;
}

// ============================================================
// Week Key — ISO week starting Monday, UTC
// ============================================================

function getWeekKey(date) {
    var d = date ? new Date(date) : new Date();
    // Find the Monday of the current ISO week
    var day = d.getUTCDay(); // 0=Sun, 1=Mon, ...
    var diff = (day === 0 ? -6 : 1) - day;
    var monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + diff);
    monday.setUTCHours(0, 0, 0, 0);

    // ISO week number
    var year = monday.getUTCFullYear();
    var janFourth = new Date(Date.UTC(year, 0, 4));
    var daysSinceJan4 = Math.floor((monday - janFourth) / 86400000);
    var weekNum = Math.ceil((daysSinceJan4 + janFourth.getUTCDay()) / 7);
    if (weekNum < 1) {
        year--;
        weekNum = 52;
    }

    return year + '-W' + (weekNum < 10 ? '0' : '') + weekNum;
}

function getMondayDate(date) {
    var d = date ? new Date(date) : new Date();
    var day = d.getUTCDay();
    var diff = (day === 0 ? -6 : 1) - day;
    var monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + diff);
    monday.setUTCHours(0, 0, 0, 0);
    return monday;
}

function getNextMondayUTC(date) {
    var d = date ? new Date(date) : new Date();
    var day = d.getUTCDay();
    var daysUntilMonday = (day === 0 ? 1 : 8 - day);
    var nextMonday = new Date(d);
    nextMonday.setUTCDate(d.getUTCDate() + daysUntilMonday);
    nextMonday.setUTCHours(0, 0, 0, 0);
    return nextMonday;
}

// ============================================================
// Weekly Item Selection — bag-shuffle rotation
// ============================================================
// Each "cycle" reshuffles the whole catalog, then weeks are sequential
// 30-item slices through the shuffle. No item repeats within a cycle.
// After the cycle ends, a fresh shuffle starts with a new seed.
//
// 108 items / 30 per week = ceil(108/30) = 4 weeks per cycle.

var ITEMS_PER_WEEK = 30;

function weekIndex(weekKey) {
    var m = /^(\d{4})-W(\d{1,2})$/.exec(weekKey || '');
    if (!m) return 0;
    var year = parseInt(m[1], 10);
    var week = parseInt(m[2], 10);
    // 53 slots per year — covers ISO years that have a W53. Stable monotonic
    // integer for cycle math; adjacent weeks always have adjacent indices.
    return year * 53 + week;
}

function getWeeklyItems(weekKey) {
    var key = weekKey || getWeekKey();
    var catalogLen = ITEM_CATALOG.length;
    if (catalogLen === 0) return [];

    var weeksPerCycle = Math.max(1, Math.ceil(catalogLen / ITEMS_PER_WEEK));
    var idx = weekIndex(key);
    var cycleIdx = Math.floor(idx / weeksPerCycle);
    var weekInCycle = ((idx % weeksPerCycle) + weeksPerCycle) % weeksPerCycle;

    // Reshuffle once per cycle, deterministically
    var seed = hashString('cycle-' + cycleIdx);
    var rng = mulberry32(seed);
    var shuffled = [];
    for (var i = 0; i < catalogLen; i++) shuffled.push(i);
    for (var j = shuffled.length - 1; j > 0; j--) {
        var k = Math.floor(rng() * (j + 1));
        var tmp = shuffled[j];
        shuffled[j] = shuffled[k];
        shuffled[k] = tmp;
    }

    // Distribute items as evenly as possible across the cycle's weeks so we
    // don't end up with one short week. With 109 items / 4 weeks the sizes
    // become [28, 27, 27, 27] instead of [30, 30, 30, 19].
    var baseSize = Math.floor(catalogLen / weeksPerCycle);
    var extra = catalogLen - baseSize * weeksPerCycle;
    var thisWeekSize = baseSize + (weekInCycle < extra ? 1 : 0);
    var start = weekInCycle * baseSize + Math.min(weekInCycle, extra);
    var end = start + thisWeekSize;

    var items = [];
    for (var pos = start; pos < end; pos++) {
        var catalogIdx = shuffled[pos];
        items.push({
            index: items.length,
            catalogIndex: catalogIdx,
            name: ITEM_CATALOG[catalogIdx].name,
            image: ITEM_CATALOG[catalogIdx].image,
            category: ITEM_CATALOG[catalogIdx].category
        });
    }
    return items;
}

// Export for both browser (global) and Node.js (ESM)
if (typeof window !== 'undefined') {
    window.TierlistItems = {
        ITEM_CATALOG: ITEM_CATALOG,
        ITEMS_PER_WEEK: ITEMS_PER_WEEK,
        getWeekKey: getWeekKey,
        getMondayDate: getMondayDate,
        getNextMondayUTC: getNextMondayUTC,
        getWeeklyItems: getWeeklyItems,
        hashString: hashString,
        mulberry32: mulberry32,
        weekIndex: weekIndex
    };
}
