import { provinces } from "./locations.js";

const img = (seed, size = 400) =>
  `https://picsum.photos/seed/${seed}/${size}/${size}`;

// The strip shows the primaries; everything else lives behind "More", which
// opens the filter sheet on its Category group.
export const categories = [
  { id: "vehicles", label: "Vehicles", icon: "Car", primary: true },
  { id: "jobs", label: "Jobs", icon: "Briefcase", primary: true },
  { id: "services", label: "Services", icon: "Wrench", primary: true },
  { id: "electronics", label: "Electronics", icon: "Monitor", primary: true },
  { id: "buy-sell", label: "Buy/Sell", icon: "Tag", primary: true },
  { id: "property", label: "Property", icon: "Building2" },
  { id: "fashion", label: "Fashion & Clothing", icon: "Shirt" },
  { id: "home-garden", label: "Home & Garden", icon: "House" },
  { id: "business", label: "Business/Industrial", icon: "Factory" },
  { id: "pets", label: "Pets", icon: "PawPrint" },
  { id: "entertainment", label: "Entertainment", icon: "Clapperboard" },
  { id: "fitness", label: "Fitness & Sports", icon: "Dumbbell" },
  { id: "antiques", label: "Antiques", icon: "Landmark" },
  { id: "education", label: "Education", icon: "GraduationCap" },
  { id: "events", label: "Events", icon: "CalendarDays" },
  { id: "travel", label: "Travel", icon: "Plane" },
  { id: "digital", label: "Digital", icon: "Cpu" },
  { id: "dating", label: "Dating", icon: "Heart" },
  { id: "tools", label: "Tools", icon: "Hammer" },
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
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "nearest", label: "Nearest first" },
];

export const priceBuckets = [
  { label: "Under $500", min: 0, max: 500 },
  { label: "$500 - $1,500", min: 500, max: 1500 },
  { label: "$1,500 - $5,000", min: 1500, max: 5000 },
  { label: "Over $5,000", min: 5000, max: null },
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
    location,
    province: provinceOfArea.get(location) ?? "Canada",
    price,
    verified,
    postedMsAgo,
    distanceKm,
    image: img(`listing-${i + 1}`),
  }),
);

/**
 * The two sites do not share a feed. personals.vezlist.cc serves the personals
 * posts; vezlist.cc serves everything else and links across for the rest.
 */
export const personalsListings = allListings.filter(
  (l) => l.categoryId === "personals",
);
export const listings = allListings.filter((l) => l.categoryId !== "personals");

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

export const mapPins = [
  { id: "m1", lat: 48.4284, lng: -123.3656, icon: "House" },
  { id: "m2", lat: 48.4452, lng: -123.3308, icon: "Briefcase" },
  { id: "m3", lat: 48.4183, lng: -123.3452, icon: "Car" },
  { id: "m4", lat: 48.4622, lng: -123.3765, icon: "User" },
];

export const ads = {
  a1: {
    id: "a1",
    kind: "vehicle",
    title: "2012 Honda Accord EX-L Sedan",
    price: 10250,
    location: "City of Toronto",
    postedLabel: "Posted 2 hours ago",
    photoCount: 6,
    photos: Array.from({ length: 6 }, (_, i) => img(`accord-${i + 1}`, 800)),
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
    phone: "+12505551005",
    email: "victoria.realty@gmail.com",
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
    price: 250,
    location: "City of Toronto",
    postedLabel: "Posted 2 hours ago",
    photoCount: 6,
    photos: Array.from({ length: 6 }, (_, i) => img(`sofia-${i + 1}`, 800)),
    overviewTitle: "Profile overview",
    specs: [
      { label: "Age", value: "23", icon: "Gauge", tone: "blue" },
      { label: "Height", value: "5'5\"", icon: "FileText", tone: "green" },
      { label: "Color", value: "Brown", icon: "Fuel", tone: "purple" },
      { label: "Gender", value: "Female", icon: "Settings", tone: "orange" },
    ],
    description: [
      "Friendly and easy going, happy to meet for coffee or a night out.",
      "Verified profile with a clean record and consistent reviews.",
      "Available most evenings and weekends across the city.",
    ],
    phone: "+12505551005",
    email: "sofia.meets@gmail.com",
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
    id: "call",
    label: "Call us",
    meta: "Mon-Fri, 9-5 PT",
    icon: "Phone",
    tone: "indigo",
    href: "tel:+12505551005",
  },
  {
    id: "email",
    label: "Email",
    meta: "Within 24 hours",
    icon: "Mail",
    tone: "slate",
    href: "mailto:support@vezlist.cc",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    meta: "Same day",
    icon: "MessagesSquare",
    tone: "green",
    href: "https://wa.me/12505551005",
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
    sub: "Credits, cards, refunds",
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
  rating: 4.8,
  reviews: 12,
};

export const profileMenu = [
  {
    id: "ads",
    to: "/profile/ads",
    label: "My Ads",
    sub: "Manage your active listings",
    icon: "Megaphone",
    tone: "brand",
  },
  {
    id: "saved",
    to: "/profile/saved",
    label: "Saved Items",
    sub: "View your bookmarked ads",
    icon: "Heart",
    tone: "soft",
  },
  {
    id: "notifications",
    to: "/profile/notifications",
    label: "Notifications",
    sub: "Alerts, messages, and updates",
    icon: "Bell",
    tone: "soft",
    dot: true,
  },
  {
    id: "settings",
    to: "/profile/settings",
    label: "Account Settings",
    sub: "Privacy, security, and preferences",
    icon: "Settings",
    tone: "grey",
  },
];

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
    a: "Most ads are reviewed within 2 hours. Ads in Personals and Services can take up to 24 hours.",
  },
  {
    q: "Can I edit an ad after publishing?",
    category: "Posting",
    a: "Yes. Open My Ads, choose the listing and tap Edit. Big changes send the ad back for review.",
  },
  {
    q: "Safety tips for buyers",
    category: "Safety",
    a: "Meet in a public place, inspect the item before paying, and never send a deposit to someone you have not met.",
  },
  {
    q: "How do I report a suspicious ad?",
    category: "Safety",
    a: "Open the ad, tap the seller card, then Report. Our team reviews reports within a few hours.",
  },
  {
    q: "Why was my payment declined?",
    category: "Payments",
    a: "Most declines come from an expired card or a bank block on online payments. Check with your bank, then retry from Account Settings.",
  },
  {
    q: "How do credits work?",
    category: "Payments",
    a: "Credits pay for promotions and featured placement. They never expire and are shown in the header.",
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
          sub: "Use a strong, unique password",
        icon: "Lock",
        type: "link",
        to: "/profile/settings/password",
      },
      {
        id: "payments",
        label: "Payment methods",
        sub: "Visa ending 4242",
        icon: "CreditCard",
        type: "link",
        to: "/profile/settings/payment",
      },
    ],
  },
  {
    title: "Notifications",
    items: [
      {
        id: "push",
        label: "Push notifications",
        sub: "Messages, offers and ad status",
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

export const sellers = {
  s1: {
    id: "s1",
    name: "Victoria Realty",
    since: 2023,
    location: "Victoria, BC",
    rating: 4.8,
    reviews: 12,
    responseTime: "Usually replies within an hour",
    badge: "New User",
    avatar: img("seller-1", 300),
    listingIds: ["l1", "l4", "l2"],
  },
  s2: {
    id: "s2",
    name: "Sofia R.",
    since: 2023,
    location: "Victoria, BC",
    rating: 4.9,
    reviews: 31,
    responseTime: "Usually replies within a few minutes",
    badge: "New User",
    avatar: img("seller-2", 300),
    listingIds: ["l13", "l14"],
  },
};

export const paymentMethods = [
  { id: "pm1", brand: "Visa", last4: "4242", expiry: "08 / 27", primary: true },
  {
    id: "pm2",
    brand: "Mastercard",
    last4: "8821",
    expiry: "02 / 26",
    primary: false,
  },
];

export const creditPacks = [
  { id: "cp1", credits: 100, price: 9, note: "Starter" },
  { id: "cp2", credits: 350, price: 25, note: "Most popular", best: true },
  { id: "cp3", credits: 800, price: 49, note: "Best value" },
];

export const billingHistory = [
  { id: "bh1", label: "350 credits", date: "12 Aug 2026", amount: 25 },
  {
    id: "bh2",
    label: "Promoted “2012 Honda Accord EX-L Sedan”",
    date: "02 Aug 2026",
    amount: 6,
  },
  { id: "bh3", label: "100 credits", date: "18 Jul 2026", amount: 9 },
];
