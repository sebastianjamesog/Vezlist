# Vezlist

Mobile screens from `Base Pages - Main Web.pdf`, built with Next.js 16 (App
Router) + React 19 + Tailwind v4, deployed to Cloudflare Workers via OpenNext.

```bash
npm install
npm run dev              # marketplace  http://localhost:3000
npm run dev:personals    # personals    http://localhost:3001
npm run build            # next build -> apps/marketplace/.next
npm run build:all        # both workspaces
npm start                # next start, production server
npm run preview          # build for Cloudflare and run it in workerd
npm run deploy:all       # both workers
npm test                 # node:test, no test framework dependency
```

Cloudflare account setup — R2 buckets, custom domains, CI — is in
[DEPLOY.md](DEPLOY.md).

## Two sites, one repo

`vezlist.cc` is the marketplace; `personals.vezlist.cc` is the adult board. Two
Next apps, two builds, two Cloudflare workers — one npm workspace each, both
eating the same `packages/shared`.

```
apps/marketplace/   app/ route tree, next + wrangler + open-next config
apps/personals/     app/ route tree, next + wrangler + open-next config
packages/shared/    everything else — components, screens, data, lib, index.css
```

|             | marketplace                       | personals                                 |
| ----------- | --------------------------------- | ----------------------------------------- |
| workspace   | `@vezlist/marketplace`            | `@vezlist/personals`                      |
| home screen | `app/(shell)/page.jsx`            | `app/(shell)/page.jsx`                    |
| feed        | `listings` (personals excluded)   | `personalsListings`                       |
| second tab  | Nearby                            | Nearby                                    |
| door        | none                              | 18+ age gate, then discreet mode          |
| palette     | `:root`                           | `[data-theme="personals"]` on `<html>`    |
| indexing    | crawlable                         | `noindex, nofollow` + adult `rating` meta |
| dev port    | 3000                              | 3001                                      |
| worker      | `apps/marketplace/wrangler.jsonc` | `apps/personals/wrangler.jsonc`           |

`packages/shared` is a source-only package — no build step, no `dist`. Next
compiles it directly via `transpilePackages`. Node's `exports` map does no
extension guessing, so shared imports name the file:
`@vezlist/shared/pages/Support.jsx`, not `.../Support`.

Everything site-specific reads `lib/sites.js` (`IS_PERSONALS`, `SITE_NAME`, and
the two origins, overridable with `NEXT_PUBLIC_MARKETPLACE_URL` /
`NEXT_PUBLIC_PERSONALS_URL`); each app's `next.config.mjs` sets
`NEXT_PUBLIC_SITE`. The screens both serve — account, support, ad detail,
status — are one-line `page.jsx` files re-exporting the shared component, so the
route tree is the routing and nothing else.

Crossing between them is a real navigation: the marketplace's Personals tile and
the personals bar's **Vezlist** button are `<a href>`, not router links.

**Gotcha worth keeping:** each app is its own Next root, so Tailwind v4's
automatic source detection never reaches `packages/shared`. `index.css` names
both sides with explicit `@source` directives — without them the CSS still
builds, just at a fraction of the size, and a site renders unstyled while the
build reports success.

**Known consequence:** watched-status (`vezlist:status-seen`) remains browser
storage and does **not** carry across the two sites. Saved items are account-backed
and follow the signed-in user across devices; each site's saved screen requests
only listings in that site's scope. The create sheet is also still the
marketplace's, so posting from the personals site offers marketplace categories.

## Rendering and caching

Every route prerenders to HTML at build time. The mock data is static, so there
is nothing to fetch at request time and nothing renders dynamically:

- **Static** — the fixed routes (`/`, `/nearby`, `/support`, all of `/profile`).
- **SSG** — the parameterised ones. `generateStaticParams` enumerates every ad,
  seller, ticket and story, so `/ad/a1` ships as finished HTML rather than a
  spinner that fetches.

`generateMetadata` runs on the server, which is where the SEO actually lands: an
ad page carries its own `<title>`, description and `og:image` from the listing —
a crawler and a link unfurl both see the real ad, which a client-rendered SPA
could never give them. The personals app declares `noindex, nofollow` and the
`RTA` adult rating in its root layout, so the whole origin is marked at once.

The screens themselves are client components — the app is a filter/sheet/player
UI, and almost every leaf is interactive. That does not cost the SSR: Next
renders client components to HTML on the server too. What stays server-only is
the routing shell and the metadata.

On Cloudflare, OpenNext puts the prerendered payloads in R2 rather than in the
worker bundle, bound as `NEXT_INC_CACHE_R2_BUCKET`. A hit comes back with
`x-nextjs-cache: HIT` and `Cache-Control: s-maxage=31536000`. Create the bucket
once per site before the first deploy:

```bash
npx wrangler r2 bucket create vezlist-next-cache
npx wrangler r2 bucket create vezlist-personals-next-cache
```

When real data replaces the mock, that binding is what turns `revalidate` into a
bucket write instead of a redeploy.

## The route tree

```
app/
  layout.jsx              <html>, next/font, metadata, Providers
  providers.jsx           Saved / Status / Feed — mounted above every route
  not-found.jsx           unknown paths redirect to /
  icon.svg                the favicon, by Next's file convention
  (shell)/                everything wrapped in the phone shell + tab bar
    layout.jsx            <AppLayout>
    page.jsx              the home screen — the one screen each app owns
    browse/               marketplace only: page.jsx + BrowseScreen.jsx
    nearby/               page.jsx + NearbyScreen.jsx, on both sites
    ad/[id]/, seller/[id]/, support/…, profile/…, status/
  (full)/                 no rail, no tab bar
    login/
    status/[id]/          the story player, full-bleed
```

Route groups are the reason `/status` (in the shell) and `/status/[id]` (full
bleed) can sit at the same URL prefix under different layouts — the parentheses
never reach the URL.

`browse` and `nearby` are the routes split in two files: each screen reads a
query parameter on the client (`?cat=`, `?view=`), and a prerendered page needs a
`<Suspense>` boundary to stream that into, which a component cannot wrap around
itself.

## The react-router shim

The screens were written against react-router. Rather than rewrite thirty-odd
call sites, `lib/nav.jsx` re-implements the four APIs they use over
`next/navigation`:

| was                      | now                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `useNavigate()`          | `router.push` / `.replace` / `.back()`, same `(to, {replace})` and `navigate(-1)` calls |
| `useSearchParams()`      | Next's read-only hook plus a setter that writes the query back with `replace`           |
| `useLocation().pathname` | `usePathname()`                                                                         |
| `<NavLink>`              | `next/link` + `usePathname`, keeping the `{ isActive }` render props                    |
| `<Link to=…>`            | `next/link` with `href`                                                                 |

One API had no equivalent: react-router's `location.key === "default"`, which
the status player used to tell a deep link from an in-app navigation. Next has
no per-entry history key, so it asks the stack depth (`window.history.length`)
instead.

## Design language

The UI is one system, defined entirely in `packages/shared/src/index.css`:

- **Colour** — a warm neutral canvas (`#f4f4f6`) with white cards; near-black
  ink; one vivid brand ramp (`--brand` → `--brand-2`) that carries every
  gradient. Verified ads are the only other colour signal (emerald), kept scarce
  in the data on purpose — a badge on every card is a badge on none.
- **Verified glow** — `.verified-glow` (in `index.css`) runs a light around the
  card edge continuously. The frame is a conic gradient masked to 2px (paint the
  padding box, punch out the content box) so it is one element and one angle to
  animate; `@property --glow-angle` is what makes that angle interpolatable.
  A second, slower keyframe breathes the outer emerald shadow. Where `@property`
  is unsupported the gradient sits still and still reads as a ring, and under
  `prefers-reduced-motion` both animations are switched off for a static frame —
  an infinite animation squashed to `0.01ms` flickers instead of stopping.
- **Type** — Inter, with `letter-spacing: -0.02em` on headings. Prices, counts
  and card digits are `tabular-nums` so they don't jitter between rows.
- **Shape** — `--radius-card` (20px) for cards, `--radius-sheet` (28px) for
  sheets. Corners carry most of the character, so they're a token, not a guess.
- **Elevation** — ambient, not drop shadows: a 1px contact shadow plus a wide,
  faint spread. `--shadow-pop` is brand-tinted and reserved for primary actions.
- **Surfaces** — borders are for inputs and dividers only; everything else
  separates by elevation. Sticky headers use a `glass` utility (blur +
  saturation) so content dissolves under them rather than clipping.

Both brands share all of it; only the eight brand vars swap.

## Screens

| Route                        | Screen                                                            |
| ---------------------------- | ----------------------------------------------------------------- |
| `/` (marketplace)            | Home — wordmark, location card, nine category tiles               |
| `/browse`                    | The feed — search, location, category strip, filters, listings    |
| `/browse?cat=vehicles`       | The same feed, opened already narrowed to one category            |
| `/` (personals)              | The board — story rail, 18+ label, photo grid                     |
| `/nearby`                    | Map + a "near you" sheet, on both sites                           |
| `/nearby?view=people`        | Same screen with the people feed                                  |
| `/status`                    | Status updates list — mine, recent, viewed                        |
| `/status/:id`                | Story player — full-bleed, outside the shell                      |
| `/support`                   | Help search, contact channels, tickets, FAQ accordion             |
| `/profile`                   | Profile card, stats, menu, log out                                |
| `/ad/a1`, `/ad/a2`           | Ad detail — vehicle / person                                      |
| `/seller/:id`                | Seller profile + their live ads                                   |
| `/profile/ads`               | My Ads — Active / In review / Expired, with edit, promote, delete |
| `/profile/saved`             | Cursor-paginated Saved Items from the signed-in account           |
| `/profile/notifications`     | Grouped notifications, unread state, mark all read                |
| `/profile/settings`          | Account rows and privacy/notification toggles                     |
| `/profile/settings/details`  | Personal details form — name, email, phone, location, bio         |
| `/profile/settings/password` | Password change with live strength rules                          |
| `/profile/settings/payment`  | Saved cards, credit packs, billing history                        |
| `/login`                     | Sign in / create account — standalone, outside the shell          |
| `/support/tickets`           | All tickets, filtered by status                                   |
| `/support/tickets/:id`       | Ticket thread with a working reply box                            |
| `/support/faqs`              | Help centre — search + category chips                             |

"Post Your Ad" is a sheet over the current route, opened by the `+` button in the bottom nav.

## Responsive behaviour

One set of screens, two layouts, switching at Tailwind's `lg` (1024px):

|           | Below `lg`                            | `lg` and up                                      |
| --------- | ------------------------------------- | ------------------------------------------------ |
| Chrome    | Phone shell + tab bar, 430px, centred | Rail nav, full width, `max-w-7xl` content column |
| Feeds     | Two-up card grid                      | 3 columns, 4 from `xl`                           |
| Nearby    | Map with a sheet pulled over it       | Map and list side by side                        |
| Ad detail | Stacked                               | Gallery left, sticky summary rail right          |
| Create    | Full-height sheet                     | Centred dialog                                   |
| Profile   | Stacked                               | Sticky gradient hero + menu grid                 |
| Login     | Gradient cap over a sheet             | Brand panel left, form card right                |

The phone shell keeps its 430px width at tablet sizes, so column counts key off
`lg`/`xl` rather than `sm`/`md` — a viewport-based `sm:` grid would split a
430px-wide screen in half.

## Chrome

The app bar is a glass row: the wordmark (name only — the gradient mark is the
rail's job) and two actions, notifications and credits, on mobile; on desktop
the wordmark moves into the rail and the bar carries the page title instead. Sub-pages swap it for `SubPageBar` (back + title + action).

Navigation follows Instagram's shape. `navItems.js` is the single source both
bars read, and **Create** sits in the middle of it as an action rather than a
route:

- **Mobile** — a full-width bar with a circle bulging at each of the five slots,
  the two _fused_ into one wavy black blob. The merge is an SVG gooey filter
  (`#nav-goo`): blur the shapes, then push alpha back to hard edges with a colour
  matrix. Icons sit on a second, unfiltered layer above it, or the blur would
  smear them too. The bar spans the screen on purpose — five plain circles wide
  enough to fill 430px end up ~86px tall, which eats the screen; the connecting
  bar buys the width back at 62px circles (kept thin at 34px — a taller bar leaves too shallow a bump and the end caps read as pills, not circles). The bar stops at the first and last
  slot centre (`inset-x-[10%]`, half a slot), so the chain terminates in full
  round caps instead of a thin stub poking past the end circles. The active tab is a white disc nested
  _inside_ its slot, leaving a black rim — lifting it out with a canvas ring cut
  the end circles loose from the chain, and an unbroken chain is the whole point
  of the goo. Create is brand
  filled, lifts while its sheet is open, and swaps its glyph for an ✕ — tapping
  it again dismisses the sheet.
- **Desktop** — a rail that is icon-only from `lg` and gains labels at `xl`,
  the same collapse Instagram's web sidebar does. Credits and log out sit at
  the bottom.

Dropping the labels is faithful to the reference but costs some discoverability,
so every target carries an `aria-label` and a `title`.

## The home screen

The marketplace opens on a launcher, not a feed: the wordmark, a card naming
the province you are browsing, and nine category tiles. It asks two questions —
where you are and what you want — and nothing else. The feed, with its search
box, filter sheet and category strip, lives one tap away at `/browse`.

A tile is a real link to `/browse?cat=<id>`, so the feed arrives already
narrowed and the URL is shareable. `?cat=` is an entry parameter rather than a
mirror of the filter state: changing category in the strip on `/browse` leaves
the URL behind instead of rewriting it, because a two-way sync buys nothing
here and fights itself.

Nine tiles is not the nineteen categories in the data, so "Browse all ads" sits
below the grid — the way to the rest of them, and to the feed with nothing
narrowed at all.

Personals is the one tile that is not a filter. It is a doorway to the other
site, so it is an `<a href>` to a different origin and it wears that site's
rose rather than Vezlist blue — a different colour for a different place.

## The listing card

Both feeds use one card (`components/cards/ListingCard.jsx`): a row — square
thumbnail, then title, seller, and a meta line of price, category and place.
One column on a phone, two at `lg`, three at `xl`.

The price sits in a `brand-soft` pill and the location in a `canvas` chip that
truncates, so a long area name shortens instead of pushing the row wider.
Personals posts are not priced, so the pill simply is not there and the meta
line closes up.

Verified ads keep the travelling emerald ring and a badge — emerald rather than
the brand colour, so the signal reads the same in Vezlist blue and personals
rose, and kept scarce in the data on purpose, because a badge on every card is
a badge on none.

The thumbnail carries `data-media`, which is what personals' discreet mode
blurs; the title and price stay sharp, so a blurred feed is still a readable
feed.

## Navigation

Every control goes somewhere. Profile rows, ticket rows, "View All", "View All
FAQs", the seller card on an ad, story avatars and the notification bell are
all real links; unknown paths redirect to `/`.

The contact tiles on Support hand off to the device rather than faking a screen
— `tel:`, `mailto:` and `wa.me` — and "Contact Me Now" opens a `mailto:` prefilled
with the ad title. Live Chat is the one in-app tile, going to the ticket list.

Screens you reach from another screen use `SubPageBar` (back + title + optional
action); it falls back to a sensible parent route when there's no history to pop.

## State that outlives a screen

- `FeedContext` — the feed's filters and search query. It lives in the root
  layout, which Next keeps mounted across every navigation, so the filters
  survive a trip into the full-screen status player and back.
- `AuthContext` — the signed-in session, persisted. `RequireAuth` and the
  account screens read it; see **Account and auth**.
- `SavedContext` — the authenticated saved-listing query cache. It preloads the
  current site's first page and exact count, hydrates detail-page heart state on
  demand, and applies optimistic save/remove updates with rollback.
- `ToastContext` — one-line confirmations for actions that would otherwise be
  silent (saved, deleted, reply sent, ad submitted).

Destructive actions (delete an ad, log out, delete account) go through
`ConfirmDialog` first. Empty lists render `EmptyState` with a way forward rather
than blank space.

Every persisted store goes through `lib/persisted.js`, and the reason is server
rendering: the server has no `localStorage`, so a provider that seeds its state
from storage renders one thing on the server and another on the client, and
React throws out the whole tree as a hydration mismatch. The hook starts from
the same fallback the server used, reads storage one tick after mount, and
refuses to write anything back until it has — otherwise mounting would clobber
the store with the fallback it started from. `usePersistedIds`,
`usePersistedFlag` and `usePersistedObject` are three thin wrappers over that
one rule.

It has a knock-on the status player has to respect: a queue frozen on mount
would be built from an empty seen-list, so it waits for the store's `ready`
flag before freezing.

## Creating an ad

Publishing is a four-step flow (`packages/shared/src/components/create/`) rather than one long
form: **photos → details → contact → review**. Each step does one job. The
header carries a story-style stepper — one segment per step, labelled, filled
behind you and ticked once cleared, and a cleared segment is tappable to jump
back. Only one primary action exists (the footer button); back on step 1 closes
the sheet.

The draft outlives the sheet. Closing it — by ✕, by back on step 1, or by
tapping another tab, which dismisses the sheet — keeps every field and the step
you were on, and says so with a "Draft saved" toast; reopening drops you back
where you were. Only publishing or the header's discard button clears it. The
state lives in `CreateAdSheet`, which stays mounted, so no storage layer is
involved and blob previews stay valid.

`packages/shared/src/lib/adDraft.js` owns the step order and `validateStep(stepId, draft)`, so
the wizard can't advance past a step it never checked — errors land inline on
the offending field. `adDraft.test.js` covers the gates (8 cases).

The photos step fills the sheet with a drop zone (tap, or drag files in — the
handlers filter to `image/*`), previews with `URL.createObjectURL` and revokes
every URL on close or unmount, marks the first image as the cover, and caps at
6 with a fill meter. The review
step renders the ad as it will appear in the feed, with a pencil on each section
that jumps back to the step that owns it.

## Status

Stories live on the personals site. They show up twice, in the two shapes the
job actually needs:

- **`StoryRail`** — the Instagram tray at the top of the board: 66px gradient
  rings, truncated names, a `+` badge on your own. Gradient because the ring is
  the only ornament on the screen; grey once watched.
- **`StatusUpdates` (`/status`)** — WhatsApp's list shape, which carries what a
  rail can't: who posted, how long ago, how many updates, and whether you've
  watched them. `My status` first, then **Recent updates**, then **Viewed**.

Both draw the same **segmented ring** — one arc per update, gapped, a single SVG
circle with a computed `stroke-dasharray` (`ringDashes` in `lib/status.js`). The
gradient stroke needs a `<defs>` id per instance, so it keys off `useId()`; a
shared id would make every ring on the page render the first one's gradient.

**Player** (`/status/:id`) — segmented progress bars that fill over each slide's
five seconds, tap left/right or arrow keys to move, auto-advance, and a replay
button. Press-and-hold pauses the slide (`animation-play-state`).

The player freezes a **queue** of story ids on mount (mine → recent → viewed) and
walks it, so finishing one story rolls into the next instead of ejecting you.
The last story closes, and closing is history-aware: `navigate(-1)` normally, a
`replace` to `/status` only when `location.key === "default"` says you deep-linked
in with nothing to pop. Intra-story steps are `replace: true`, so Back leaves the
player rather than replaying it slide by slide.

Resetting the slide index when the story changes happens **during render**
(`if (id !== playing) { setPlaying(id); setIndex(0) }`), not in an effect — an
effect paints one frame of the new story at the old index first.

Watching is the whole interaction — no replies, no likes. `StatusContext` holds
the seen ids and persists them. Pure helpers (`statusTime`, `groupStatuses`,
`ringDashes`) live in `lib/status.js` with 5 tests.

A gotcha worth keeping: width and height don't apply to inline boxes, so the
ring's `<span>` needs `inline-block`. It worked inside the row only because flex
blockifies its children — nested one level deeper, the avatar collapsed to 0px.

## Support

The support screen is built as a funnel, widest first:

1. **Gradient hero** — a live "Support is online" pill and the search field, which
   is the fastest path for most people.
2. **Talk to us** — the four channels, each carrying its real cost: "~2 min",
   "Mon-Fri, 9-5 PT", "Within 24 hours". `to` stays in-app, `href` hands off to
   the device (tel:, mailto:, wa.me).
3. **Browse by topic** — four tiles that deep-link into a pre-filtered help
   centre (`/support/faqs?cat=Safety`); the chip there reads the query param, so
   the link and the UI can't disagree.
4. **Your tickets** and **Popular questions** side by side on desktop.
5. **Still stuck?** — one dark full-width block, the only escalation on the page.

Typing in the hero collapses everything below it to results plus a count; the
empty result offers the full help centre or a ticket rather than a dead end.

## Account and auth

`/login` renders outside `AppLayout` — no rail, no tab bar, since there is
nothing to navigate to until you're in. It's one form in two modes; `lib/auth.js`
owns `validateAuth(values, mode)` so sign-in and sign-up can't drift apart
(5 tests). Desktop splits it: brand panel left, form right.

There is no backend, so `AuthContext` is honest about what it is: signing in
means the form validated and we recorded who you said you were. Verifying the
password, issuing a token and expiring it are the server's job and are missing.
What _is_ real is the shape — one session the whole app reads, it survives a
reload, signing out clears it, and the account area is gated on it:

- `RequireAuth` wraps `app/(shell)/profile/layout.jsx`, so everything under
  `/profile` needs a session. It renders nothing until the session has loaded
  rather than flashing a signed-out screen and correcting itself, and it carries
  where you were going to the form as `?next=`, so signing in puts you back on
  the page you asked for.
- Logging out clears the session and goes to `/login`. The guard deliberately
  stands down once it has seen a session in that mount: without that it races
  the logout handler and wins, landing you on
  `/login?next=<the page you just chose to leave>`.
- The two frontends are separate origins. Saved listings live behind the shared
  backend account session and are filtered to the current site.

The three Account rows in Settings are real screens now:

- **Personal details** — validated profile form (name, email, phone, location, bio).
- **Password** — current/new/confirm, with the three strength rules ticking live
  as you type and a mismatch check on confirm.
- **Payment methods** — add, remove and re-default cards, credit packs, billing
  history. Card entry validates number length, `MM / YY` expiry and CVC.

Password inputs carry an explicit `aria-label`: the show/hide button sits inside
the `<label>`, so without one the input's accessible name picks up "Show
password" too.

## Categories and locations

Nineteen categories live in `packages/shared/src/data/mock.js`, and two lists
choose from them.

`homeCategories` is the nine on the launcher, in reading order: Vehicles,
Personals, Buy/Sell, Property, Services, Electronics, Entertainment, Jobs,
Fashion & Clothing.

The strip on `/browse` uses the five flagged `primary` (Vehicles, Jobs,
Services, Electronics, Buy/Sell), behind a pinned **Personals** tile that is an
`<a href>` to the other site rather than a filter; the other fourteen —
Property, Fashion & Clothing, Home & Garden, Business/Industrial, Pets,
Entertainment, Fitness & Sports, Antiques, Education, Events, Travel, Digital,
Dating, Tools — sit behind **More**, which opens the filter sheet on its
Category group. The More tile is pinned outside the scroller and adopts the
name and icon of whichever secondary category is picked, so the choice never
scrolls out of sight.

`packages/shared/src/data/locations.js` holds the Canadian coverage: All Canada plus thirteen
provinces and territories, 209 areas in all. Ontario, Quebec and BC are sold by
region (Greater Toronto Area, Montérégie, Vancouver Island…); the rest are sold
by city. `LocationBar` is the two-step picker — the **Province** tab chooses
one, which drops you into the **Cities** tab for its areas. They are one filter:
`activeFilterCount` counts them once, and clearing the province chip clears the
areas inside it.

## Filters

`packages/shared/src/lib/filters.js` is the whole filter model — a pure `applyFilters(listings,
filters, query)` plus helpers for the active-count badge and the chip row. It is
covered by `filters.test.js` (13 cases) and shared by Home and Nearby.

`FilterSheet` is the Flipkart/Amazon two-pane sheet: a group rail on the left
(Sort / Category / Price / Location / More), options on the right, and a footer
with **Clear all** and a live **Show N ads** count. Edits go to a draft and only
land on apply, so backing out of the sheet changes nothing. Applied filters
appear as removable chips above the feed via `FilterChips`.

Tapping **More** in the category strip opens the sheet on its Category group;
the strip and the sheet share one piece of state, so they can't disagree. The
personals board passes `hideCategory` — there is one category there, so the
group is dropped and the rail opens on Sort instead.

The rail is fixed and only the options pane scrolls, which means the scroll
container has to be inside the sheet body rather than the body itself. The sheet
also pins its own height, or it would jump 30px switching between groups.

## Palettes

Every colour comes from the CSS variables in
`packages/shared/src/index.css`. The personals app stamps
`data-theme="personals"` on `<html>` in its root layout and the whole site
re-skins from that one attribute: the same nine roles, remapped light to dark
and indigo to rose.

Three things do not survive a light-to-dark remap on their own, and each is
handled in the theme rather than at the call sites:

- **Shadows.** A 4%-black shadow is invisible on near-black, so the dark theme
  restates all three; elevation there comes from the surface step and the
  hairline, not from a cast shadow.
- **`--on-brand`.** On a dark ground the brand has to be bright enough to read
  as text, which leaves it far too light to carry white button labels — white
  on the rose measures 2.95:1. So text that sits _on_ a brand fill has its own
  token: `#fff` in the light theme, near-black on personals. Anything painted
  `brand-gradient` or `bg-brand` uses `text-on-brand`, never `text-white`.
- **`--danger`.** `red-500` clears 4.5:1 on a dark surface but manages only
  3.8:1 on a white one, so the two themes carry different reds.

Two token pairs are load-bearing and easy to get backwards. `--ink` and
`--canvas` swap ends between themes, so an inverted block is `bg-ink
text-canvas` — `bg-ink text-white` is white-on-white on personals. And a scrim
is always "darken", never `bg-ink/40`, which lays a milky sheet over a dark
page; those are plain `bg-black/50`.

Greys are tinted toward the brand hue rather than neutral, so the dark reads as
a colour and not as switched-off. Category icon chips are the one place a
pastel had to be restated hue by hue — they live as `tone-*` utilities in
`index.css` with a `[data-theme="personals"]` block, and `lib/tones.js` is the
one map the three screens that use them share.

The map is OpenStreetMap in both themes; personals inverts and hue-rotates the
tile images rather than paying for a second tile provider. The filter is on
`.leaflet-tile` alone, so the pins and controls stay as drawn.

## The adult treatment

The personals site is a different room, not a re-skin of the marketplace:

- **Age gate** (`app/AgeGate.jsx`) — a full-screen 18+ door in the root layout,
  so a deep link into an ad is gated too, not just the home screen. It defaults
  to closed, which is also what the server renders, so the first paint of a cold
  visit is the door rather than a flash of the board. The board stays mounted
  behind it — the page is still server-rendered — but carries `inert`, because a
  gate you can tab straight past is decoration.
- **Discreet mode** (`app/useDiscreet.js`) — blurs every photo until you ask for
  it, for reading the board with people around. It is an attribute on `<html>`
  and one CSS rule over `[data-media]`, not a prop threaded through the tree:
  media shows up in the feed, the story rail and the ad gallery, and none of
  them should have to know. It is set from the root layout rather than the
  board, or loading an ad page directly would come up sharp. The clip lives on
  the wrapper and the blur on the image, since an element's own `overflow` does
  not clip its own filter.
- **Not indexed** — `noindex, nofollow` plus the `RTA` label in the root
  layout's metadata, so the whole origin is marked at once.
- **A standing 18+ label** on the board. The gate is a one-time door; the chip
  next to **Browse** is what says where you are after it.

## Structure

```
apps/
  marketplace/     next.config.mjs, postcss.config.mjs, open-next.config.ts, wrangler.jsonc
    app/           the route tree (above) — routing, layouts and metadata only
  personals/       the same, plus AgeGate.jsx and useDiscreet.js in app/
packages/
  shared/src/
    components/
      layout/    AppLayout, Sidebar, TopBar, SubPageBar, BottomNav, PageBody, Wordmark, navItems
      ui/        Button, SearchBar, SegmentedControl, Accordion, Modal, BottomSheet,
                 ChoiceRow, ConfirmDialog, EmptyState, Icon
      cards/     ListingCard, NearbyListingCard, PersonCard
      create/    CreateAdSheet + one file per step
      StatusList, CategoryStrip, LocationBar, MapView, FilterSheet, FilterChips
      RequireAuth
    pages/       the screens both sites serve (see the Screens table)
    context/     AuthContext, FeedContext, SavedContext, StatusContext, ToastContext
    data/        mock.js (screen content), locations.js (provinces and areas)
    lib/         sites.js, nav.jsx, persisted.js, tones.js, format.js, filters.js,
                 adDraft.js, auth.js, status.js, saved.js (+ tests)
    index.css    tokens, utilities, tone chips, both palettes
```

Everything under `components/`, `pages/` and `context/` carries `"use client"`.
The server half of the app is `app/` and nothing else.

## Notes

### Module 10 notifications

Both sites use the authenticated `/me/notifications` API for the inbox, keyset
pagination, unread count, and read-one/read-all actions. Top-bar and profile badges
share a session-scoped query cache; no notification fixtures are used in production.
The cache is discarded on account/session replacement and ignores stale requests.
Unread counts refresh every 30 seconds while visible and on window focus; an inbox
already loaded is refreshed alongside the count. Refresh and retry controls are
available, and failed writes never falsely mark an alert as read.

In-app notifications are always available. The existing Account Settings email/push
preferences control optional delivery channels on the backend; push provider/device
registration and email deployment configuration are separate operational concerns.

Run `npm test`, `npm run build:all`, and `npm run test:browser` to verify. Notification
browser scenarios run real Next/React UI on both sites with **mocked HTTP APIs**;
they cover authentication, badges, CSRF/site scope, read durability across browser
reloads, failed reads/writes, empty state, and pagination. They are not live
frontend-to-backend acceptance tests. Backend persistence and isolation require the
backend integration suite.

An additional **opt-in live smoke** closes that API integration gap for the Module
10 inbox: from `Backend`, run `mvn -Pintegration -Dtest=NotificationBrowserIT test`.
It requires Docker/Testcontainers, installed frontend npm dependencies, and local
Chrome (or a Playwright Chromium install / `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`).
The harness starts isolated Postgres and Spring Boot, provisions an ephemeral user
with two alerts per site, and supplies `VEZLIST_LIVE_API_BASE_URL`,
`VEZLIST_LIVE_EMAIL`, and `VEZLIST_LIVE_PASSWORD` to `npm run test:browser:live`.
Do not point it at a shared/production account: it marks the seeded notifications
read. The frontend configuration only accepts a `127.0.0.1` HTTP backend.

This separate suite starts Next on ports 3200/3201 with `.next-live` build output
and real login/session/CSRF calls, validates site-scoped responses, and verifies
read-one/read-all persistence after reload. It has **no HTTP interception**. Only
the Personals age-gate acknowledgement is set locally for the adult test account.
Live tests are excluded from the regular mocked browser suite; credentials are
never logged and trace/video/screenshot/AI page-snapshot recording is disabled for
this suite. See [live browser prerequisites](e2e-live/README.md).

- Some unfinished screens still use `packages/shared/src/data/mock.js`; implemented account, listing, seller, moderation, and notification flows use backend APIs.
- Icons referenced from data go through `Icon`'s explicit registry — an unregistered
  name silently renders a blank circle, so add new ones there when you add data.
  Filtering runs client-side over that array — move it into the query when there's an API.
- Images come from `picsum.photos`, so the feeds need network access to show
  photos. The host is allow-listed in each `next.config.mjs`.
- The map is Leaflet on OpenStreetMap tiles — no API key needed. Leaflet reads
  `window` while it is being imported, so `MapView` is pulled in with
  `next/dynamic` and `ssr: false`; the rest of Nearby still renders on the server.
- The bottom-nav label reads "Support"; the mockup spells it "Sapport".
- Map pins are inline SVG rather than emoji so they don't depend on an emoji font.
- `.leaflet-container` gets `isolation: isolate` — Leaflet's panes go up to
  `z-index: 700` and would otherwise paint over any dialog opened on the map page.
- Inter is self-hosted and subset by `next/font/google` in each root layout,
  exposed to Tailwind as `--font-inter`; the stack falls back to the system UI
  font. No render-blocking request to a third-party origin.
- The mockups' iOS status bar and home indicator are not reproduced — the device
  draws those. The bottom nav pads for `env(safe-area-inset-bottom)` instead.
