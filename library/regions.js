// Growing regions for the ready-made guides.
// Every ready-made plant has a plant type (CLASS_OF). Each region gives advice
// for every type: suitability, planting time, and extra notes on soil, water,
// climate and pests, plus how many months to move its seasonal reminders.
// applyRegion() merges that into a plant's guide. Pure JavaScript (browser and Node).

export const CLASS_OF = {
  // Warm-season annuals
  "tomato": "warm", "cherry-tomato": "warm", "capsicum": "warm", "eggplant": "warm", "zucchini": "warm", "cucumber": "warm",
  "pumpkin": "warm", "bush-beans": "warm", "climbing-beans": "warm", "sweet-corn": "warm", "sweet-potato": "warm",
  "chilli-bell-lantern": "warm", "chilli-long-red": "warm", "basil": "warm", "thai-basil": "warm", "sunflower": "warm",
  "marigold": "warm", "toothache-plant": "warm",
  // Cool-season annuals
  "broccoli": "cool", "cabbage": "cool", "cauliflower": "cool", "kale": "cool", "english-spinach": "cool", "peas": "cool",
  "snow-peas": "cool", "bok-choy": "cool", "coriander": "cool", "dill": "cool", "sweet-pea": "cool", "onion": "cool",
  "garlic": "cool", "leek": "cool", "potato": "cool", "calendula": "cool",
  // Most-of-the-year vegetables
  "lettuce": "allyear", "rocket": "allyear", "carrot": "allyear", "beetroot": "allyear", "radish": "allyear", "silverbeet": "allyear",
  "celery": "allyear", "spring-onion": "allyear", "parsley": "allyear", "nasturtium": "allyear",
  // Perennials that need winter chill
  "apple": "chill", "peach": "chill", "raspberry": "chill", "rhubarb": "chill", "asparagus": "chill", "hops": "chill",
  // Mediterranean herbs (dry-loving)
  "rosemary": "med", "thyme": "med", "oregano": "med", "sage": "med", "marjoram": "med", "tarragon": "med", "bay-tree": "med",
  "french-lavender": "med", "yarrow-white": "med",
  // Soft perennial herbs
  "mint": "soft", "chives": "soft", "garlic-chives": "soft", "lemon-balm": "soft", "self-heal": "soft", "valerian": "soft",
  "comfrey": "soft", "echinacea-purpurea": "soft",
  // Frost-tender heat lovers
  "avocado": "tropical", "banana": "tropical", "passionfruit": "tropical", "frangipani": "tropical", "bougainvillea": "tropical",
  "ginger": "tropical", "turmeric": "tropical", "lemongrass": "tropical", "curry-leaf": "tropical", "vietnamese-mint": "tropical",
  // Citrus
  "lemon": "citrus", "lime": "citrus", "orange": "citrus", "mandarin": "citrus", "finger-lime": "citrus",
  // Hardy fruit
  "strawberry": "fruit", "fig": "fruit", "feijoa": "fruit", "olive": "fruit", "grape": "fruit", "mulberry": "fruit",
  // Acid-soil shrubs
  "camellia": "acid", "azalea": "acid", "gardenia": "acid", "hydrangea": "acid", "blueberry": "acid",
  // Tough flowering shrubs and perennials
  "rose": "shrub", "pelargonium": "shrub", "salvia": "shrub", "agapanthus": "shrub",
  // Australian natives
  "grevillea": "native", "bottlebrush": "native", "kangaroo-paw": "native", "lilly-pilly": "native", "westringia": "native",
  "lomandra": "native", "banksia": "native", "correa": "native", "warrigal-greens": "native",
  // Indoor plants
  "monstera": "indoor", "peace-lily": "indoor", "pothos": "indoor", "snake-plant": "indoor", "zz-plant": "indoor",
  "fiddle-leaf-fig": "indoor", "spider-plant": "indoor", "rubber-plant": "indoor", "heartleaf-philodendron": "indoor",
  "aloe-vera": "indoor", "boston-fern": "indoor", "moth-orchid": "indoor",
};

export const CLASSES = ["warm", "cool", "allyear", "chill", "med", "soft", "tropical", "citrus", "fruit", "acid", "shrub", "native", "indoor"];

const PLANTING = `## Planting out new seedlings

1. Water the pots an hour before planting.
2. Dig a hole twice the width of the pot and mix in compost.
3. Plant at the same depth it sat in the pot and firm the soil gently.
4. Water in deeply, ideally with seaweed solution to reduce transplant shock.
5. Mulch around (not touching) the stem.
6. Keep evenly moist for 2–3 weeks while roots establish.`;

const INDOOR = `## Indoor care basics

- **Light:** A north-facing window gets the most sun in Australia; east windows suit plants that like gentle light.
- **Pots:** Always use drainage holes, and empty saucers after watering.
- **Mix:** Use premium potting mix, never garden soil.
- **Water:** When the top 2–3 cm is dry; indoor pots dry slower than outdoor ones.
- **Airflow:** Fresh air helps prevent mildew and fungus gnats.
- **Feeding:** Half-strength liquid feed every 2–3 weeks from spring to autumn.`;

const NOTE = `## A note on traditional uses

Traditional uses are folk practice, not medical advice. Check with a GP or pharmacist before taking any herb medicinally, especially if pregnant, breastfeeding or on other medication.`;

const overview = (conditions) => `## Your local conditions\n\n${conditions}\n\n${PLANTING}\n\n${INDOOR}\n\n${NOTE}`;

export const REGIONS = [
  {
    id: "nsw",
    label: "Coastal NSW",
    places: "Sydney, Central Coast, Newcastle, Illawarra, NSW coast",
    short: "coastal NSW",
    fruitFly: "Queensland fruit fly",
    match: ["sydney", "central coast", "gosford", "woy woy", "umina", "ettalong", "terrigal", "wyong", "newcastle", "lake macquarie", "wollongong", "illawarra", "hunter", "port macquarie", "nowra", "kiama", "new south wales", "nsw", "parramatta", "penrith", "cronulla", "manly"],
    overview: overview(`Mild, humid climate with warm wet summers and cool dry winters. Frost is rare near the coast.

- **Seasons:** Warm-season crops go in from September; cool-season crops from February to June.
- **Frost:** Rare on the coast; light frosts in western Sydney and low inland valleys from June to August.
- **Soil:** Sandstone-derived sands and clays are low in nutrients. Dig in compost and aged manure every season.
- **Humidity:** Summer humidity brings powdery mildew, black spot and leaf diseases. Space plants for airflow and water in the morning.
- **Pests:** Queensland fruit fly from December to April; possums, snails and cabbage white butterflies.
- **Water:** Summer storms are unreliable; mulch heavily and water deeply rather than often.`),
    classes: {
      warm: { suit: "Grows well.", when: "September to December, with a second sowing in January for autumn crops." },
      cool: { suit: "Grows well in the cooler months.", when: "February to June (garlic and onions March to May)." },
      allyear: { suit: "Grows well most of the year.", when: "Year-round; give summer sowings afternoon shade." },
      chill: { suit: "Choose low-chill varieties; crops are lighter than in colder areas.", when: "Bare-rooted in winter (June to August)." },
      med: { suit: "Grows well with good drainage; humid summers are the main risk.", when: "Spring or autumn." },
      soft: { suit: "Grows well.", when: "Spring or autumn." },
      tropical: { suit: "Grows in warm, sheltered, frost-free spots.", when: "October to December." },
      citrus: { suit: "Grows well.", when: "Spring (September to November) or early autumn." },
      fruit: { suit: "Grows well.", when: "Deciduous types in winter; strawberries March to May; evergreens in spring or autumn." },
      acid: { suit: "Grows well in acidic soil and part shade.", when: "Autumn or spring." },
      shrub: { suit: "Grows well.", when: "Autumn or spring; bare-rooted roses in winter." },
      native: { suit: "Grows well.", when: "Autumn is best; spring is fine too." },
      indoor: { suit: "Easy indoors; can live outdoors in shade in frost-free coastal gardens.", when: "Any time." },
    },
  },
  {
    id: "seq",
    label: "South-east Queensland & northern NSW",
    places: "Brisbane, Gold Coast, Sunshine Coast, Northern Rivers",
    short: "SE Queensland",
    fruitFly: "Queensland fruit fly",
    match: ["brisbane", "queensland", "qld", "gold coast", "sunshine coast", "ipswich", "logan", "redcliffe", "noosa", "caloundra", "maroochydore", "byron", "lismore", "ballina", "tweed", "northern rivers", "coffs harbour", "grafton", "bundaberg", "hervey bay", "gympie", "rockhampton"],
    overview: overview(`Subtropical: hot, humid, stormy summers and mild, dry, sunny winters. Frost only in low inland pockets.

- **Seasons:** The best vegetable seasons are autumn, winter and spring. Midsummer heat, humidity and storms are hard on most crops.
- **Frost:** Rare near the coast; occasional light frosts inland (Ipswich, Lockyer Valley) in July.
- **Soil:** Clay and red soils hold water; sandy coastal soils need lots of compost. Raised beds help in the wet season.
- **Humidity:** Fungal diseases thrive December to March. Give plants space and remove diseased leaves.
- **Pests:** Queensland fruit fly almost year-round, plus caterpillars, grasshoppers and possums.
- **Water:** Wet summers and dry winters; water regularly from June to October.`),
    classes: {
      warm: { suit: "Grows well in spring and autumn; midsummer heat, humidity and storms make it hard.", when: "August to October, and again February to March.", water: "Water deeply in hot spells and mulch heavily.", climate: "Wet, humid summers bring fungal disease; give plants space and airflow.", pests: "Fruit fly pressure is high; bag or net all fruit.", shift: -1 },
      cool: { suit: "Grows well in the dry, mild winter; choose quick varieties.", when: "March to July.", climate: "Few frosts, so crops grow fast through winter.", shift: 1 },
      allyear: { suit: "Grows best March to October; summer sowings bolt and struggle.", when: "March to October; heat-tolerant varieties with shade in summer." },
      chill: { suit: "Difficult: most need winter chill. Choose very low-chill varieties or skip it.", when: "Bare-rooted in winter.", climate: "Too warm for good crops of rhubarb, asparagus and hops." },
      med: { suit: "Grows with excellent drainage; summer humidity can rot it. Try pots or raised beds.", when: "Autumn to spring.", water: "Keep on the dry side in the wet season." },
      soft: { suit: "Grows well; give afternoon shade in summer.", when: "Autumn to spring." },
      tropical: { suit: "Grows very well.", when: "Spring to early summer." },
      citrus: { suit: "Grows well.", when: "Autumn or spring.", pests: "Watch for gall wasp, leaf miner and bronze orange bug." },
      fruit: { suit: "Most grow well; strawberries are a winter–spring crop here.", when: "Strawberries March to April; others autumn to winter.", climate: "Humidity brings fungal disease to grapes and figs; choose resistant varieties." },
      acid: { suit: "Grows in acidic soil with afternoon shade; hydrangeas and azaleas wilt in the heat.", when: "Autumn.", water: "Mulch and water well in hot spells." },
      shrub: { suit: "Grows well; roses get black spot in humid summers.", when: "Autumn or winter." },
      native: { suit: "Most grow well; choose humidity-tolerant species, as many WA natives struggle.", when: "Autumn." },
      indoor: { suit: "Easy indoors; many grow outdoors in shade here.", when: "Any time." },
    },
  },
  {
    id: "tropics",
    label: "Tropical north",
    places: "Darwin, Cairns, Townsville, the Kimberley, Top End",
    short: "the tropics",
    fruitFly: "fruit fly",
    match: ["darwin", "top end", "northern territory", "nt", "katherine", "cairns", "townsville", "mackay", "whitsunday", "airlie", "port douglas", "cape york", "weipa", "torres", "broome", "kununurra", "kimberley", "derby", "port hedland", "karratha", "pilbara", "far north queensland", "fnq"],
    overview: overview(`Tropical: a hot, humid wet season (November to April) and a warm, dry season (May to October). No frost.

- **Seasons:** Most vegetables, herbs and flowers are grown in the dry season. Plant from March to June and harvest through to September.
- **Wet season:** Heavy rain, heat and humidity rot many plants; grow tropical crops, rest beds under mulch, or plant cover crops.
- **Soil:** Often sandy or lateritic and low in nutrients; add compost generously and use raised beds for wet-season drainage.
- **Heat:** Use 30–50% shade cloth over seedlings and leafy crops.
- **Pests:** Fruit fly, grasshoppers, caterpillars, fungal diseases and nematodes in sandy soil.
- **Water:** Water daily in the dry season; drip irrigation and mulch save water.`),
    classes: {
      warm: { suit: "Grow it in the dry season; the wet season is too hot, wet and buggy.", when: "March to June.", water: "Water daily in the dry season.", climate: "Wet-season rain, heat and disease end most crops by November.", shift: -6 },
      cool: { suit: "Possible only in the coolest dry-season months with heat-tolerant varieties; garlic and cauliflower rarely succeed.", when: "May to June.", climate: "Nights rarely get cold enough for heading crops.", shift: 3 },
      allyear: { suit: "Grow it in the dry season; most bolt or rot in the wet.", when: "April to August.", shift: -6 },
      chill: { suit: "Not suited: it needs winter cold. Try tropical alternatives instead.", when: "Not recommended here." },
      med: { suit: "Hard: rots in the wet season. Grow in pots of gritty mix, under cover over summer, or treat as a dry-season annual.", when: "Dry season (April to June).", water: "Keep dry; move pots out of monsoon rain.", shift: -6 },
      soft: { suit: "Grow it in the dry season with part shade; many die back or rot in the wet.", when: "April to June.", shift: -6 },
      tropical: { suit: "Grows very well.", when: "Early wet season (October to December).", water: "Water through the dry season." },
      citrus: { suit: "Grows, but fruit often stays green and less sweet; limes do best.", when: "Early wet season.", pests: "Fungal spots and citrus pests in the wet season." },
      fruit: { suit: "Strawberries are a dry-season crop; grapes, figs, olives and feijoas rarely fruit well.", when: "Strawberries April to May.", shift: 1 },
      acid: { suit: "Hard: camellias, azaleas and hydrangeas struggle in the heat; gardenias do best. Grow in pots in shade.", when: "Dry season." },
      shrub: { suit: "Roses struggle in the wet; pelargoniums and salvias grow in the dry season; agapanthus copes.", when: "Dry season." },
      native: { suit: "Choose tropical natives; southern species struggle in the humidity.", when: "Early wet season." },
      indoor: { suit: "Most grow outdoors in shade year-round; indoors, keep away from air-conditioner draughts.", when: "Any time." },
    },
  },
  {
    id: "perth",
    label: "Perth & south-west WA",
    places: "Perth, Mandurah, Bunbury, Margaret River, Albany",
    short: "Perth and the south-west",
    fruitFly: "Mediterranean fruit fly",
    match: ["perth", "fremantle", "joondalup", "rockingham", "mandurah", "bunbury", "busselton", "margaret river", "albany", "geraldton", "esperance", "western australia", "wa", "south-west wa"],
    overview: overview(`Mediterranean: hot, dry summers with strong easterly winds, and mild, wet winters.

- **Seasons:** Plant warm-season crops September to December and cool-season crops March to June.
- **Soil:** Perth's grey sand holds almost no water or nutrients and repels water when dry. Dig in compost plus clay or bentonite, and use a wetting agent each spring.
- **Water:** Sprinklers are limited to rostered days in summer and switched off over winter (check Water Corporation rules). Drippers under mulch work best.
- **Heat:** 40°C days and hot easterlies scorch leaves; use shade cloth in January and February.
- **Pests:** Mediterranean fruit fly (Queensland fruit fly is not established in WA), plus snails, caterpillars and nematodes in sand.
- **Frost:** Rare near the coast; light frosts in the hills and inland.`),
    replace: [["peninsula sand", "Perth sand"]],
    classes: {
      warm: { suit: "Grows well.", when: "September to December.", soil: "Improve sand with compost and clay, and use a wetting agent.", water: "Water deeply early in the morning on rostered days; drippers under mulch save water.", climate: "Use shade cloth on 40°C days and in hot easterlies.", pests: "Bag fruit and use Medfly traps." },
      cool: { suit: "Grows well in the mild, wet winter.", when: "March to June.", soil: "Improve sand with compost and clay.", shift: 1 },
      allyear: { suit: "Grows well; shade summer sowings.", when: "Most of the year; March to October is easiest.", soil: "Improve sand with compost and a wetting agent." },
      chill: { suit: "Choose low-chill varieties; the Perth Hills and south-west suit them best.", when: "Bare-rooted in winter.", soil: "Improve sand with plenty of compost." },
      med: { suit: "Thrives: the Mediterranean climate suits it perfectly.", when: "Autumn or spring.", water: "Very little once established." },
      soft: { suit: "Grows with afternoon shade and regular water in summer.", when: "Autumn or spring.", water: "Mulch well; sand dries out fast." },
      tropical: { suit: "Grows in warm, sheltered spots; protect from hot winds. Bananas and avocados need lots of water.", when: "Spring." },
      citrus: { suit: "Grows very well.", when: "Spring.", soil: "Improve sand with compost and feed little and often, as nutrients wash through.", pests: "Medfly attacks oranges and mandarins." },
      fruit: { suit: "Grows very well: figs, grapes, olives and mulberries love Perth.", when: "Deciduous types in winter; strawberries April to May.", pests: "Net figs against Medfly and birds." },
      acid: { suit: "Possible with care: grow in pots of acidic mix, in shade, and water with rainwater where bore water is alkaline.", when: "Autumn." },
      shrub: { suit: "Grows well.", when: "Autumn; bare-rooted roses in winter.", water: "Deep soak weekly in summer." },
      native: { suit: "Grows very well; WA natives such as kangaroo paw and banksia are local stars.", when: "Autumn, as the rains start.", soil: "Leave the sand unimproved for natives." },
      indoor: { suit: "Easy indoors; keep out of hot afternoon sun through west windows.", when: "Any time." },
    },
  },
  {
    id: "adelaide",
    label: "Adelaide & southern SA",
    places: "Adelaide, Adelaide Hills, Fleurieu, Barossa",
    short: "Adelaide",
    fruitFly: "fruit fly",
    match: ["adelaide", "south australia", "sa", "adelaide hills", "barossa", "mclaren vale", "fleurieu", "victor harbor", "mount barker", "gawler", "port lincoln", "mount gambier"],
    overview: overview(`Mediterranean: hot, dry summers with heatwaves above 40°C, and cool, wet winters.

- **Seasons:** Warm-season crops October to December; cool-season crops February to May.
- **Soil:** Often alkaline clay over limestone. Add compost and gypsum, or use raised beds. Acid-loving plants struggle.
- **Heat:** Use shade cloth on heatwave days and water deeply the evening before.
- **Fruit fly:** South Australia is largely fruit-fly free; follow any outbreak rules about moving fruit.
- **Frost:** Light frosts on the plains; heavier frosts in the Adelaide Hills.
- **Water:** Low summer rainfall; mulch heavily and use drip irrigation.`),
    classes: {
      warm: { suit: "Grows well.", when: "October to December.", soil: "Add compost and gypsum to heavy alkaline soil, or use raised beds.", water: "Deep water before heatwaves; shade cloth on 40°C days.", pests: "SA is largely fruit-fly free; follow any outbreak rules." },
      cool: { suit: "Grows well in the cool, wet winter.", when: "February to May." },
      allyear: { suit: "Grows well; shade summer sowings.", when: "Mostly February to November." },
      chill: { suit: "Grows well, especially in the Adelaide Hills.", when: "Bare-rooted in winter." },
      med: { suit: "Thrives in the Mediterranean climate.", when: "Autumn or spring." },
      soft: { suit: "Grows with afternoon shade and regular summer water.", when: "Autumn or spring." },
      tropical: { suit: "Possible only in warm, sheltered coastal spots; frost and dry heat make bananas and avocados hard.", when: "Late spring.", climate: "Protect from frost and hot dry winds." },
      citrus: { suit: "Grows well.", when: "Spring.", soil: "Alkaline soil can yellow the leaves; feed chelated iron and add sulphur." },
      fruit: { suit: "Grows very well: grapes, figs and olives love the climate.", when: "Deciduous types in winter; strawberries in autumn." },
      acid: { suit: "Hard in alkaline soil: grow in pots of acidic mix and water with rainwater.", when: "Autumn." },
      shrub: { suit: "Grows well.", when: "Autumn; bare-rooted roses in winter." },
      native: { suit: "Grows well; choose species from similar dry climates.", when: "Autumn." },
      indoor: { suit: "Easy indoors; protect from heatwaves near windows.", when: "Any time." },
    },
  },
  {
    id: "melbourne",
    label: "Melbourne & southern Victoria",
    places: "Melbourne, Geelong, Mornington, Gippsland",
    short: "Melbourne",
    fruitFly: "Queensland fruit fly",
    match: ["melbourne", "victoria", "vic", "geelong", "mornington", "frankston", "dandenong", "gippsland", "warrnambool", "bendigo", "werribee", "yarra valley"],
    overview: overview(`Cool temperate: changeable weather, warm to hot summers, and cold, damp winters with frosts in outer suburbs.

- **Seasons:** Plant warm-season crops once frosts pass, traditionally from early November. Cool-season crops February to May.
- **Frost:** Common June to August away from the bay; late cold snaps can happen into November.
- **Soil:** Often heavy clay in the east and north, sandy near the bay. Add compost and gypsum to clay.
- **Weather:** Hot northerly days can hit 40°C; mulch and water deeply before them.
- **Pests:** Queensland fruit fly has spread into parts of Victoria; also snails, slugs, aphids and possums.
- **Water:** Winter-wet, summer-dry; water regularly from December to March.`),
    classes: {
      warm: { suit: "Grows well through summer once frosts pass.", when: "Plant out from early November, after the last frost.", climate: "Cover seedlings on cold nights into November.", pests: "Queensland fruit fly now reaches parts of Victoria; use traps in summer.", shift: 1 },
      cool: { suit: "Grows well.", when: "February to May; peas into June." },
      allyear: { suit: "Grows well; slower in winter.", when: "August to April." },
      chill: { suit: "Grows very well; Melbourne's winters give apples and rhubarb the chill they need.", when: "Bare-rooted in winter." },
      med: { suit: "Grows well in sunny, free-draining spots.", when: "Spring or autumn." },
      soft: { suit: "Grows well.", when: "Spring or autumn." },
      tropical: { suit: "Hard: needs a warm, frost-free microclimate. Grow ginger and lemongrass in pots; bananas rarely fruit.", when: "Late spring.", climate: "Protect from frost or bring pots indoors over winter." },
      citrus: { suit: "Grows in sunny, sheltered spots; lemons and limes are easiest.", when: "Spring.", climate: "Protect young trees from frost." },
      fruit: { suit: "Grows well: figs, grapes, berries and feijoas do well.", when: "Deciduous types in winter; strawberries in autumn." },
      acid: { suit: "Grows very well.", when: "Autumn." },
      shrub: { suit: "Grows very well.", when: "Autumn; bare-rooted roses in winter." },
      native: { suit: "Most grow well; protect tropical species from frost.", when: "Autumn." },
      indoor: { suit: "Easy indoors; keep away from heaters in winter.", when: "Any time." },
    },
  },
  {
    id: "cold",
    label: "Tasmania, Canberra & cold tablelands",
    places: "Hobart, Launceston, Canberra, Blue Mountains, Ballarat, New England",
    short: "cold areas",
    fruitFly: "fruit fly",
    match: ["tasmania", "tas", "hobart", "launceston", "devonport", "burnie", "canberra", "act", "queanbeyan", "goulburn", "cooma", "jindabyne", "snowy", "armidale", "new england", "tamworth", "orange", "bathurst", "lithgow", "blue mountains", "katoomba", "ballarat", "daylesford", "toowoomba", "stanthorpe", "tablelands"],
    overview: overview(`Cold: frosty winters, mild to warm summers and a short growing season.

- **Seasons:** Plant warm-season crops after the last frost, usually mid-November. Cool crops go in late summer or early spring.
- **Frost:** Regular, sometimes heavy frosts from April to October. Know your last-frost date and use frost cloth.
- **Soil:** Varies widely; cold, wet soils warm slowly in spring, so raised beds help.
- **Advantages:** Cold winters suit apples, rhubarb, raspberries, garlic and other chill-loving crops.
- **Pests:** Snails, slugs, aphids and possums. Tasmania is fruit-fly free with strict quarantine rules on bringing in fruit and plants.
- **Water:** Summers can be dry; mulch and water deeply.`),
    classes: {
      warm: { suit: "Grows in the short summer; choose fast, cold-tolerant varieties.", when: "Mid-November to December, after the last frost.", climate: "Pick everything before the first autumn frost; use frost cloth on cold nights.", shift: 1 },
      cool: { suit: "Grows well; most go in late summer or early spring.", when: "February to March, and again August to September.", climate: "Hard frosts slow growth over winter." },
      allyear: { suit: "Grows from spring to autumn.", when: "September to March." },
      chill: { suit: "Ideal: cold winters give heavy crops.", when: "Bare-rooted in winter." },
      med: { suit: "Most grow well; French lavender and bay need shelter from hard frost.", when: "Spring.", climate: "Plant against a sunny wall for warmth." },
      soft: { suit: "Grows well; dies back in winter and returns in spring.", when: "Spring." },
      tropical: { suit: "Not suited outdoors: frost kills it. Grow in pots and bring indoors over winter, or treat as a summer annual.", when: "Summer only." },
      citrus: { suit: "Hard: grow lemons or limes in pots against a sunny wall and protect from frost; oranges rarely ripen.", when: "Late spring.", climate: "Cover or move indoors on frosty nights." },
      fruit: { suit: "Strawberries, raspberries and grapes grow well; figs need a warm wall; olives and feijoas need shelter.", when: "Deciduous types in winter; strawberries in spring.", climate: "Late frosts can kill blossom." },
      acid: { suit: "Grows well in sheltered spots; camellias and azaleas love the cool.", when: "Autumn or spring." },
      shrub: { suit: "Grows well; salvias and pelargoniums need shelter from frost.", when: "Spring; bare-rooted roses in winter." },
      native: { suit: "Choose frost-hardy species; tropical natives and some grevilleas need shelter.", when: "Spring." },
      indoor: { suit: "Easy indoors; keep warm in winter and away from cold windows.", when: "Any time." },
    },
  },
  {
    id: "arid",
    label: "Inland & arid",
    places: "Alice Springs, Kalgoorlie, Broken Hill, Mildura, Dubbo, western slopes",
    short: "inland areas",
    fruitFly: "fruit fly",
    match: ["alice springs", "tennant creek", "uluru", "kalgoorlie", "broken hill", "mildura", "dubbo", "griffith", "wagga", "mount isa", "longreach", "charleville", "roma", "emerald", "port augusta", "whyalla", "coober pedy", "outback", "inland", "riverina", "western slopes", "wheatbelt"],
    overview: overview(`Hot, dry summers often above 40°C, cold frosty winter nights and low, unreliable rainfall.

- **Seasons:** Grow warm-season crops in spring and autumn, avoiding midsummer. Cool crops do well in the mild winter days.
- **Heat:** Use 50% shade cloth over the vegetable patch from December to February.
- **Frost:** Clear winter nights bring frost from May to September.
- **Soil:** Often alkaline sand or red earth; add plenty of compost and mulch.
- **Water:** Water is precious; use drip irrigation under thick mulch and water early in the morning.
- **Wind:** Hot, dry winds; windbreaks make a big difference.`),
    classes: {
      warm: { suit: "Grows well in spring and autumn; midsummer heat stops fruit setting.", when: "August to October after the last frost, and again in February.", soil: "Add compost to alkaline sandy or red soil.", water: "Water deeply early in the morning; drip irrigation under thick mulch.", climate: "Use 50% shade cloth through summer.", shift: -1 },
      cool: { suit: "Grows well in the mild days of autumn and winter.", when: "March to May.", shift: 1 },
      allyear: { suit: "Best in autumn and spring; shade it in summer.", when: "February to May and August to October." },
      chill: { suit: "Possible where winters are frosty, but hot summers are hard on raspberries and rhubarb.", when: "Bare-rooted in winter.", water: "Needs regular water through summer." },
      med: { suit: "Thrives in the dry heat.", when: "Autumn." },
      soft: { suit: "Needs shade and regular water in summer.", when: "Autumn or late winter." },
      tropical: { suit: "Hard: hot dry summers and frosty nights. Grow in sheltered spots or pots.", when: "Spring.", climate: "Protect from frost and hot winds." },
      citrus: { suit: "Grows well with regular water; protect young trees from frost.", when: "Spring.", soil: "Alkaline soil yellows the leaves; feed chelated iron." },
      fruit: { suit: "Grows very well: grapes, figs, olives and mulberries love dry heat.", when: "Deciduous types in winter; strawberries in autumn with summer shade." },
      acid: { suit: "Not suited outdoors: alkaline soil, hard water and heat. Try gardenias in pots of acidic mix in shade.", when: "Autumn." },
      shrub: { suit: "Grows well; roses and salvias like the dry air.", when: "Autumn." },
      native: { suit: "Grows well; choose arid-zone species.", when: "Autumn." },
      indoor: { suit: "Easy indoors; keep away from hot windows and evaporative cooler draughts.", when: "Any time." },
    },
  },
];

export const regionById = (id) => REGIONS.find((r) => r.id === id) || null;

// Best-guess region from a typed location; null if nothing matches.
export function guessRegion(location) {
  const text = ` ${String(location).toLowerCase().replace(/[^a-z\s-]/g, " ")} `;
  // Most specific first: towns before states, so "Alice Springs, NT" is inland, not tropical.
  const order = ["arid", "tropics", "cold", "perth", "adelaide", "melbourne", "seq", "nsw"];
  for (const id of order) {
    const r = regionById(id);
    if (r.match.some((m) => text.includes(` ${m} `))) return r;
  }
  return null;
}

function shiftMonth(md, months) {
  if (!months) return md;
  const [m, d] = md.split("-").map(Number);
  const nm = ((m - 1 + months) % 12 + 12) % 12 + 1;
  return `${String(nm).padStart(2, "0")}-${String(Math.min(d, 28)).padStart(2, "0")}`;
}

// Merges regional advice into a ready-made guide (before reminder dates are set).
export function applyRegion(t, regionId) {
  const r = regionById(regionId);
  const block = r?.classes[CLASS_OF[t.slug]];
  if (!r || !block) return t;
  const swap = (s) => {
    let out = String(s ?? "");
    if (r.fruitFly !== "Queensland fruit fly") out = out.replace(/Queensland fruit fly/g, r.fruitFly);
    if (r.id !== "nsw") out = out.replace(/peninsula sand/gi, "sandy soil").replace(/the Woy Woy peninsula|the peninsula/gi, "your area").replace(/\bpeninsula\b/gi, "local");
    for (const [a, b] of r.replace || []) out = out.split(a).join(b);
    return out;
  };
  const add = (list, key, text, mode = "append") => {
    if (!text) return;
    const i = list.findIndex(([k]) => k === key);
    const tagged = `In ${r.short}: ${text}`;
    if (i < 0 || mode === "replace" || /^\s*(n\/?a)?\s*$/i.test(list[i][1])) {
      if (i < 0) list.push([key, mode === "replace" ? text : tagged]);
      else list[i] = [key, mode === "replace" ? text : tagged];
    } else list[i] = [key, `${list[i][1]} ${tagged}`];
  };
  const growing = (t.growing || []).map(([k, v]) => [k, swap(v)]);
  // "Planting time" sits after Position.
  const pi = growing.findIndex(([k]) => k === "Position");
  growing.splice(pi < 0 ? 0 : pi + 1, 0, ["Planting time", block.when]);
  add(growing, "Soil", block.soil);
  add(growing, "Water", block.water);
  add(growing, "Climate", block.climate);
  add(growing, "Pests", block.pests);
  return {
    ...t,
    summary: `${swap(t.summary)} In ${r.short}: ${block.suit.charAt(0).toLowerCase()}${block.suit.slice(1)}`,
    growing,
    uses: (t.uses || []).map(([k, v]) => [k, swap(v)]),
    cautions: (t.cautions || []).map((c) => ({ ...c, text: swap(c.text) })),
    harvest: swap(t.harvest),
    reminders: swap(t.reminders),
    tasks: (t.tasks || []).map((task) => (task.md ? { ...task, md: shiftMonth(task.md, block.shift || 0), title: swap(task.title), notes: swap(task.notes) } : task)),
    region: r.id,
  };
}
