/**
 * Canadian coverage. Ontario, Quebec and BC are sold by region the way the big
 * boards do it; the smaller provinces and the territories are sold by city.
 * "All Canada" is the no-filter default and carries no areas of its own.
 */
export const provinces = [
  { id: "all", label: "All Canada", areas: [] },
  {
    id: "on",
    label: "Ontario",
    areas: [
      "Greater Toronto Area",
      "Hamilton / Niagara",
      "Southwestern Ontario",
      "Waterloo / Wellington / Perth",
      "Central Ontario",
      "Eastern Ontario",
      "Northern Ontario",
    ],
  },
  {
    id: "qc",
    label: "Quebec",
    areas: [
      "Greater Montréal",
      "Québec City / Capitale-Nationale",
      "Montérégie",
      "Laval",
      "Laurentides",
      "Lanaudière",
      "Estrie",
      "Mauricie",
      "Centre-du-Québec",
      "Outaouais",
      "Abitibi-Témiscamingue",
      "Saguenay–Lac-Saint-Jean",
      "Côte-Nord",
      "Nord-du-Québec",
      "Gaspésie–Îles-de-la-Madeleine",
    ],
  },
  {
    id: "bc",
    label: "British Columbia",
    areas: [
      "Metro Vancouver",
      "Vancouver Island",
      "Fraser Valley",
      "Thompson–Okanagan",
      "Kootenay",
      "Cariboo",
      "Northern British Columbia",
      "Sunshine Coast",
      "Sea-to-Sky",
      "Haida Gwaii",
      "Boundary / Okanagan-Similkameen",
    ],
  },
  {
    id: "ab",
    label: "Alberta",
    areas: [
      "Calgary",
      "Edmonton",
      "Red Deer",
      "Lethbridge",
      "St. Albert",
      "Airdrie",
      "Grande Prairie",
      "Medicine Hat",
      "Spruce Grove",
      "Fort McMurray",
      "Lloydminster",
      "Chestermere",
      "Beaumont",
      "Cochrane",
      "Okotoks",
    ],
  },
  {
    id: "mb",
    label: "Manitoba",
    areas: [
      "Winnipeg",
      "Brandon",
      "Steinbach",
      "Portage la Prairie",
      "Winkler",
      "Thompson",
      "Selkirk",
      "Dauphin",
      "Morden",
      "The Pas",
      "Flin Flon",
      "Swan River",
      "Neepawa",
      "Stonewall",
    ],
  },
  {
    id: "sk",
    label: "Saskatchewan",
    areas: [
      "Saskatoon",
      "Regina",
      "Prince Albert",
      "Moose Jaw",
      "Swift Current",
      "Yorkton",
      "North Battleford",
      "Estevan",
      "Weyburn",
      "Lloydminster",
      "Warman",
      "Martensville",
      "Meadow Lake",
      "Melfort",
      "Humboldt",
    ],
  },
  {
    id: "ns",
    label: "Nova Scotia",
    areas: [
      "Halifax",
      "Sydney",
      "Dartmouth",
      "Truro",
      "New Glasgow",
      "Glace Bay",
      "Amherst",
      "Bridgewater",
      "Kentville",
      "Yarmouth",
      "Antigonish",
      "Wolfville",
      "Windsor",
      "Shelburne",
      "Digby",
    ],
  },
  {
    id: "nb",
    label: "New Brunswick",
    areas: [
      "Moncton",
      "Saint John",
      "Fredericton",
      "Dieppe",
      "Miramichi",
      "Edmundston",
      "Bathurst",
      "Campbellton",
      "Oromocto",
      "Quispamsis",
      "Riverview",
      "Sussex",
      "Grand Falls",
      "St. Andrews",
      "Woodstock",
    ],
  },
  {
    id: "nl",
    label: "Newfoundland and Labrador",
    areas: [
      "St. John's",
      "Mount Pearl",
      "Corner Brook",
      "Conception Bay South",
      "Paradise",
      "Gander",
      "Grand Falls-Windsor",
      "Happy Valley-Goose Bay",
      "Labrador City",
      "Bay Roberts",
      "Carbonear",
      "Torbay",
      "Portugal Cove–St. Philip's",
      "Clarenville",
      "Marystown",
      "Stephenville",
      "Deer Lake",
      "Bay St. George Area",
    ],
  },
  {
    id: "pe",
    label: "Prince Edward Island",
    areas: [
      "Charlottetown",
      "Summerside",
      "Stratford",
      "Cornwall",
      "Kensington",
      "Souris",
      "Montague",
      "Georgetown",
      "Alberton",
      "Tignish",
      "O'Leary",
      "Wellington",
      "Borden-Carleton",
      "North Rustico",
    ],
  },
  {
    id: "yt",
    label: "Yukon",
    areas: [
      "Whitehorse",
      "Dawson City",
      "Watson Lake",
      "Faro",
      "Haines Junction",
      "Carmacks",
      "Mayo",
      "Teslin",
      "Carcross",
      "Pelly Crossing",
      "Old Crow",
      "Beaver Creek",
      "Burwash Landing",
      "Destruction Bay",
      "Ross River",
    ],
  },
  {
    id: "nt",
    label: "Northwest Territories",
    areas: [
      "Yellowknife",
      "Hay River",
      "Inuvik",
      "Fort Smith",
      "Fort Simpson",
      "Norman Wells",
      "Behchoko",
      "Fort Providence",
      "Fort McPherson",
      "Tuktoyaktuk",
      "Aklavik",
      "Ulukhaktok",
      "Paulatuk",
      "Sachs Harbour",
      "Colville Lake",
      "Fort Good Hope",
      "Tulita",
      "Deline",
      "Gameti",
      "Wekweeti",
      "Whatì",
      "Lutsel K'e",
      "Fort Resolution",
      "Fort Liard",
      "Nahanni Butte",
      "Wrigley",
      "Jean Marie River",
      "Sambaa K'e",
      "Enterprise",
    ],
  },
  {
    id: "nu",
    label: "Nunavut",
    areas: [
      "Iqaluit",
      "Rankin Inlet",
      "Arviat",
      "Cambridge Bay",
      "Baker Lake",
      "Igloolik",
      "Pond Inlet",
      "Pangnirtung",
      "Cape Dorset",
      "Gjoa Haven",
      "Taloyoak",
      "Kugluktuk",
      "Kugaaruk",
      "Coral Harbour",
      "Chesterfield Inlet",
      "Kimmirut",
      "Qikiqtarjuaq",
      "Clyde River",
      "Arctic Bay",
      "Grise Fiord",
      "Resolute",
      "Sanikiluaq",
      "Whale Cove",
      "Naujaat",
      "Hall Beach",
      "Kinngait",
    ],
  },
];

export const ALL_CANADA = "all";

/** The province object for an id, falling back to All Canada. */
export function provinceById(id) {
  return provinces.find((p) => p.id === id) ?? provinces[0];
}

/** Areas to offer for a province id; All Canada has none of its own. */
export function areasFor(id) {
  return provinceById(id).areas;
}

/* ---------------------------------------------------------------------------
   Where the visitor is, guessed from the browser.

   The requirement was "open on their country". There are exactly two signals a
   page can read without asking permission, without a network call and without a
   backend, and neither of them is authoritative:

     - `Intl.DateTimeFormat().resolvedOptions().timeZone`, an IANA zone name.
       The better of the two by a wide margin — it is set from the OS clock, it
       is what the browser actually believes about where the machine is, and it
       names a *place*.
     - `navigator.language`'s region subtag. Frequently wrong: a great many
       English speakers run en-US because that is what the installer defaulted
       to, and plenty of people run an OS in a language that has nothing to do
       with where they live. It is the fallback, never the first answer.

   Geolocation is the third option and it is deliberately unused: it costs a
   permission prompt on first paint, which is the worst possible greeting, and
   it answers a question ten times more precise than the one being asked.

   HOW FAR THIS GOES, AND WHY IT STOPS THERE
   -----------------------------------------
   The obvious next step is a country layer above `provinces` — Canada, plus the
   US, plus the UK, each with its own regions. That is not shipped, on purpose.
   Every listing in this build sits in a Canadian area: `filters.province`
   matches against `listing.province`, and mock.js builds that field out of the
   very table at the top of this file. A United States entry with fifty states
   behind it would be fifty doors onto an empty feed, and a visitor detected
   into one of them would open the app on a board that looks broken rather than
   on a board that is honest about its coverage. That is the outcome worth
   avoiding.

   So the model stays Canadian, and detection answers at the resolution the data
   can actually serve:

     - Canada        -> the visitor's province, read off their timezone. This is
                        the case that carries real value, and it is very nearly
                        all of them.
     - anywhere else -> All Canada, unnarrowed, with the location picker saying
                        plainly that areas cover Canada today.

   When the catalogue crosses a border, `countries` becomes a real table here,
   `provinces` hangs off it, and `detectLocation` starts returning a country id
   alongside the province one. Nothing outside this file has to learn a new
   shape to get there, which is the whole point of keeping the seam here.
--------------------------------------------------------------------------- */

/** The cookie the applied location lives in. Both origins read it — see cookieStore. */
export const LOCATION_KEY = "vezlist_location";

/** ISO 3166-1 alpha-2 for the one country the board actually covers. */
export const CANADA = "CA";

/**
 * Canadian IANA zones to province ids. Every zone Canada publishes is here,
 * including the ones tzdata now aliases away (America/Montreal, Nipigon,
 * Yellowknife) — browsers still report them, and an alias that resolved to
 * nothing would drop a Montrealer into All Canada for no reason at all.
 *
 * Prince Edward Island has no zone of its own; it shares America/Halifax, so a
 * visitor there is detected as Nova Scotia. That is the one systematic error in
 * this table, and it is a wrong province rather than a wrong country — two taps
 * in the picker away from right.
 */
const CA_ZONE_PROVINCE = {
  "America/St_Johns": "nl",
  "America/Goose_Bay": "nl",
  "America/Halifax": "ns",
  "America/Glace_Bay": "ns",
  "America/Moncton": "nb",
  "America/Montreal": "qc",
  "America/Blanc-Sablon": "qc",
  "America/Toronto": "on",
  "America/Nipigon": "on",
  "America/Thunder_Bay": "on",
  "America/Atikokan": "on",
  "America/Rainy_River": "on",
  "America/Winnipeg": "mb",
  "America/Regina": "sk",
  "America/Swift_Current": "sk",
  "America/Edmonton": "ab",
  "America/Vancouver": "bc",
  "America/Dawson_Creek": "bc",
  "America/Fort_Nelson": "bc",
  "America/Creston": "bc",
  "America/Whitehorse": "yt",
  "America/Dawson": "yt",
  "America/Yellowknife": "nt",
  "America/Inuvik": "nt",
  "America/Iqaluit": "nu",
  "America/Rankin_Inlet": "nu",
  "America/Cambridge_Bay": "nu",
  "America/Resolute": "nu",
  "America/Coral_Harbour": "nu",
  "America/Pangnirtung": "nu",
};

/**
 * Zone to country, for the rest of the world. Not exhaustive and not trying to
 * be: it covers the places a visitor to a Canadian classifieds board plausibly
 * arrives from, and everything it misses falls through to the language tag and
 * then to "we do not know" — both of which land on All Canada anyway. The table
 * is only ever asked one question, "is this Canada?", so its long tail costs
 * nothing to be incomplete about.
 */
const ZONE_COUNTRY = {
  "America/New_York": "US",
  "America/Detroit": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Phoenix": "US",
  "America/Boise": "US",
  "America/Los_Angeles": "US",
  "America/Anchorage": "US",
  "America/Juneau": "US",
  "America/Sitka": "US",
  "America/Menominee": "US",
  "America/Indiana/Indianapolis": "US",
  "America/Kentucky/Louisville": "US",
  "America/North_Dakota/Center": "US",
  "Pacific/Honolulu": "US",
  "America/Mexico_City": "MX",
  "America/Monterrey": "MX",
  "America/Tijuana": "MX",
  "America/Cancun": "MX",
  "America/Sao_Paulo": "BR",
  "America/Argentina/Buenos_Aires": "AR",
  "America/Bogota": "CO",
  "America/Santiago": "CL",
  "America/Lima": "PE",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Europe/Paris": "FR",
  "Europe/Madrid": "ES",
  "Europe/Lisbon": "PT",
  "Europe/Berlin": "DE",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE",
  "Europe/Zurich": "CH",
  "Europe/Vienna": "AT",
  "Europe/Stockholm": "SE",
  "Europe/Oslo": "NO",
  "Europe/Copenhagen": "DK",
  "Europe/Helsinki": "FI",
  "Europe/Warsaw": "PL",
  "Europe/Prague": "CZ",
  "Europe/Budapest": "HU",
  "Europe/Bucharest": "RO",
  "Europe/Athens": "GR",
  "Europe/Istanbul": "TR",
  "Europe/Moscow": "RU",
  "Europe/Kyiv": "UA",
  "Europe/Kiev": "UA",
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Karachi": "PK",
  "Asia/Dhaka": "BD",
  "Asia/Colombo": "LK",
  "Asia/Manila": "PH",
  "Asia/Jakarta": "ID",
  "Asia/Bangkok": "TH",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Shanghai": "CN",
  "Asia/Chongqing": "CN",
  "Asia/Urumqi": "CN",
  "Asia/Hong_Kong": "HK",
  "Asia/Taipei": "TW",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Singapore": "SG",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Dubai": "AE",
  "Asia/Riyadh": "SA",
  "Asia/Jerusalem": "IL",
  "Africa/Cairo": "EG",
  "Africa/Lagos": "NG",
  "Africa/Nairobi": "KE",
  "Africa/Johannesburg": "ZA",
  "Africa/Accra": "GH",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU",
  "Australia/Perth": "AU",
  "Australia/Adelaide": "AU",
  "Pacific/Auckland": "NZ",
};

/** The country an IANA zone sits in, or null when the table has not heard of it. */
export function countryFromTimeZone(zone) {
  if (typeof zone !== "string") return null;
  if (CA_ZONE_PROVINCE[zone]) return CANADA;
  return ZONE_COUNTRY[zone] ?? null;
}

/**
 * The region subtag of a BCP 47 tag: "en-CA" gives "CA". A tag with no region
 * ("fr") or with a script where the region would be ("zh-Hans") gives null
 * rather than a guess — "fr" is a language, not France.
 */
export function countryFromLanguage(tag) {
  if (typeof tag !== "string") return null;
  const region = tag.split("-").find((part) => /^[A-Z]{2}$/.test(part));
  return region ?? null;
}

/**
 * Best effort: where is this browser, and what should the board open on.
 *
 * Client-only. It reads `Intl` and `navigator`, so it must be called from an
 * effect and never during render — the server has no timezone to agree with,
 * and a first paint that disagrees with the server costs the whole React tree.
 *
 * Every read is wrapped, because a hardened or headless browser can throw on
 * any of them and a failed guess is a normal outcome here rather than an error:
 * it means All Canada, which is exactly where the app used to start.
 */
export function detectLocation() {
  let zone = null;
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    // No Intl, or no zone inside it. The language tag still gets its turn.
  }

  let country = countryFromTimeZone(zone);
  if (!country) {
    try {
      country = countryFromLanguage(navigator.language);
    } catch {
      country = null;
    }
  }

  // Only Canada has areas behind it today, so only Canada narrows.
  const province =
    country === CANADA ? (CA_ZONE_PROVINCE[zone] ?? ALL_CANADA) : ALL_CANADA;

  return { country, province, zone };
}
