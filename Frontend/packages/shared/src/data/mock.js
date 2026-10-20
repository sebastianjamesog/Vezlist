import { provinces } from "./locations.js";

const img = (seed, size = 400) =>
  `https://picsum.photos/seed/${seed}/${size}/${size}`;

/**
 * The taxonomy. The strip shows the primaries; everything else lives behind
 * "More", which opens the filter sheet on its Category group.
 *
 * Each category carries `subs` — its sub-categories, as plain labels in the
 * order they should be offered. They are **optional at every point they are
 * asked for**: an ad may sit directly in Vehicles without ever naming one, and
 * a filter on Vehicles matches those ads too. That is the whole design
 * constraint — a required second choice turns a thirty-second post into a
 * taxonomy quiz, and the ads that lose are the ones nobody could classify.
 *
 * Labels, not ids, for the same reason the flat list used labels: a listing
 * stores what it says on the tile, and there is no join to get wrong. The cost
 * is that renaming a sub-category orphans the ads under it, which is the
 * console's problem to handle when it edits one.
 */
export const categories = [
  {
    id: "vehicles",
    label: "Vehicles",
    icon: "Car",
    primary: true,
    subs: ["Cars & Trucks", "Motorcycles", "Boats", "RVs & Campers", "Parts"],
  },
  {
    id: "jobs",
    label: "Jobs",
    icon: "Briefcase",
    primary: true,
    subs: ["Full-time", "Part-time", "Contract", "Hospitality", "Trades"],
  },
  {
    id: "services",
    label: "Services",
    icon: "Wrench",
    primary: true,
    subs: ["Cleaning", "Moving", "Repairs", "Tutoring", "Photography"],
  },
  {
    id: "electronics",
    label: "Electronics",
    icon: "Monitor",
    primary: true,
    subs: ["Computers", "Phones", "Cameras", "Audio", "Gaming"],
  },
  {
    id: "buy-sell",
    label: "Buy/Sell",
    icon: "Tag",
    primary: true,
    subs: ["Furniture", "Bikes", "Books", "Baby & Kids", "Free stuff"],
  },
  {
    id: "property",
    label: "Property",
    icon: "Building2",
    subs: ["For rent", "For sale", "Rooms", "Short term", "Commercial"],
  },
  {
    id: "fashion",
    label: "Fashion & Clothing",
    icon: "Shirt",
    subs: ["Womenswear", "Menswear", "Shoes", "Bags", "Jewellery"],
  },
  {
    id: "home-garden",
    label: "Home & Garden",
    icon: "House",
    subs: ["Furniture", "Appliances", "Garden", "Decor", "Kitchen"],
  },
  {
    id: "business",
    label: "Business/Industrial",
    icon: "Factory",
    subs: ["Equipment", "Office", "Retail", "Wholesale"],
  },
  {
    id: "pets",
    label: "Pets",
    icon: "PawPrint",
    subs: ["Dogs", "Cats", "Accessories", "Pet services"],
  },
  {
    id: "entertainment",
    label: "Entertainment",
    icon: "Clapperboard",
    subs: ["Instruments", "Films & TV", "Games", "Collectibles"],
  },
  {
    id: "fitness",
    label: "Fitness & Sports",
    icon: "Dumbbell",
    subs: ["Gym equipment", "Cycling", "Outdoors", "Team sports"],
  },
  {
    id: "antiques",
    label: "Antiques",
    icon: "Landmark",
    subs: ["Furniture", "Art", "Coins & Stamps", "Ceramics"],
  },
  {
    id: "education",
    label: "Education",
    icon: "GraduationCap",
    subs: ["Courses", "Tutoring", "Textbooks", "Music lessons"],
  },
  {
    id: "events",
    label: "Events",
    icon: "CalendarDays",
    subs: ["Tickets", "Venues", "Catering", "Weddings"],
  },
  {
    id: "travel",
    label: "Travel",
    icon: "Plane",
    subs: ["Flights", "Stays", "Luggage", "Tours"],
  },
  {
    id: "digital",
    label: "Digital",
    icon: "Cpu",
    subs: ["Software", "Domains", "Design", "Freelance"],
  },
  {
    id: "dating",
    label: "Dating",
    icon: "Heart",
    subs: ["Meetups", "Events", "Activity partners"],
  },
  {
    id: "tools",
    label: "Tools",
    icon: "Hammer",
    subs: ["Power tools", "Hand tools", "Ladders", "Workwear"],
  },
];

export const postCategories = categories.map((c) => c.label);

// The launcher grid on the home screen, in reading order. "personals" is
// not a category — it is the doorway to the other site.
export const homeCategories = [
  "vehicles",
  "personals",
  "buy-sell",
  "property",
  "services",
  "electronics",
  "entertainment",
  "jobs",
  "fashion",
];

// Quick-picks for the create-ad form; the full list lives in locations.js.
export const popularAreas = [
  "Greater Toronto Area",
  "Greater Montréal",
  "Metro Vancouver",
  "Vancouver Island",
  "Calgary",
  "Edmonton",
  "Winnipeg",
  "Halifax",
];

const provinceOfArea = new Map(
  provinces.flatMap((p) => p.areas.map((a) => [a, p.label])),
);

export const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "verified-first", label: "Verified first" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "nearest", label: "Nearest first" },
];

export const postedWithinOptions = [
  { value: "any", label: "Any time" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

const HOUR = 3_600_000;
const DAY = 86_400_000;

const rawListings = [
  [
    "Solid Oak Dining Table, Seats Six",
    "Harbour Home Goods",
    "home-garden",
    "Home & Garden",
    "Metro Vancouver",
    480,
    true,
    5 * HOUR,
    1.2,
  ],
  [
    "Cedar Raised Garden Beds, Pair",
    "Saanich Woodworks",
    "home-garden",
    "Home & Garden",
    "Vancouver Island",
    220,
    false,
    9 * HOUR,
    3.4,
  ],
  [
    "Mid-Century Armchair, Restored",
    "Westside Interiors",
    "home-garden",
    "Home & Garden",
    "Greater Toronto Area",
    340,
    false,
    2 * DAY,
    8.1,
  ],
  [
    "2012 Honda Accord EX-L Sedan",
    "Victoria Realty",
    "vehicles",
    "Vehicles",
    "Calgary",
    10250,
    true,
    2 * HOUR,
    2.0,
  ],
  [
    "Specialized Mountain Bike",
    "Ride Co.",
    "vehicles",
    "Vehicles",
    "Greater Montréal",
    850,
    true,
    1 * DAY,
    5.0,
  ],
  [
    "2016 Toyota Corolla, Low KM",
    "Island Autos",
    "vehicles",
    "Vehicles",
    "Fraser Valley",
    14400,
    false,
    11 * DAY,
    6.3,
  ],
  [
    "Senior React Developer",
    "Northfield Tech",
    "jobs",
    "Jobs",
    "Hamilton / Niagara",
    0,
    false,
    3 * HOUR,
    1.8,
  ],
  [
    "Part-Time Barista Wanted",
    "Bean & Co.",
    "jobs",
    "Jobs",
    "Edmonton",
    0,
    false,
    4 * DAY,
    4.5,
  ],
  [
    "Licensed Plumber, Same Day",
    "Coastal Plumbing",
    "services",
    "Services",
    "Winnipeg",
    120,
    false,
    20 * HOUR,
    3.9,
  ],
  [
    "House Cleaning, Weekly Rates",
    "Tidy Nest",
    "services",
    "Services",
    "Halifax",
    90,
    false,
    16 * DAY,
    9.2,
  ],
  [
    'MacBook Pro 14" M3, Warranty',
    "TechResale",
    "electronics",
    "Electronics",
    "Thompson–Okanagan",
    1899,
    true,
    6 * HOUR,
    1.1,
  ],
  [
    "Sony A7 III + 28-70mm Lens",
    "Lens Market",
    "electronics",
    "Electronics",
    "Eastern Ontario",
    1450,
    false,
    8 * DAY,
    7.4,
  ],
  [
    "Coffee Meetups, Weeknights",
    "Riverside Social",
    "personals",
    "Personals",
    "Metro Vancouver",
    0,
    true,
    40 * 60_000,
    0.8,
  ],
  [
    "Hiking Buddy for Weekends",
    "Trailhead Collective",
    "personals",
    "Personals",
    "Vancouver Island",
    0,
    false,
    3 * DAY,
    4.1,
  ],
  [
    "Dinner & Drinks, Downtown",
    "Marina V.",
    "personals",
    "Personals",
    "Greater Toronto Area",
    0,
    true,
    25 * 60_000,
    1.1,
  ],
  [
    "Looking for a Gym Partner",
    "Dev R.",
    "personals",
    "Personals",
    "Calgary",
    0,
    false,
    2 * HOUR,
    2.6,
  ],
  [
    "Late-Night Conversation",
    "Noor A.",
    "personals",
    "Personals",
    "Greater Montréal",
    0,
    false,
    3 * HOUR,
    0.9,
  ],
  [
    "Someone to Watch Films With",
    "Theo L.",
    "personals",
    "Personals",
    "Metro Vancouver",
    0,
    false,
    7 * HOUR,
    3.3,
  ],
  [
    "New in Town, Show Me Around",
    "Priya S.",
    "personals",
    "Personals",
    "Fraser Valley",
    0,
    false,
    14 * HOUR,
    5.7,
  ],
  [
    "Dance Partner Wanted — Salsa",
    "Camila O.",
    "personals",
    "Personals",
    "Hamilton / Niagara",
    0,
    false,
    1 * DAY,
    6.2,
  ],
  [
    "Long Walks and Live Music",
    "Jonah K.",
    "personals",
    "Personals",
    "Edmonton",
    0,
    false,
    2 * DAY,
    4.8,
  ],
  [
    "Sunday Brunch Regular",
    "Elise M.",
    "personals",
    "Personals",
    "Vancouver Island",
    0,
    false,
    4 * DAY,
    7.4,
  ],
  [
    "Weekend Getaway Companion",
    "Rowan T.",
    "personals",
    "Personals",
    "Greater Toronto Area",
    0,
    false,
    6 * DAY,
    9.1,
  ],
  [
    "Casual Coffee, No Pressure",
    "Sam W.",
    "personals",
    "Personals",
    "Metro Vancouver",
    0,
    false,
    9 * DAY,
    2.2,
  ],
  [
    "Trek Marlin Mountain Bike",
    "Island Cycle Exchange",
    "buy-sell",
    "Buy/Sell",
    "Greater Toronto Area",
    650,
    false,
    6 * HOUR,
    3.4,
  ],
  [
    "Vintage Leather Jacket, Size M",
    "Second Story Threads",
    "fashion",
    "Fashion & Clothing",
    "Calgary",
    120,
    false,
    2 * DAY,
    1.9,
  ],
  [
    "Golden Retriever Puppies, Ready Now",
    "Cedarwood Kennels",
    "pets",
    "Pets",
    "Greater Montréal",
    900,
    true,
    11 * HOUR,
    5.2,
  ],
  [
    "DeWalt Cordless Drill Set",
    "Westside Tool Depot",
    "tools",
    "Tools",
    "Fraser Valley",
    210,
    false,
    30 * HOUR,
    2.2,
  ],
  [
    "Squat Rack and Olympic Weights",
    "Fitline Resale",
    "fitness",
    "Fitness & Sports",
    "Hamilton / Niagara",
    540,
    false,
    4 * DAY,
    6.7,
  ],
  [
    "Logo and Brand Kit, 48h Turnaround",
    "Pixelcraft Studio",
    "digital",
    "Digital",
    "Edmonton",
    300,
    false,
    3 * HOUR,
    0.9,
  ],
  [
    "Saturday Night Jazz at the Wharf",
    "Wharfside Events",
    "events",
    "Events",
    "Winnipeg",
    25,
    false,
    20 * HOUR,
    1.1,
  ],
  [
    "Antique Oak Writing Desk, 1920s",
    "Fernwood Antiques",
    "antiques",
    "Antiques",
    "Halifax",
    780,
    false,
    5 * DAY,
    5.8,
  ],
  [
    "2 Bed Condo, Downtown, Parking Incl.",
    "Lakeview Property Group",
    "property",
    "Property",
    "Greater Toronto Area",
    2450,
    true,
    4 * HOUR,
    2.6,
  ],
  [
    "Basement Suite, Utilities Included",
    "Bowview Rentals",
    "property",
    "Property",
    "Calgary",
    1150,
    false,
    11 * HOUR,
    5.3,
  ],
  [
    "Retail Unit, 800 sq ft, Main Street",
    "Harbour Commercial",
    "property",
    "Property",
    "Halifax",
    1900,
    false,
    3 * DAY,
    12.4,
  ],
];

const subsById = new Map(categories.map((c) => [c.id, c.subs ?? []]));

/**
 * FNV-1a over the title. The rows need a sub-category each and the raw table
 * does not carry one; `Math.random()` would put an ad in Motorcycles on the
 * server and Boats in the browser, and React throws out the whole tree when the
 * two disagree. A hash of the title is the same number everywhere and stays the
 * same across reloads.
 */
function hashTitle(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * One sub-category, or none.
 *
 * Roughly one ad in five is left unclassified on purpose. A sub-category is
 * optional, and a mock where every single row has one would let every screen be
 * built against the happy path — the "Vehicles, no sub-category" ad is the one
 * that finds the bug in a heading, a chip or a filter.
 */
function subcategoryFor(categoryId, title) {
  const subs = subsById.get(categoryId);
  if (!subs?.length) return null;
  const h = hashTitle(title);
  if (h % 5 === 0) return null;
  return subs[h % subs.length];
}

/**
 * How many people have opened the ad.
 *
 * Same hash, and the same reason as the sub-category above: a random draw hands
 * the server one number and the browser another, and React throws away the
 * whole tree rather than reconcile them. The title is salted so the two draws
 * are independent — without the salt the ad with the lowest sub-category index
 * would also be the least-read one, and the feed would quietly encode a pattern
 * nobody put there.
 *
 * The spread is lopsided on purpose: one row in seven lands in the thousands,
 * the rest in the low hundreds. A feed where every row reads "4.2K" has spent a
 * column of width to say nothing, and a view count only earns its place if it
 * separates one row from the one under it.
 */
function viewsFor(title) {
  const h = hashTitle(`${title}/views`);
  return h % 7 === 0 ? 4_000 + (h % 26_000) : 40 + (h % 3_400);
}

/**
 * An age for a personals post, 19 to 45.
 *
 * Wide enough that the board does not read as one demographic, and floored
 * clear of the 18+ line rather than sitting on it — a bound placed exactly at
 * the rule is the one that goes wrong the first time somebody widens the range
 * by a year and forgets which side of it this board is on.
 */
function ageFor(title) {
  return 19 + (hashTitle(`${title}/age`) % 27);
}

/**
 * Whether a personals poster has their "Available now" switch on.
 *
 * Hashed off the title rather than dealt round-robin, for the same reason
 * `ageFor` is: a flag that alternated every third row would be a stripe anyone
 * could see the moment they scrolled, and availability is meant to read as a
 * property of the person rather than of their position in the list. Roughly
 * three in five land on, which is enough that the board does not look deserted
 * and few enough that the switch means something when it is on.
 */
function availableFor(title) {
  return hashTitle(`${title}/available`) % 5 < 3;
}

const allListings = rawListings.map(
  (
    [
      title,
      business,
      categoryId,
      category,
      location,
      price,
      verified,
      postedMsAgo,
      distanceKm,
    ],
    i,
  ) => ({
    id: `l${i + 1}`,
    type: "item",
    adId: categoryId === "personals" ? "a2" : "a1",
    title,
    business,
    categoryId,
    category,
    subcategory: subcategoryFor(categoryId, title),
    location,
    province: provinceOfArea.get(location) ?? "Canada",
    price,
    verified,
    postedMsAgo,
    distanceKm,
    // On both boards and not just personals: "how many people have already
    // looked at this" is the one number a poster and a reader want for the same
    // reason, and a field that only half the rows carry makes the card guess.
    views: viewsFor(title),
    image: img(`listing-${i + 1}`),
  }),
);

/**
 * The two sites do not share a feed. personals.vezlist.cc serves the personals
 * posts; vezlist.cc serves everything else and links across for the rest.
 */

/**
 * Self-described, and only on the personals board — the marketplace sells
 * objects. Kept as one flat list rather than a taxonomy: people pick the word
 * they use for themselves, and a tree would make them pick twice.
 */
export const ethnicities = [
  "Asian",
  "Black",
  "Latino / Hispanic",
  "Middle Eastern",
  "Mixed",
  "South Asian",
  "White",
  "Other",
];

/**
 * What a post is *for*. The marketplace's nineteen categories describe objects
 * and none of them fits a person, so the board carries its own list — every
 * post over here is "Personals" as far as that list is concerned.
 */
export const personalsCategories = [
  "Women seeking Men",
  "Men seeking Women",
  "Women seeking Women",
  "Men seeking Men",
  "Casual encounters",
  "Dating",
  "Friendship",
  "Massage & wellness",
];

/**
 * How someone will meet, in the words the board actually uses. Four options and
 * not a free-text box: this is the one line on a personals post that a reader
 * scans for and gives up on if it is phrased eight different ways, and four
 * labels fit on one row of pills where a taxonomy would need a screen.
 *
 * Optional like everything else in that group — "by arrangement" is a real
 * answer, but so is declining to give one.
 */
export const availabilityOptions = [
  "Incall",
  "Outcall",
  "Incall & Outcall",
  "By arrangement",
];

export const personalsListings = allListings
  .filter((l) => l.categoryId === "personals")
  // Mock data: the board has no profiles behind it, so the posts are dealt one
  // of each in order rather than left blank. The category strides by three so
  // the two lists do not line up and every post is not one fixed pairing.
  .map((l, i) => ({
    ...l,
    // Hashed rather than dealt round-robin like the two lists below it. An age
    // that climbed a year per row would be visible as a gradient the moment
    // anyone scrolled, where ethnicity and category are unordered sets and a
    // cycle through them reads as nothing in particular.
    age: ageFor(l.title),
    // The poster's own switch, not a guess made from distance or from how
    // recently they posted. It is the one field on this board that the
    // person behind the post controls in real time, which is what makes
    // "Available now" worth filtering on at all — see the Availability
    // group in `settingsGroups`.
    available: availableFor(l.title),
    ethnicity: ethnicities[i % ethnicities.length],
    personalsCategory:
      personalsCategories[(i * 3) % personalsCategories.length],
  }));
export const listings = allListings.filter(
  (l) => l.categoryId !== "personals",
);

export const people = [
  {
    id: "p1",
    name: "Alex M.",
    age: 28,
    distanceKm: 1.2,
    status: "available",
    badge: "verified",
    activeLabel: "Active 5 min ago",
  },
  {
    id: "p2",
    name: "Oluwaseun A.",
    age: 35,
    distanceKm: 1.8,
    status: "available",
    badge: "shield",
    activeLabel: "Active 15 min ago",
  },
  {
    id: "p3",
    name: "Jordan K.",
    age: 32,
    distanceKm: 2.1,
    status: "available",
    badge: "shield",
    activeLabel: "Active 5 min ago",
  },
  {
    id: "p4",
    name: "Priya S.",
    age: 26,
    distanceKm: 2.8,
    status: "busy",
    badge: "star",
    activeLabel: "Active less than an hour ago",
  },
  {
    id: "p5",
    name: "Priya S.",
    age: 26,
    distanceKm: 2.8,
    status: "busy",
    badge: "star",
    activeLabel: "Active less than an hour ago",
  },
  {
    id: "p6",
    name: "Priya S.",
    age: 26,
    distanceKm: 2.8,
    status: "busy",
    badge: "star",
    activeLabel: "Active less than an hour ago",
  },
].map((p, i) => ({ ...p, avatar: img(`person-${i + 1}`, 160) }));

const shot = (seed) => `https://picsum.photos/seed/${seed}/720/1280`;

/**
 * Status updates, WhatsApp-shaped: one entry per person, each holding the
 * updates they posted. `msAgo` is the newest update's age — that is what the
 * list sorts and labels by.
 */
export const stories = [
  {
    id: "me",
    name: "My status",
    own: true,
    avatar: img("story-me", 160),
    updates: [],
  },
  {
    id: "s1",
    name: "Selena Ortiz",
    avatar: img("story-1", 160),
    msAgo: 22 * 60_000,
    // Broadcasting right now — the tray says so, because a live update is
    // worth interrupting a scroll for and a two-hour-old one is not. Tapping
    // this bubble opens the broadcast, not the saved updates behind it.
    live: true,
    liveId: "lv1",
    updates: [
      {
        id: "s1a",
        image: shot("story-1a"),
        caption: "Golden hour at the pier",
      },
      { id: "s1b", image: shot("story-1b"), caption: "" },
      {
        id: "s1c",
        image: shot("story-1c"),
        caption: "Anyone up for coffee tomorrow?",
      },
    ],
  },
  {
    id: "s2",
    name: "Clara Bennett",
    avatar: img("story-2", 160),
    msAgo: 2 * HOUR,
    updates: [
      {
        id: "s2a",
        image: shot("story-2a"),
        caption: "New studio, finally unpacked",
      },
      { id: "s2b", image: shot("story-2b"), caption: "" },
    ],
  },
  {
    id: "s3",
    name: "Fabian Ruiz",
    avatar: img("story-3", 160),
    msAgo: 5 * HOUR,
    updates: [
      { id: "s3a", image: shot("story-3a"), caption: "Trail done. 14 km." },
    ],
  },
  {
    id: "s4",
    name: "George Kim",
    avatar: img("story-4", 160),
    msAgo: 20 * HOUR,
    updates: [
      { id: "s4a", image: shot("story-4a"), caption: "Market run" },
      { id: "s4b", image: shot("story-4b"), caption: "" },
      { id: "s4c", image: shot("story-4c"), caption: "" },
      { id: "s4d", image: shot("story-4d"), caption: "Sunset from the ferry" },
    ],
  },
  {
    id: "s5",
    name: "Priya Shah",
    avatar: img("story-5", 160),
    msAgo: 28 * HOUR,
    updates: [
      { id: "s5a", image: shot("story-5a"), caption: "Book club picks" },
    ],
  },
];

export const ads = {
  a1: {
    id: "a1",
    kind: "vehicle",
    title: "2012 Honda Accord EX-L Sedan",
    // Every non-personals feed row points its `adId` at this one body, so a
    // detail page that read its category back off "the row that links here"
    // would show whichever row happens to be first in the array — a Vehicles
    // card opening onto "Home & Garden". The body carries its own, which is
    // what a real ad would do and what the reverse lookup defers to.
    category: "Vehicles",
    subcategory: "Cars & Trucks",
    price: 10250,
    location: "City of Toronto",
    postedLabel: "Posted 2 hours ago",
    // Read next to `postedLabel` on the detail page, as one sentence about how
    // long the ad has been up and how far it got in that time. Either half on
    // its own is close to meaningless — twelve thousand views is remarkable in
    // an hour and dismal in a year.
    views: 12_336,
    photoCount: 6,
    photos: Array.from({ length: 6 }, (_, i) => img(`accord-${i + 1}`, 800)),
    // No `verified` and no `verifiedPhotoCount`, deliberately. This is the ad
    // nobody has checked, and it is the one that proves the detail page still
    // renders a plain gallery with no banner and no split headings — the case
    // that breaks first when a feature is only ever built against the ad
    // that has it.
    overviewTitle: "Vehicle overview",
    specs: [
      { label: "Mileage", value: "98,000 mi", icon: "Gauge", tone: "blue" },
      { label: "Title", value: "Clean", icon: "FileText", tone: "green" },
      { label: "Fuel", value: "Gasoline", icon: "Fuel", tone: "purple" },
      { label: "Trans.", value: "Automatic", icon: "Settings", tone: "orange" },
    ],
    description: [
      "Selling 2012 honda Accord it has 98,000 miles on it with clean title.",
      "This is a very clean and well kept vehicle.",
      "Oil changed. Tires just rotated complete diagnostics by mechanic.",
      "Everything works great and runs amazing. Down payment accepted to hold on it.",
      "Just need some space I bought a new car and I'm not saving this in my garage I charge extra fee for Delivery.",
    ],
    /**
     * The number a buyer taps Show to reveal (#25).
     *
     * It sits on the ad body rather than on the seller, because that is where
     * it sits on a real ad: the wizard's contact step asks for it per-ad, and
     * `listings.js` carries it on every row a poster publishes. Whether a
     * reader ever sees it is the seller's own "Show phone on ads" switch in
     * Settings, which is the whole point of the field existing.
     *
     * With no messaging anywhere in this product (#2 closed not-planned),
     * this is not one way to reach a seller. It is the way.
     */
    phone: "+1 250 555 0142",
    /**
     * The second way to reach a seller, revealed the same way the number is.
     *
     * It sits beside `phone` and is governed by its own switch, because the
     * two are not one decision: a poster who will take a call at any hour and
     * one who wants everything in writing are both common, and a single
     * "publish my contact details" toggle would force each of them to publish
     * the channel they did not want. Masked in the same style as the number
     * for the same reason — enough of it to tell a Gmail from a company
     * address before spending a reveal, and never in the markup before the
     * tap.
     */
    email: "victoria.realty@example.com",
    sellerId: "s1",
    seller: {
      name: "Victoria Realty",
      since: 2023,
      badge: "New User",
      avatar: img("seller-1", 160),
      online: true,
    },
  },
  a2: {
    id: "a2",
    kind: "person",
    title: "Sofia — Companionship",
    // No sub-category, and not because one was forgotten: Personals is a board,
    // not a branch of the marketplace tree, and the cut that matters there is
    // the personals category (see `personalsCategories`). This is the
    // degrades-to-the-category-alone case every screen has to handle.
    category: "Personals",
    subcategory: null,
    price: 250,
    location: "City of Toronto",
    postedLabel: "Posted 4 minutes ago",
    views: 8_412,
    verified: true,
    photoCount: 6,
    photos: Array.from({ length: 6 }, (_, i) => img(`sofia-${i + 1}`, 800)),
    /*
      How many of the photos above someone actually checked, counted from the
      front: the first `verifiedPhotoCount` are confirmed and the rest are not.

      A count, and not a `{ src, verified }` shape on `photos` — which was the
      other option and the one that reads better in isolation. It loses on blast
      radius. Four files outside the detail page take `ad.photos` to be a list of
      URLs: the saved-items thumbnail, both apps' openGraph image, and the
      console's ingest in `adminStore`. None of them care which photos were
      checked, so turning the array into objects would break all four to give
      the single screen that asks the question a slightly tidier answer.

      Ordering is the trade. Verified photos have to sit first in the array,
      because the detail page slices on that — a checked photo dropped into the
      middle of the list would silently reclassify everything after it.
    */
    verifiedPhotoCount: 4,
    overviewTitle: "Profile overview",
    /*
      Ten plain label/value pairs, rather than ten of the icon tiles that
      `specs` renders.

      The tiles work at four: each gets a coloured chip, and four chips read as a
      set of highlights. At ten they stop being highlights — the colour is on
      every row, so it distinguishes nothing, and the tile's padding turns what
      is really a short reference table into a screenful of scrolling. Eye colour
      does not want a badge. It wants to be findable by someone who has gone
      looking for it, which is what a two-column table is for.

      So this body carries `details` and no `specs`, and the detail page renders
      whichever of the two it is handed. The vehicle ad keeps its four tiles.
    */
    details: [
      { label: "Name", value: "Sofia R." },
      { label: "Age", value: "23" },
      { label: "City", value: "City of Toronto" },
      { label: "Ethnicity", value: "Latino / Hispanic" },
      { label: "Availability", value: "Incall & Outcall" },
      { label: "Height", value: "5'5\" (165 cm)" },
      { label: "Weight", value: "54 kg" },
      { label: "Body stats", value: "34-26-36" },
      { label: "Hair colour", value: "Brown" },
      { label: "Eye colour", value: "Hazel" },
    ],
    description: [
      "Friendly and easy going, happy to meet for coffee or a night out.",
      "Verified profile with a clean record and consistent reviews.",
      "Available most evenings and weekends across the city.",
    ],
    // The personals body's own number — see `a1.phone` for why it lives here.
    phone: "+1 604 555 0188",
    email: "sofia.t@example.com",
    sellerId: "s2",
    seller: {
      name: "Sofia R.",
      since: 2023,
      badge: "New User",
      avatar: img("seller-2", 160),
      online: true,
    },
  },
};

export const contactChannels = [
  {
    id: "chat",
    label: "Live chat",
    meta: "Replies in ~2 min",
    icon: "MessageSquare",
    tone: "blue",
    to: "/support/tickets",
    primary: true,
  },
  {
    id: "email",
    label: "Email",
    meta: "Within 24 hours",
    icon: "Mail",
    tone: "slate",
    href: "mailto:support@vezlist.cc",
  },
];

export const supportTopics = [
  {
    id: "posting",
    label: "Posting",
    sub: "Create, edit, approvals",
    icon: "Megaphone",
    to: "/support/faqs?cat=Posting",
  },
  {
    id: "safety",
    label: "Safety",
    sub: "Meetups, scams, reports",
    icon: "ShieldCheck",
    to: "/support/faqs?cat=Safety",
  },
  {
    id: "payments",
    label: "Payments",
    sub: "Cards, refunds",
    icon: "CreditCard",
    to: "/support/faqs?cat=Payments",
  },
  {
    id: "account",
    label: "Account",
    sub: "Login, profile, privacy",
    icon: "User",
    to: "/support/faqs?cat=Account",
  },
];

export const tickets = [
  {
    id: "1234",
    title: "Payment Issue (#1234)",
    meta: "Updated 2 hrs ago",
    status: "In Progress",
    icon: "ReceiptText",
  },
  {
    id: "1189",
    title: "Listing Rejected (#1189)",
    meta: "Closed yesterday",
    status: "Resolved",
    icon: "ClipboardCheck",
  },
];

export const faqs = [
  {
    q: "How to post an ad?",
    a: "Tap the + button in the bottom bar, fill in the title, category, description and location, add up to 6 photos, then hit Publish Ad.",
  },
  {
    q: "Safety tips for buyers",
    a: "Meet in a public place, inspect the item before paying, and never send a deposit to someone you have not met.",
  },
  {
    q: "Why was my payment declined?",
    a: "Most declines come from an expired card or a bank block on online payments. Check with your bank, then retry from Account Settings.",
  },
];

export const profile = {
  name: "Sarah Jenkins",
  email: "sarah.jenkins@example.com",
  phone: "+1 250 555 0134",
  bio: "Downsizing after twenty years in the same house. Everything listed is exactly as described.",
  location: "Victoria, BC",
  avatar: img("sarah", 300),
  verified: true,
  activeAds: 24,
  yearsActive: 5,
};

/**
 * The account menu. `cap` is the capability a row needs — a row without one is
 * for everybody, and the rows that are only any use to someone with ads to
 * manage name the capability that says so. Profile filters on it, which is why
 * a browsing account does not see a My Ads screen with nothing in it.
 */
export { profileMenu } from "./profileMenu.js";

export const myAds = [
  {
    id: "m1",
    listingId: "l1",
    status: "active",
    views: 412,
    saves: 18,
    expiresInDays: 21,
  },
  {
    id: "m2",
    listingId: "l4",
    status: "active",
    views: 1204,
    saves: 63,
    expiresInDays: 9,
  },
  {
    id: "m3",
    listingId: "l11",
    status: "pending",
    views: 0,
    saves: 0,
    expiresInDays: 30,
  },
  {
    id: "m4",
    listingId: "l6",
    status: "expired",
    views: 88,
    saves: 3,
    expiresInDays: 0,
  },
];

export const adStatuses = [
  { value: "active", label: "Active" },
  { value: "pending", label: "In review" },
  { value: "expired", label: "Expired" },
];

export const notifications = [
  {
    id: "n1",
    group: "Today",
    icon: "MessageSquare",
    tone: "blue",
    title: "New message from Victoria Realty",
    body: "Is the Accord still available?",
    time: "12 min ago",
    unread: true,
    to: "/ad/a1",
  },
  {
    id: "n2",
    group: "Today",
    icon: "Heart",
    tone: "rose",
    title: "Your ad was saved 5 times",
    body: "2012 Honda Accord EX-L Sedan",
    time: "2 hrs ago",
    unread: true,
    to: "/profile/ads",
  },
  {
    id: "n3",
    group: "Today",
    icon: "BadgeCheck",
    tone: "green",
    title: "Listing approved",
    body: 'MacBook Pro 14" M3 is now live.',
    time: "5 hrs ago",
    unread: false,
    to: "/profile/ads",
  },
  {
    id: "n4",
    group: "Earlier",
    icon: "Clock",
    tone: "amber",
    title: "Ad expiring in 3 days",
    body: "Luxury Apartment Available Now",
    time: "Yesterday",
    unread: false,
    to: "/profile/ads",
  },
  {
    id: "n5",
    group: "Earlier",
    icon: "ReceiptText",
    tone: "slate",
    title: "Ticket #1234 updated",
    body: "Support replied to your payment issue.",
    time: "2 days ago",
    unread: false,
    to: "/support/tickets/1234",
  },
];

export const ticketThreads = {
  1234: {
    id: "1234",
    subject: "Payment Issue",
    status: "In Progress",
    opened: "Opened 3 days ago",
    messages: [
      {
        id: 1,
        from: "you",
        author: "You",
        time: "3 days ago",
        body: "My card was charged twice for the same ad promotion. Order #A-99213.",
      },
      {
        id: 2,
        from: "agent",
        author: "Priya · Support",
        time: "2 days ago",
        body: "Thanks for flagging this. I can see both charges and have escalated the duplicate to our payments team.",
      },
      {
        id: 3,
        from: "agent",
        author: "Priya · Support",
        time: "2 hrs ago",
        body: "The refund is approved and should land in 3-5 business days. I'll keep this ticket open until you confirm.",
      },
    ],
  },
  1189: {
    id: "1189",
    subject: "Listing Rejected",
    status: "Resolved",
    opened: "Opened 8 days ago",
    messages: [
      {
        id: 1,
        from: "you",
        author: "You",
        time: "8 days ago",
        body: "My listing was rejected but I'm not sure which rule it broke.",
      },
      {
        id: 2,
        from: "agent",
        author: "Sam · Support",
        time: "7 days ago",
        body: "The photos included a phone number in the image. Re-upload without contact details in the picture and it will pass.",
      },
      {
        id: 3,
        from: "you",
        author: "You",
        time: "7 days ago",
        body: "Re-uploaded, thank you.",
      },
    ],
  },
};

export const faqCategories = ["Posting", "Safety", "Payments", "Account"];

export const allFaqs = [
  {
    q: "How to post an ad?",
    category: "Posting",
    a: "Tap the + button in the bottom bar, fill in the title, category, description and location, add up to 6 photos, then hit Publish Ad.",
  },
  {
    q: "How long does approval take?",
    category: "Posting",
    a: "Regular ads on Marketplace and Personals go live after their photos finish processing, without staff approval. Post as Verified ads stay private until staff approve the verification photo. You can continue verification from My Ads.",
  },
  {
    q: "Can I edit an ad after publishing?",
    category: "Posting",
    a: "Draft and rejected ads can be edited from My Ads. Saving a regular ad publishes it once its photos are ready; an ad requesting verification stays private until staff approve it. Active ads cannot currently be edited.",
  },
  {
    q: "Safety tips for buyers",
    category: "Safety",
    a: "Meet in a public place, inspect the item before paying, and never send a deposit to someone you have not met.",
  },
  {
    q: "How do I report a suspicious ad?",
    category: "Safety",
    // Corrected with issue #4. The old answer sent people to a Report button
    // that did not exist and promised a review "within a few hours" from a
    // team no report could reach. Both halves are now true: the control is
    // where this says it is, and what happens next is what actually happens.
    a: "Open the ad and tap Report under the seller card — or Report on a seller's profile or a live broadcast. Reports are saved on your device and listed under Account Settings; this preview has no server behind it, so nothing has reached a moderator yet. Blocking a seller works straight away and hides their ads from your feed.",
  },
  {
    q: "Why was my payment declined?",
    category: "Payments",
    a: "Most declines come from an expired card or a bank block on online payments. Check with your bank, then retry from Account Settings.",
  },
  {
    q: "How do I delete my account?",
    category: "Account",
    a: "Account Settings has Delete account at the bottom. Deletion removes your ads and cannot be undone.",
  },
  {
    q: "How do I change my email?",
    category: "Account",
    a: "Account Settings, then Personal details. You'll need to confirm the new address before it takes effect.",
  },
];

export const settingsGroups = [
  {
    title: "Account",
    items: [
      {
        id: "details",
        label: "Personal details",
        sub: "Name, email, phone",
        icon: "User",
        type: "link",
        to: "/profile/settings/details",
      },
      {
        id: "password",
        label: "Password",
        sub: "Change your password",
        icon: "Lock",
        type: "link",
        to: "/profile/settings/password",
      },
    ],
  },
  {
    title: "Notifications",
    items: [
      {
        id: "push",
        label: "Push notifications",
        sub: "Ad status, saves and support updates",
        icon: "Bell",
        type: "toggle",
        value: true,
      },
      {
        id: "email",
        label: "Email updates",
        sub: "Weekly digest of saved searches",
        icon: "Mail",
        type: "toggle",
        value: false,
      },
    ],
  },
  /**
   * Personals only, and the one group in this list that is.
   *
   * "Available now" is a claim about the person, not about the post — it says
   * they are free to be contacted this minute — and that is a sentence the
   * marketplace has no use for: a dining table is not available now, it is in
   * stock, which is a different fact with a different shelf life. So the group
   * carries `personalsOnly` and `Settings.jsx` drops it on the other board
   * rather than offering a switch that would filter nothing.
   *
   * It is a switch and not something inferred from distance or from how
   * recently someone posted, because every inference of this kind is a guess
   * the reader will take as a promise. Only the person behind the post knows,
   * so only they set it.
   */
  {
    title: "Availability",
    personalsOnly: true,
    items: [
      {
        id: "available",
        label: "Available now",
        sub: "Show a live badge and appear under Available Now",
        icon: "CircleDot",
        type: "toggle",
        value: true,
      },
    ],
  },
  {
    title: "Privacy",
    items: [
      {
        id: "phone",
        label: "Show phone on ads",
        sub: "Buyers tap Show to reveal it",
        icon: "Phone",
        type: "toggle",
        value: true,
      },
      {
        // Not the `email` id above it — that one is the weekly digest, this is
        // whether the address is on the ad at all, and a single stored key for
        // the two would tie a marketing preference to a contact channel.
        id: "contactEmail",
        label: "Show email on ads",
        sub: "Buyers tap Show to reveal it",
        icon: "Mail",
        type: "toggle",
        value: true,
      },
      {
        id: "location",
        label: "Precise location",
        sub: "Improves Nearby results",
        icon: "MapPin",
        type: "toggle",
        value: true,
      },
    ],
  },
];

/**
 * Who is behind an ad.
 *
 * `rating`, `reviews` and `responseTime` used to live here and are gone. All
 * three were seeded numbers presented as trust signals: reviews are not
 * shipping (#29 closed not-planned) so a star rating measured nothing, and
 * "usually replies within an hour" described a reply to a message this product
 * has no way to send (#2 closed not-planned, #46). What is left is what is
 * true — a name, where they are, when they joined, and the ads they posted.
 */
export const sellers = {
  s1: {
    id: "s1",
    name: "Victoria Realty",
    since: 2023,
    location: "Victoria, BC",
    badge: "New User",
    avatar: img("seller-1", 300),
    listingIds: ["l1", "l4", "l2"],
  },
  s2: {
    id: "s2",
    name: "Sofia R.",
    since: 2023,
    location: "Victoria, BC",
    badge: "New User",
    avatar: img("seller-2", 300),
    listingIds: ["l13", "l14"],
  },
};

/**
 * Sign-in shortcuts for a build with no backend.
 *
 * There is nothing to register against, so "create an account" invents one and
 * there is no way to come back to it later, or to see the other role at all —
 * signup always makes an ads creator, and browsing is only reachable by
 * switching down in Settings. These two rows are the way in to each view
 * without that detour.
 *
 * The passwords are printed on the screen on purpose: they authenticate nothing
 * (`AuthContext` records who you said you were and no more), and a demo
 * credential you have to ask someone for is not a demo credential. The day a
 * real backend lands, this array and the block that renders it are the first
 * two things to delete.
 */
export const demoAccounts = [
  {
    id: "creator",
    role: "creator",
    label: "Ads creator",
    blurb: "My Ads and the creator dashboard",
    email: "sarah@vezlist.cc",
    // Eight characters or more, or validateAuth rejects our own demo.
    password: "creator123",
  },
  {
    id: "browsing",
    role: "user",
    label: "Browsing",
    blurb: "Saved items and contact — nothing to manage",
    email: "alex@vezlist.cc",
    password: "browsing123",
  },
];

/**
 * The creator dashboard's numbers. Views and saves are summed off `myAds` at
 * render time; what cannot be derived from a four-row mock — the week-on-week
 * trend and the impression curve — is seeded here.
 */
export const creatorStats = {
  viewsTrend: 12.4,
  savesTrend: -3.1,
  // Seven days, oldest first. Drawn as a sparkline, so only the shape matters.
  viewsByDay: [128, 164, 141, 203, 187, 246, 231],
  savesByDay: [6, 9, 7, 12, 8, 14, 11],
  topAdIds: ["l4", "l1", "l6"],
};

/**
 * Live broadcasts. Nothing is actually streaming: the cover is a still, the
 * viewer count drifts on a timer in the player, and the chat is a seed the
 * viewer appends to. Real enough to build the screens against, and the only
 * thing that has to change when there is a media server is where `cover` and
 * `chat` come from.
 */
const liveChatSeed = [
  { id: "c1", name: "Dev R.", text: "just got here — what did I miss?" },
  { id: "c2", name: "Camila O.", text: "that view 😍" },
  { id: "c3", name: "Jonah K.", text: "how long are you on for tonight?" },
  { id: "c4", name: "Elise M.", text: "first time catching one of these live" },
];

export const liveStreams = [
  {
    id: "lv1",
    storyId: "s1",
    host: "Selena Ortiz",
    title: "Golden hour on the pier",
    viewers: 1243,
    startedMsAgo: 18 * 60_000,
    location: "Metro Vancouver",
    verified: true,
  },
  {
    id: "lv2",
    host: "Chloe Dubois",
    title: "Late-night studio session",
    viewers: 862,
    startedMsAgo: 42 * 60_000,
    location: "Halifax",
    verified: true,
  },
  {
    id: "lv3",
    host: "Aisha Rahman",
    title: "Walking the canal, ask me anything",
    viewers: 317,
    startedMsAgo: 9 * 60_000,
    location: "Greater Montréal",
    verified: false,
  },
  {
    id: "lv4",
    host: "Priya S.",
    title: "New in town — show me around",
    viewers: 2104,
    startedMsAgo: 63 * 60_000,
    location: "Fraser Valley",
    verified: true,
  },
  {
    id: "lv5",
    host: "Noah Fischer",
    title: "City lights from the roof",
    viewers: 154,
    startedMsAgo: 4 * 60_000,
    location: "Calgary",
    verified: false,
  },
  {
    id: "lv6",
    host: "Rowan T.",
    title: "Sunday cooking, bring opinions",
    viewers: 528,
    startedMsAgo: 27 * 60_000,
    location: "Hamilton / Niagara",
    verified: false,
  },
].map((s, i) => ({
  ...s,
  avatar: img(`live-host-${i + 1}`, 160),
  cover: shot(`live-${i + 1}`),
  chat: liveChatSeed,
}));

/**
 * Filler for the Live now grid on `next dev` only, so the page looks full
 * while you design it. `allLiveStreams` is what the Live page and the player
 * read: the real mock set in production, the set plus this in development.
 * `liveStreamFor` still reads `liveStreams` alone, so filler hosts never mark
 * a real creator as live.
 */
const liveFillerTitles = [
  "Morning run by the seawall", "Cooking ramen from scratch", "Rooftop sunset chat",
  "Vinyl night — requests open", "Painting a mural, part 2", "Coffee and questions",
  "Night market walk", "Guitar covers till late", "Studio tour + Q&A",
  "Rainy day reading", "Thrift haul try-on", "Late-night drive",
  "Beach bonfire hangout", "Plant care live", "Learning salsa, send help",
  "Baking sourdough", "Skyline from the 30th floor", "Game night, come say hi",
  "Stargazing at the lake", "Pottery wheel session", "Street food crawl",
  "Sketching strangers (nicely)", "Sunday jazz and brunch", "Hiking the ridge trail",
];
const liveFillerHosts = [
  "Jade W.", "Marco P.", "Anika R.", "Tomas V.", "Bea L.", "Kofi A.",
  "Sana M.", "Hugo D.", "Ivy C.", "Ravi N.", "Lena F.", "Ezra H.",
  "Mila J.", "Omar S.", "Tess G.", "Arjun K.", "Nora B.", "Felix T.",
  "Gia E.", "Caleb O.", "Yara Q.", "Milo Z.", "Aria U.", "Dante Y.",
];
const liveFillerPlaces = [
  "Metro Vancouver", "Greater Toronto", "Montréal", "Calgary",
  "Ottawa", "Hamilton / Niagara", "Victoria", "Edmonton",
];

const liveStreamFiller = liveFillerTitles.map((title, i) => ({
  id: `lv-mock-${i + 1}`,
  host: liveFillerHosts[i],
  title,
  viewers: 40 + ((i * 137) % 1900),
  startedMsAgo: (3 + ((i * 17) % 110)) * 60_000,
  location: liveFillerPlaces[i % liveFillerPlaces.length],
  verified: i % 3 === 0,
  avatar: img(`live-mock-host-${i + 1}`, 160),
  cover: shot(`live-mock-${i + 1}`),
  chat: liveChatSeed,
}));

export const allLiveStreams =
  process.env.NODE_ENV === "development"
    ? [...liveStreams, ...liveStreamFiller]
    : liveStreams;

/* ---------------------------------------------------------------------------
   Console-only seeds.

   The public apps never import anything below this line. They are here rather
   than in the admin package because everything the console moderates is
   already in this file, and a moderation queue split across two data files is
   a queue that goes stale on one side.
--------------------------------------------------------------------------- */

/**
 * Ads sitting in review. A set of titles rather than a second listings array,
 * so editing a listing does not mean editing it twice. Without this the
 * moderation queue opens empty, which
 * is the one state it must not open in.
 */
export const pendingTitles = new Set([
  "Cedar Raised Garden Beds, Pair",
  'MacBook Pro 14" M3, Warranty',
  "Golden Retriever Puppies, Ready Now",
  "Retail Unit, 800 sq ft, Main Street",
  "Late-Night Conversation",
  "Dance Partner Wanted — Salsa",
  "Casual Coffee, No Pressure",
]);

/** Ads a moderator already turned away, by title, with the reason on record. */
export const rejectedTitles = new Map([
  ["Someone to Watch Films With", "Contact details in the photos."],
]);

/**
 * The one shape the public apps have no data for. Reports are raised on the
 * public side by a screen that does not exist yet, so they are seeded whole:
 * this is the queue, not a projection of one.
 */
export const reports = [
  {
    id: "r1",
    site: "personals",
    targetType: "listing",
    targetId: "l17",
    reason: "Suspected escort advertising",
    detail:
      "Post lists hourly rates and links out to an off-site booking page.",
    reporter: "Dev R.",
    status: "open",
    createdMsAgo: 40 * 60_000,
  },
  {
    id: "r2",
    site: "marketplace",
    targetType: "listing",
    targetId: "l27",
    reason: "Prohibited item",
    detail: "Live animals need a breeder licence number on the ad.",
    reporter: "Elise M.",
    status: "open",
    createdMsAgo: 3 * 3_600_000,
  },
  {
    id: "r3",
    site: "personals",
    targetType: "stream",
    targetId: "lv3",
    reason: "Nudity on stream",
    detail: "Reported twice in the same broadcast.",
    reporter: "Jonah K.",
    status: "open",
    createdMsAgo: 12 * 60_000,
  },
  {
    id: "r4",
    site: "marketplace",
    targetType: "listing",
    targetId: "l11",
    reason: "Price looks like a scam",
    detail: "Well under market and the seller asks for an e-transfer deposit.",
    reporter: "Camila O.",
    status: "open",
    createdMsAgo: 20 * 3_600_000,
  },
  {
    id: "r5",
    site: "personals",
    targetType: "user",
    targetId: "p4",
    reason: "Impersonation",
    detail: "Photos taken from a public account under a different name.",
    reporter: "Noor A.",
    status: "open",
    createdMsAgo: 2 * 86_400_000,
  },
  {
    id: "r6",
    site: "marketplace",
    targetType: "listing",
    targetId: "l31",
    reason: "Duplicate posting",
    detail: "Same event posted four times this week.",
    reporter: "Theo L.",
    status: "resolved",
    createdMsAgo: 4 * 86_400_000,
  },
  {
    id: "r7",
    site: "personals",
    targetType: "listing",
    targetId: "l20",
    reason: "Wrong category",
    detail: "Reads like a dance class advert, not a personal.",
    reporter: "Sam W.",
    status: "dismissed",
    createdMsAgo: 6 * 86_400_000,
  },
  {
    id: "r8",
    site: "marketplace",
    targetType: "user",
    targetId: "s2",
    reason: "Off-platform payment",
    detail: "Asked a buyer to pay by gift card.",
    reporter: "Priya S.",
    status: "open",
    createdMsAgo: 30 * 3_600_000,
  },
];

/**
 * Who is signed into the console. The audit log needs an actor and "system" is
 * not an answer a moderator can be asked about later.
 */
export const adminUsers = [
  {
    id: "ad0",
    name: "Dana Whitfield",
    email: "dana@vezlist.cc",
    role: "owner",
    avatar: img("admin-0", 160),
    joined: "2024",
  },
  {
    id: "ad1",
    name: "Priya Nair",
    email: "priya@vezlist.cc",
    role: "moderator",
    avatar: img("admin-1", 160),
    joined: "2025",
  },
  {
    id: "ad2",
    name: "Sam Okafor",
    email: "sam@vezlist.cc",
    role: "support",
    avatar: img("admin-2", 160),
    joined: "2026",
  },
];

/** Replies an agent reaches for often enough to be worth not retyping. */
export const cannedReplies = [
  {
    id: "cr1",
    label: "Refund approved",
    body: "The refund is approved and should land in 3-5 business days. I will keep this ticket open until you confirm it arrived.",
  },
  {
    id: "cr2",
    label: "Photos need re-uploading",
    body: "The photos included contact details in the image itself. Re-upload without a phone number or email in the picture and the ad will pass review.",
  },
  {
    id: "cr3",
    label: "Asking for more detail",
    body: "Thanks for getting in touch. Could you send the order number and the date of the charge? That will let me find it on our side.",
  },
  {
    id: "cr4",
    label: "Closing as resolved",
    body: "Glad that sorted it. I am closing this ticket now — reply here any time and it reopens.",
  },
];

/** Push broadcasts already sent, newest first. */
export const broadcasts = [
  {
    id: "bc1",
    title: "Scheduled maintenance Sunday",
    body: "Posting is paused 02:00–04:00 PT while we move the search index.",
    tone: "amber",
    icon: "Clock",
    site: "all",
    sentMsAgo: 2 * 86_400_000,
    reach: 18420,
  },
  {
    id: "bc2",
    title: "Live is out of beta",
    body: "Broadcasts now show in the status tray. Tap a ring to watch.",
    tone: "rose",
    icon: "Radio",
    site: "personals",
    sentMsAgo: 9 * 86_400_000,
    reach: 6130,
  },
];

/**
 * Filler for the Personals Trending grid on `next dev` only — a fresh local
 * database has a handful of creators, which leaves the grid mostly empty
 * while you design it. Same shape as GET /api/v1/sellers/trending rows. The
 * ids are not accounts: tapping one opens "That creator doesn't exist".
 */
const trendingCreatorNames = [
  "Maya Chen", "Lucas Moreau", "Zara Okafor", "Elena Rossi", "Kai Tanaka",
  "Amara Singh", "Diego Alvarez", "Freya Lind", "Yusuf Demir", "Isla Murray",
  "Mateo Silva", "Leila Haddad", "Jonah Park", "Nadia Petrova", "Rafael Costa",
  "Hana Kim", "Theo Walsh", "Aaliyah Brooks", "Soren Berg", "Imani Mensah",
  "Luca Bianchi", "Mei Lin", "Owen Price",
];

export const trendingCreators = trendingCreatorNames.map((name, i) => ({
  id: `mock-creator-${i + 1}`,
  displayName: name,
  avatarUrl: null,
  verified: i % 4 === 0,
  postCount: 2 + ((i * 7) % 9),
  viewCount: 40 + ((i * 53) % 260),
  likeCount: 2 + ((i * 11) % 31),
  coverUrl: `https://picsum.photos/seed/trending-${i + 1}/480/600`,
}));
