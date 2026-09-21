# Vezlist

Mobile screens from `Base Pages - Main Web.pdf`, built with Next.js 16 (App
Router) + React 19 + Tailwind v4, deployed to Cloudflare Workers via OpenNext.

```bash
npm install
npm run dev              # marketplace  http://localhost:3000
npm run dev:personals    # personals    http://localhost:3001
npm run dev:admin        # console      http://localhost:3002
npm run build            # next build -> apps/marketplace/.next
npm run build:all        # all three workspaces
npm start                # next start, production server
npm run preview          # build for Cloudflare and run it in workerd
npm run deploy:all       # all three workers
npm test                 # both suites: node:test over lib/, Vitest over *.jsx
npm run test:unit        # node:test only — no framework, no DOM
npm run test:components  # Vitest + Testing Library only
npm run test:e2e         # Playwright: post an ad, promote, moderate
```

Cloudflare account setup — R2 buckets, custom domains, CI — is in
[DEPLOY.md](DEPLOY.md).

## Two sites, one repo

`vezlist.cc` is the marketplace; `personals.vezlist.cc` is the adult board. Two
Next apps, two builds, two Cloudflare workers — one npm workspace each, both
eating the same `packages/shared`. `admin.vezlist.cc` is a third build off the
same package: the moderation console, covered in [its own section](#the-console).

```
apps/marketplace/   app/ route tree, next + wrangler + open-next config
apps/personals/     app/ route tree, next + wrangler + open-next config
apps/admin/         app/ route tree, next + wrangler + open-next config
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

**Known consequence:** browser storage is per-origin, so saved items
(`vezlist:saved:v1`) and watched-status (`vezlist:status-seen:v1`) do **not**
carry across the two sites. Sharing them needs a backend session or a cookie on the
parent domain — neither exists yet. The create sheet is also still the
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

Route groups are the reason `/ad/[id]` (in the shell) and `/status/[id]` (full
bleed) can sit under different layouts — the parentheses never reach the URL.
There used to be a `/status` list page in the shell alongside the player; the
stories now live only on the board's rail, so the player is the whole feature.

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
| `/` (personals)              | The board — story rail, photo grid                                |
| `/nearby`                    | Map + a "near you" sheet, on both sites                           |
| `/status/:id`                | Story player — full-bleed, outside the shell                      |
| `/support`                   | Help search, contact channels, tickets, FAQ accordion             |
| `/profile`                   | Profile card, stats, menu, log out                                |
| `/ad/a1`, `/ad/a2`           | Ad detail — vehicle / person                                      |
| `/seller/:id`                | Seller profile + their live ads                                   |
| `/profile/dashboard`         | Creator dashboard — views, saves, replies, 7-day trend            |
| `/profile/wallet`            | Credit balance, packs, and the transaction ledger                 |
| `/profile/ads`               | My Ads — Active / In review / Expired, with edit, promote, delete |
| `/profile/saved`             | Saved Items, backed by the saved-ads store                        |
| `/profile/notifications`     | Grouped notifications, unread state, mark all read                |
| `/profile/settings`          | Account rows and privacy/notification toggles                     |
| `/profile/settings/details`  | Personal details form — name, email, phone, location, bio         |
| `/profile/settings/password` | Password change with live strength rules                          |
| `/profile/settings/payment`  | Saved cards and the card-charge statement                         |
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

The app bar is a glass row carrying the page title and two actions,
notifications and credits — and it is **desktop only**. Below `lg` it does not
render at all: on a phone it spent a whole row restating the wordmark already
sitting under it, and the tab bar is the navigation. Its two actions moved onto
the profile screen, which is where a phone reaches for them. Sub-pages are the
exception and keep `SubPageBar` (back + title + action) at every width —
without it a phone has no way back out of a detail screen.

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
  slot centre (`50 / items.length`%, half a slot — derived, so a bar with a
  different slot count still ends in round caps), so the chain terminates in full
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

The thumbnail is a `MediaImage` with `discreet` set, which is what personals'
discreet mode withholds; the title and price stay sharp, so a closed feed is
still a readable one.

## Navigation

Every control goes somewhere. Profile rows, ticket rows, "View All", "View All
FAQs", the seller card on an ad, story avatars and the notification bell are
all real links; unknown paths redirect to `/`.

The contact tiles on Support hand off to the device rather than faking a screen
— `mailto:` — and "Contact Me Now" opens a `mailto:` prefilled with the ad
title. Live Chat is the one in-app tile, going to the ticket list.

Screens you reach from another screen use `SubPageBar` (back + title + optional
action); it falls back to a sensible parent route when there's no history to pop.

## State that outlives a screen

- `FeedContext` — the feed's filters and search query. It lives in the root
  layout, which Next keeps mounted across every navigation, so the filters
  survive a trip into the full-screen status player and back.
- `AuthContext` — the signed-in session, persisted. `RequireAuth` and the
  account screens read it; see **Account and auth**.
- `SavedContext` — saved ad ids, persisted. The heart on an ad page and the
  Saved Items screen read the same store, so they can't disagree.
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
the offending field. `adDraft.test.js` covers the gates (18 cases).

The photos step fills the sheet with a drop zone (tap, or drag files in — the
handlers filter to `image/*`), previews with `URL.createObjectURL` and revokes
every URL on close or unmount, marks the first image as the cover, and caps at
6 with a fill meter. The review
step renders the ad as it will appear in the feed, with a pencil on each section
that jumps back to the step that owns it.

## Stories

Stories live on the personals site, under one heading on the board — **Stories**
to the reader, `status` to every identifier behind it, because the copy changed
and a rename of `StatusContext`, `groupStatuses` and the `/status/:id` route was
not worth the churn.

- **`StoryRail`** — the Instagram tray at the top of the board: 66px gradient
  rings and truncated names. Gradient because the ring is the only ornament on
  the screen; grey once watched.
- There was a second shape, a WhatsApp-style list at `/status` carrying who
  posted, how long ago and how many updates. It is gone: the rail already shows
  everything, and the tile for posting your own moved to the profile menu, where
  people look for the things they own.

The rail draws a **segmented ring** — one arc per update, gapped, a single SVG
circle with a computed `stroke-dasharray` (`ringDashes` in `lib/status.js`). The
gradient stroke needs a `<defs>` id per instance, so it keys off `useId()`; a
shared id would make every ring on the page render the first one's gradient.

**Player** (`/status/:id`) — segmented progress bars that fill over each slide's
five seconds, tap left/right or arrow keys to move, auto-advance, and a replay
button. Press-and-hold pauses the slide (`animation-play-state`).

The player freezes a **queue** of story ids on mount (mine → recent → viewed) and
walks it, so finishing one story rolls into the next instead of ejecting you.
The last story closes, and closing is history-aware: `navigate(-1)` normally, a
`replace` to `/` — the board, where the rail is — only when the history stack
says you deep-linked in with nothing to pop. Intra-story steps are `replace: true`, so Back leaves the
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
2. **Talk to us** — two channels, each carrying its real cost: "~2 min",
   "Within 24 hours". `to` stays in-app, `href` hands off to the device
   (`mailto:`). There were four; the phone line and the WhatsApp number are
   gone, because a channel nobody is staffing is worse than one fewer channel —
   the person who used it believes they have been in touch.
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
- The session is a cookie on the parent domain, not localStorage, so it _does_
  cross the two origins: signing in on either site signs you in on both. The
  credit wallet rides the same mechanism, for the blunt reason that a balance
  existing on only one of the two sites is a balance you can spend twice.
  Saved items still do not carry across — they are a bigger payload than a
  cookie wants.

Because there is nothing to register against, `/login` also carries two **demo
accounts** (`demoAccounts` in `mock.js`), printed credentials and all:

| Button      | Signs you in as | Email              | Password      |
| ----------- | --------------- | ------------------ | ------------- |
| Ads creator | `creator`       | `sarah@vezlist.cc` | `creator123`  |
| Browsing    | `user`          | `alex@vezlist.cc`  | `browsing123` |

The passwords are on the screen on purpose — they authenticate nothing, and a
demo credential you have to ask someone for is not one. The Browsing row is the
only way to reach that view without switching down in Settings, since signup
always makes a creator. Both sign in as the mock profile (Sarah), whose ads,
saved items and tickets the rest of the app is full of; only the role differs.
When a real backend lands, that array and the block rendering it are the first
two things to delete.

The three Account rows in Settings are real screens now:

- **Personal details** — validated profile form (name, email, phone, location, bio).
- **Password** — current/new/confirm, with the three strength rules ticking live
  as you type and a mismatch check on confirm.
- **Payment methods** — add, remove and re-default cards, and the card-charge
  statement derived from the wallet ledger. Buying credits lives on
  `/profile/wallet` instead: two buy buttons backed by two ideas of the balance
  is a bug waiting to be filed. Card entry validates number length, `MM / YY`
  expiry and CVC.

Password inputs carry an explicit `aria-label`: the show/hide button sits inside
the `<label>`, so without one the input's accessible name picks up "Show
password" too.

## Two kinds of account

Most people on a classifieds board never post anything, and the app was built
as though everyone did — everyone got My Ads, everyone got a credit balance.
There are two account types now:

| Role                    | Has                                                            |
| ----------------------- | -------------------------------------------------------------- |
| `user` (Browsing)       | Browse, save, contact, open tickets, hold a balance            |
| `creator` (Ads creator) | All of that, plus posting, My Ads, the dashboard, and spending |

**Signup does not ask which one you want.** It did, briefly, and the question
had no good answer: browsing needs no account, so the only thing an account
buys you is the ability to post — and offering Browsing on the form invited
people to pick the account that cannot do the thing they opened the form to do,
then find out later on a screen that was missing. So `SIGNUP_ROLE` is
`creator`, full stop. Browsing is what a **signed-out visitor** is, and what
you can move _down_ to in Settings once you have stopped selling.

That is also why signing in falls back to `SIGNUP_ROLE` rather than
`DEFAULT_ROLE` when this browser has never held a session: with no server to
ask, the browsing default would sign a seller in to an account with no My Ads
and nothing on screen to explain why.

`lib/accountRoles.js` holds one capability matrix (8 tests) read by the shell to
decide which tabs exist, by Profile to decide which menu rows it draws, and by
the wallet to decide whether a spend is allowed at all. Same honesty as the
console's `adminRoles.js`: it shapes what the UI offers and what the store
accepts, and it is **not** a security boundary, because the client owns the
store. On a real backend the matrix moves to the server and stays here only to
hide buttons.

The role rides on the session cookie, so it crosses both origins with the
account. Three consequences worth knowing:

- The tab bar keeps five slots either way. A browsing account has no **Create**,
  so `navItemsFor` swaps that slot for **Saved** rather than dropping it — the
  goo chain's geometry is derived from the slot count (`50 / items.length`%),
  but a four-slot bar would still read as a different app.
- A creator screen reached by a browsing account is not an error, it is someone
  who found the thing they would switch for. `RequireCapability` renders the
  offer in place instead of redirecting, so deep links and bookmarks survive.
- Hiding a row is not the guard. Every gated action checks the capability again
  where it happens — `spendCredits` refuses on role _and_ on funds.

## Credits

Credits were a number painted on the app bar: `credits = 100`, a default
argument, the same on every screen and unmoved by anything you did. They are a
model now — `lib/wallet.js`, pure functions, no React, 11 tests.

One balance and one ledger, moved by two verbs. `topUp` adds a pack; `spend`
refuses rather than overdrawing and hands the caller back the _same object_, so
"nothing changed" is a thing every call site can test for and report. Promoting
an ad costs 20, 60 or 140 credits (`boostOptions`) and is the only thing that
spends them — posting is free. `MyAds` calls `spendCredits` **before** it marks
a row promoted, so a refused spend cannot leave a phantom badge behind.

The wallet is a cookie on the parent domain for the same reason the session is:
a balance that exists on only one of two origins is a balance you spend twice.
That is also why the ledger is capped at 12 rows and labels are clipped to 64
characters — an ad title is whatever somebody typed, and a cookie over ~4KB is
dropped by the browser silently, as a no-op rather than an error.

Money and credits are different units and the screens never mix them: a pack
costs `$25` and grants `350 credits`, a promotion costs `60 credits` and no
dollars. `/profile/settings/payment` shows the dollars side (card charges,
derived from ledger rows that carry a `price`); `/profile/wallet` shows the
credits side. Neither invents a number the other disagrees with.

## Categories and locations

Nineteen categories live in `packages/shared/src/data/mock.js`, and two lists
choose from them. Each carries `subs` — its sub-categories, **83 in
all** (Vehicles → Cars & Trucks · Motorcycles · Boats · RVs & Campers · Parts).

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

### Sub-categories

Two levels, and it stops there. A third needs breadcrumbs in the heading, a
third step in the create form and a recursive picker, and no classifieds board
has needed one — "Vehicles › Cars & Trucks" is where people stop describing and
start searching.

**The rule the whole feature turns on: a sub-category is optional at every point
it is asked for.** An ad may sit directly in Vehicles; six of the twenty-three
seeded listings do, deliberately, so every screen gets built against the
unclassified ad rather than only the happy path — a test in `taxonomy.test.js`
fails if that ever becomes none or all. Filtering on Vehicles matches those ads
too; only naming a sub-category narrows past them.

`lib/taxonomy.js` owns the tree (`subsFor`, `isSubOf`, `categoryPath`, 8 tests).
`isSubOf(cat, null)` is **true**, because absent is valid and treating it as an
error is precisely how the optional case gets broken.

In the filter model it is `subcategory` — **singular**, where `categories` is
plural. That asymmetry is the design: narrowing to Vehicles _and_ Property is a
reasonable thing to want, but Cars & Trucks _and_ Motorcycles is what the
Vehicles filter already does. It only means something under exactly one
category, so `reconcileSubcategory` drops it the moment that stops being true,
and every writer of `categories` runs its patch through it — the invalid state
is unreachable rather than merely unrendered.

Where it surfaces:

- **Launcher** — each card carries a live ad count off `listings` and its first
  three subs as chips linking to `/browse?cat=<id>&sub=<label>`. The card is an
  `<li>` with a stretched `after:` overlay for the category link, so the chips
  are siblings rather than anchors nested inside an anchor.
- **Filter sheet** — check exactly one category and its subs open beneath it as
  a radio group, led by "All of {category}" so there is always a way back to any.
- **`/browse`** — the heading reads `Vehicles › Cars & Trucks`. A `?sub=` naming
  a sub-category of some other category is dropped rather than yielding an empty
  feed with no visible cause.
- **Create** — a Sub-category field marked `Optional`, with **None** as its own
  pill rather than a second press on the chosen one: nothing tells you a pressed
  pill can be un-pressed, and a keyboard user would never find it. Changing the
  category clears it in the same patch, so the illegal pair never exists for a
  frame.
- **Console** — Taxonomy expands a category to add, rename, reorder and remove
  its subs (owner-only, `taxonomy.edit`). Removing one **nulls the ads filed
  under it** rather than deleting them: a dangling label is reachable through no
  filter at all while the ad goes on claiming it. Re-filing an ad into another
  category does the same, for the same reason.

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
covered by `filters.test.js` (21 cases) and shared by Home and Nearby.

`FilterSheet` is the Flipkart/Amazon two-pane sheet: a group rail on the left
(Sort by / Category / Location / More filters — a price filter was considered
and explicitly declined as not-planned, issue #27), options on the right, and
a footer with **Clear all** and a live **Show N ads** count. Edits go to a
draft and only land on apply, so backing out of the sheet changes nothing.
Applied filters appear as removable chips above the feed via `FilterChips`.

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
- **Discreet mode** (`app/useDiscreet.js`) — withholds every photo until you ask
  for it, for reading the board with people around: `MediaImage`
  (`components/media/MediaImage.jsx`) does not set `src` while the switch is
  on, so nothing downloads, not just a blur over something that already did.
  The switch is an attribute on `<html>`, not a prop threaded through the
  tree — media shows up in the feed, the story rail and the ad gallery, and
  none of them should have to know beyond passing `discreet` to `MediaImage`.
  It is set from the root layout rather than the board, or loading an ad page
  directly would come up sharp. Reveal is the same toggle, board-wide, not a
  per-photo tap — turning discreet mode off is what reveals it, and that
  reveal is a real network fetch, so a freshly revealed photo appears slower
  than an already-loaded one did under the old CSS-only blur.
- **Not indexed** — `noindex, nofollow` plus the `RTA` label in the root
  layout's metadata, so the whole origin is marked at once.
- **A standing 18+ label** on the board. The gate is a one-time door; the chip
  next to **Browse** is what says where you are after it.

## The console

`admin.vezlist.cc` moderates both boards from one place. It is a third build off
`packages/shared` rather than a fourth codebase, but it shares almost nothing at
runtime with the two public sites — and the things it does not share are the
point.

|             | the console                                                         |
| ----------- | ------------------------------------------------------------------- |
| workspace   | `@vezlist/admin`, dev port 3002, worker `vezlist-admin`             |
| screens     | `packages/shared/src/admin/` — 18, one per section                  |
| state       | `lib/adminStore.js`: `buildSeed()` + one reducer, no React          |
| persistence | `localStorage` under `vezlist:admin:v1`                             |
| session     | `localStorage`, **not** the shared cookie                           |
| shell       | its own `AdminLayout` — no phone mockup, no age gate, no bottom nav |
| indexing    | `noindex, nofollow` in the root layout                              |

**`site` is a column, not a fork.** `listings` and `personalsListings` are folded
into one `allListings` at seed time, each row stamped with the board it came out
of. Every screen filters on that field; nothing re-derives it. The top bar's site
switcher writes `?site=` to the URL, which is what makes a filtered queue —
`/listings?status=pending&site=personals` — a link one moderator can send
another.

**The session is deliberately per-origin.** The two public sites share one
account through a cookie on the parent domain; the console uses `localStorage`
on its own hostname instead. A signed-in shopper is not a signed-in moderator,
and that isolation is free rather than enforced. Do not move the console onto a
path of either public host.

**Every mutation is one reducer action and one audit entry** —
`{ id, at, actor, action, entity, entityId, note }`, newest first, capped at 200.
The actor, the role and the clock are injected by `AdminDataContext`, so
`reducer` stays a function of `(state, action)` — which is what lets the same
action replay identically under StrictMode's double-invoke. `reducer` is the
half worth testing and `lib/adminStore.test.js` covers it in 57 cases.
`admin/Listings.test.jsx` covers the other half — that a moderator can reach
approve and reject from the queue, and that the reducer refuses a `support`
session that gets as far as pressing the button.

**Three roles, enforced at both ends.** `lib/adminRoles.js` holds one matrix —
owner / moderator / support against ~19 permissions — and it is read twice: by
the screens, to decide what to render, and by the reducer, to decide what to
honour. Both on purpose. Hiding a button stops the button, not the dispatch
behind it, and the reducer is the one place every mutation passes through.
Deleting is separated from moderating throughout: approving is reversible and
rejecting is a conversation, but a delete is neither, so it stays with the
owner. This is a real permission model with no server behind it — on a backend
the matrix moves server-side and stays here only to grey out buttons.

**The charts are four divs deep, not a library.** `components/admin/Charts.jsx`
builds columns, a stacked status bar and ranked bars out of HTML, because the
specs that matter are in real pixels — a bar caps at 24px, fills are separated
by a 2px gap of surface, a hit target clears 24px — and inside a scaling
`viewBox` none of those numbers mean what they say. Every chart plots one
series and so wears one hue with no legend; the only multi-colour mark is the
status bar, whose three chromatic fills were validated rather than eyeballed
(ΔE 13.0 under protanopia, 27.5 in normal vision). `expired` is deliberately
achromatic — it is the absent state, not a fourth identity. Every chart ships a
table twin, because a tooltip may enhance a value but must never be the only
way to read it.

**Honest limit, stated on `/settings` as well as here:** the console writes to
its own storage. Three origins, three storages, no server between them — so
approving an ad here does not publish it on `vezlist.cc`. Swapping the reducer
for an API is one file, `context/AdminDataContext.jsx`, because that is the only
place `adminStore` is called; screens never import `data/mock.js` directly.

Personals media on `/live` and `/status` opens **withheld**, via the same
`MediaImage` component the public board uses, gated by this screen's own
Reveal button (`components/admin/RevealMedia.jsx`) rather than the board's
`[data-discreet]` switch — the console gets opened on office screens. Nothing
downloads until a moderator presses Reveal; before this, the photos were
fetched either way and only blurred with CSS, one click from anyone at the
screen.

## Structure

```
apps/
  marketplace/     next.config.mjs, postcss.config.mjs, open-next.config.ts, wrangler.jsonc
    app/           the route tree (above) — routing, layouts and metadata only
  personals/       the same, plus AgeGate.jsx and useDiscreet.js in app/
  admin/           the same; app/(admin)/ is the whole console behind one layout
packages/
  shared/src/
    components/
      layout/    AppLayout, Sidebar, TopBar, SubPageBar, BottomNav, PageBody, Wordmark, navItems
      ui/        Button, SearchBar, SegmentedControl, Accordion, Modal, BottomSheet,
                 ChoiceRow, ConfirmDialog, EmptyState, Icon
      cards/     ListingCard, NearbyListingCard, PersonCard
      create/    CreateAdSheet + one file per step
      admin/     AdminLayout, DataTable, StatCard, Sparkline, StatusBadge,
                 AdminHeader, RevealMedia, RequireAdmin, adminNav
      StatusList, LocationBar, MapView, FilterSheet, FilterChips
      RequireAuth
    pages/       the screens both sites serve (see the Screens table)
    admin/       the console's screens — one per section, nothing public imports them
    context/     AuthContext, FeedContext, SavedContext, StatusContext, ToastContext,
                 AdminAuthContext, AdminDataContext
    data/        mock.js (screen content), locations.js (provinces and areas)
    lib/         sites.js, nav.jsx, persisted.js, tones.js, format.js, filters.js,
                 adDraft.js, auth.js, status.js, adminStore.js, adminScope.js (+ tests)
    index.css    tokens, utilities, tone chips, both palettes
```

Everything under `components/`, `pages/` and `context/` carries `"use client"`.
The server half of the app is `app/` and nothing else.

## Notes

- Data is static mock data in `packages/shared/src/data/mock.js`; swap it for API calls at the page level.
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
