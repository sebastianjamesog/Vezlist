CREATE TABLE categories (
    id VARCHAR(80) PRIMARY KEY,
    label VARCHAR(120) NOT NULL,
    icon VARCHAR(80) NOT NULL,
    site_scope VARCHAR(20) NOT NULL,
    primary_category BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INTEGER NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_categories_site_scope CHECK (site_scope IN ('MARKETPLACE', 'PERSONALS'))
);

CREATE INDEX idx_categories_scope_enabled_order
    ON categories (site_scope, enabled, display_order);

CREATE TABLE locations (
    id VARCHAR(40) PRIMARY KEY,
    parent_id VARCHAR(40) REFERENCES locations (id),
    label VARCHAR(120) NOT NULL,
    location_type VARCHAR(20) NOT NULL,
    display_order INTEGER NOT NULL,
    popular BOOLEAN NOT NULL DEFAULT FALSE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_locations_type CHECK (location_type IN ('PROVINCE', 'AREA')),
    CONSTRAINT chk_locations_parent CHECK (
        (location_type = 'PROVINCE' AND parent_id IS NULL)
        OR (location_type = 'AREA' AND parent_id IS NOT NULL)
    )
);

CREATE INDEX idx_locations_parent_enabled_order
    ON locations (parent_id, enabled, display_order);

INSERT INTO categories (id, label, icon, site_scope, primary_category, display_order) VALUES
    ('vehicles', 'Vehicles', 'Car', 'MARKETPLACE', TRUE, 1),
    ('jobs', 'Jobs', 'Briefcase', 'MARKETPLACE', TRUE, 2),
    ('services', 'Services', 'Wrench', 'MARKETPLACE', TRUE, 3),
    ('electronics', 'Electronics', 'Monitor', 'MARKETPLACE', TRUE, 4),
    ('buy-sell', 'Buy/Sell', 'Tag', 'MARKETPLACE', TRUE, 5),
    ('property', 'Property', 'Building2', 'MARKETPLACE', FALSE, 6),
    ('fashion', 'Fashion & Clothing', 'Shirt', 'MARKETPLACE', FALSE, 7),
    ('home-garden', 'Home & Garden', 'House', 'MARKETPLACE', FALSE, 8),
    ('business', 'Business/Industrial', 'Factory', 'MARKETPLACE', FALSE, 9),
    ('pets', 'Pets', 'PawPrint', 'MARKETPLACE', FALSE, 10),
    ('entertainment', 'Entertainment', 'Clapperboard', 'MARKETPLACE', FALSE, 11),
    ('fitness', 'Fitness & Sports', 'Dumbbell', 'MARKETPLACE', FALSE, 12),
    ('antiques', 'Antiques', 'Landmark', 'MARKETPLACE', FALSE, 13),
    ('education', 'Education', 'GraduationCap', 'MARKETPLACE', FALSE, 14),
    ('events', 'Events', 'CalendarDays', 'MARKETPLACE', FALSE, 15),
    ('travel', 'Travel', 'Plane', 'MARKETPLACE', FALSE, 16),
    ('digital', 'Digital', 'Cpu', 'MARKETPLACE', FALSE, 17),
    ('dating', 'Dating', 'Heart', 'MARKETPLACE', FALSE, 18),
    ('tools', 'Tools', 'Hammer', 'MARKETPLACE', FALSE, 19),
    ('personals', 'Personals', 'Users', 'PERSONALS', TRUE, 1);

INSERT INTO locations (id, label, location_type, display_order) VALUES
    ('on', 'Ontario', 'PROVINCE', 1),
    ('qc', 'Quebec', 'PROVINCE', 2),
    ('bc', 'British Columbia', 'PROVINCE', 3),
    ('ab', 'Alberta', 'PROVINCE', 4),
    ('mb', 'Manitoba', 'PROVINCE', 5),
    ('sk', 'Saskatchewan', 'PROVINCE', 6),
    ('ns', 'Nova Scotia', 'PROVINCE', 7),
    ('nb', 'New Brunswick', 'PROVINCE', 8),
    ('nl', 'Newfoundland and Labrador', 'PROVINCE', 9),
    ('pe', 'Prince Edward Island', 'PROVINCE', 10),
    ('yt', 'Yukon', 'PROVINCE', 11),
    ('nt', 'Northwest Territories', 'PROVINCE', 12),
    ('nu', 'Nunavut', 'PROVINCE', 13);

INSERT INTO locations (id, parent_id, label, location_type, display_order)
SELECT 'on-' || position, 'on', label, 'AREA', position
FROM unnest(ARRAY[
    'Greater Toronto Area', 'Hamilton / Niagara', 'Southwestern Ontario',
    'Waterloo / Wellington / Perth', 'Central Ontario', 'Eastern Ontario', 'Northern Ontario'
]::TEXT[]) WITH ORDINALITY AS area(label, position);

INSERT INTO locations (id, parent_id, label, location_type, display_order)
SELECT 'qc-' || position, 'qc', label, 'AREA', position
FROM unnest(ARRAY[
    'Greater Montréal', 'Québec City / Capitale-Nationale', 'Montérégie', 'Laval',
    'Laurentides', 'Lanaudière', 'Estrie', 'Mauricie', 'Centre-du-Québec',
    'Outaouais', 'Abitibi-Témiscamingue', 'Saguenay–Lac-Saint-Jean', 'Côte-Nord',
    'Nord-du-Québec', 'Gaspésie–Îles-de-la-Madeleine'
]::TEXT[]) WITH ORDINALITY AS area(label, position);

INSERT INTO locations (id, parent_id, label, location_type, display_order)
SELECT 'bc-' || position, 'bc', label, 'AREA', position
FROM unnest(ARRAY[
    'Metro Vancouver', 'Vancouver Island', 'Fraser Valley', 'Thompson–Okanagan',
    'Kootenay', 'Cariboo', 'Northern British Columbia', 'Sunshine Coast',
    'Sea-to-Sky', 'Haida Gwaii', 'Boundary / Okanagan-Similkameen'
]::TEXT[]) WITH ORDINALITY AS area(label, position);

INSERT INTO locations (id, parent_id, label, location_type, display_order)
SELECT 'ab-' || position, 'ab', label, 'AREA', position
FROM unnest(ARRAY[
    'Calgary', 'Edmonton', 'Red Deer', 'Lethbridge', 'St. Albert', 'Airdrie',
    'Grande Prairie', 'Medicine Hat', 'Spruce Grove', 'Fort McMurray',
    'Lloydminster', 'Chestermere', 'Beaumont', 'Cochrane', 'Okotoks'
]::TEXT[]) WITH ORDINALITY AS area(label, position);

INSERT INTO locations (id, parent_id, label, location_type, display_order)
SELECT 'mb-' || position, 'mb', label, 'AREA', position
FROM unnest(ARRAY[
    'Winnipeg', 'Brandon', 'Steinbach', 'Portage la Prairie', 'Winkler', 'Thompson',
    'Selkirk', 'Dauphin', 'Morden', 'The Pas', 'Flin Flon', 'Swan River', 'Neepawa', 'Stonewall'
]::TEXT[]) WITH ORDINALITY AS area(label, position);

INSERT INTO locations (id, parent_id, label, location_type, display_order)
SELECT 'sk-' || position, 'sk', label, 'AREA', position
FROM unnest(ARRAY[
    'Saskatoon', 'Regina', 'Prince Albert', 'Moose Jaw', 'Swift Current', 'Yorkton',
    'North Battleford', 'Estevan', 'Weyburn', 'Lloydminster', 'Warman', 'Martensville',
    'Meadow Lake', 'Melfort', 'Humboldt'
]::TEXT[]) WITH ORDINALITY AS area(label, position);

INSERT INTO locations (id, parent_id, label, location_type, display_order)
SELECT 'ns-' || position, 'ns', label, 'AREA', position
FROM unnest(ARRAY[
    'Halifax', 'Sydney', 'Dartmouth', 'Truro', 'New Glasgow', 'Glace Bay', 'Amherst',
    'Bridgewater', 'Kentville', 'Yarmouth', 'Antigonish', 'Wolfville', 'Windsor', 'Shelburne', 'Digby'
]::TEXT[]) WITH ORDINALITY AS area(label, position);

INSERT INTO locations (id, parent_id, label, location_type, display_order)
SELECT 'nb-' || position, 'nb', label, 'AREA', position
FROM unnest(ARRAY[
    'Moncton', 'Saint John', 'Fredericton', 'Dieppe', 'Miramichi', 'Edmundston',
    'Bathurst', 'Campbellton', 'Oromocto', 'Quispamsis', 'Riverview', 'Sussex',
    'Grand Falls', 'St. Andrews', 'Woodstock'
]::TEXT[]) WITH ORDINALITY AS area(label, position);

INSERT INTO locations (id, parent_id, label, location_type, display_order)
SELECT 'nl-' || position, 'nl', label, 'AREA', position
FROM unnest(ARRAY[
    'St. John''s', 'Mount Pearl', 'Corner Brook', 'Conception Bay South', 'Paradise',
    'Gander', 'Grand Falls-Windsor', 'Happy Valley-Goose Bay', 'Labrador City',
    'Bay Roberts', 'Carbonear', 'Torbay', 'Portugal Cove–St. Philip''s', 'Clarenville',
    'Marystown', 'Stephenville', 'Deer Lake', 'Bay St. George Area'
]::TEXT[]) WITH ORDINALITY AS area(label, position);

INSERT INTO locations (id, parent_id, label, location_type, display_order)
SELECT 'pe-' || position, 'pe', label, 'AREA', position
FROM unnest(ARRAY[
    'Charlottetown', 'Summerside', 'Stratford', 'Cornwall', 'Kensington', 'Souris',
    'Montague', 'Georgetown', 'Alberton', 'Tignish', 'O''Leary', 'Wellington',
    'Borden-Carleton', 'North Rustico'
]::TEXT[]) WITH ORDINALITY AS area(label, position);

INSERT INTO locations (id, parent_id, label, location_type, display_order)
SELECT 'yt-' || position, 'yt', label, 'AREA', position
FROM unnest(ARRAY[
    'Whitehorse', 'Dawson City', 'Watson Lake', 'Faro', 'Haines Junction', 'Carmacks',
    'Mayo', 'Teslin', 'Carcross', 'Pelly Crossing', 'Old Crow', 'Beaver Creek',
    'Burwash Landing', 'Destruction Bay', 'Ross River'
]::TEXT[]) WITH ORDINALITY AS area(label, position);

INSERT INTO locations (id, parent_id, label, location_type, display_order)
SELECT 'nt-' || position, 'nt', label, 'AREA', position
FROM unnest(ARRAY[
    'Yellowknife', 'Hay River', 'Inuvik', 'Fort Smith', 'Fort Simpson', 'Norman Wells',
    'Behchoko', 'Fort Providence', 'Fort McPherson', 'Tuktoyaktuk', 'Aklavik',
    'Ulukhaktok', 'Paulatuk', 'Sachs Harbour', 'Colville Lake', 'Fort Good Hope',
    'Tulita', 'Deline', 'Gameti', 'Wekweeti', 'Whatì', 'Lutsel K''e', 'Fort Resolution',
    'Fort Liard', 'Nahanni Butte', 'Wrigley', 'Jean Marie River', 'Sambaa K''e', 'Enterprise'
]::TEXT[]) WITH ORDINALITY AS area(label, position);

INSERT INTO locations (id, parent_id, label, location_type, display_order)
SELECT 'nu-' || position, 'nu', label, 'AREA', position
FROM unnest(ARRAY[
    'Iqaluit', 'Rankin Inlet', 'Arviat', 'Cambridge Bay', 'Baker Lake', 'Igloolik',
    'Pond Inlet', 'Pangnirtung', 'Cape Dorset', 'Gjoa Haven', 'Taloyoak', 'Kugluktuk',
    'Kugaaruk', 'Coral Harbour', 'Chesterfield Inlet', 'Kimmirut', 'Qikiqtarjuaq',
    'Clyde River', 'Arctic Bay', 'Grise Fiord', 'Resolute', 'Sanikiluaq', 'Whale Cove',
    'Naujaat', 'Hall Beach', 'Kinngait'
]::TEXT[]) WITH ORDINALITY AS area(label, position);

UPDATE locations
SET popular = TRUE
WHERE location_type = 'AREA'
  AND label IN (
      'Greater Toronto Area', 'Greater Montréal', 'Metro Vancouver', 'Vancouver Island',
      'Calgary', 'Edmonton', 'Winnipeg', 'Halifax'
  );
