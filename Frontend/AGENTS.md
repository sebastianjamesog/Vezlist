# AGENTS.md

> Auto-maintained by the global **engineering-craft** suite. A SessionStart hook drops
> this file into a project root when none exists. It is a starting point, not a cage —
> **edit and extend it freely per project.** Add stack-specific commands, conventions,
> and gotchas below. The suite will not overwrite an existing AGENTS.md.

This file orients any AI coding assistant (or human) working in this repo. It lists the
on-demand engineering skills and subagents available everywhere, plus a digest of the
standards they enforce. When a task touches a domain below, reach for the matching skill
or subagent instead of improvising.

## Skills available

On-demand expertise. Invoke a skill by name when its domain comes up; each also
auto-activates on the trigger phrases shown.

- **craft:architecture** — System and service/module boundaries, layering, scaling.
  Say things like *"monolith vs microservices?"*, *"where's the boundary here?"*,
  *"draft an ADR"*, *"this is too coupled"*.
- **craft:api-design** — REST/GraphQL/gRPC contracts, versioning, errors, auth.
  Say things like *"design this endpoint"*, *"how do I version this API?"*,
  *"paginate this list"*, *"add idempotency keys"*.
- **craft:database-design** — Schemas, keys, indexes, migrations, query tuning.
  Say things like *"design this table"*, *"SQL or NoSQL?"*, *"zero-downtime migration"*,
  *"why is this query slow?"*.
- **craft:project-structure** — Repo layout, monorepo vs polyrepo, naming, scaffolding.
  Say things like *"how should I lay out this repo?"*, *"feature or layer folders?"*,
  *"where do tests/config go?"*, *"scaffold a Go service"*.
- **craft:clean-code** — Naming, small functions, SOLID, DRY/KISS, refactoring smells.
  Say things like *"clean up this function"*, *"is this a code smell?"*,
  *"better name for this"*, *"too many arguments"*.
- **craft:testing-strategy** — Unit/integration/e2e/contract mix, TDD, flaky tests.
  Say things like *"how should I test this?"*, *"unit or integration?"*,
  *"this test is flaky"*, *"what coverage gate?"*.
- **craft:security-practices** — OWASP defenses, injection/SSRF, authn/z, secrets.
  Say things like *"is this input safe?"*, *"how do I store this secret?"*,
  *"prevent SQL injection"*, *"harden this auth flow"*.
- **craft:performance-optimization** — Profiling, caching, batching, N+1, Web Vitals.
  Say things like *"this is slow"*, *"profile this"*, *"fix this N+1"*,
  *"is this optimization worth it?"*, *"improve LCP/INP"*.
- **craft:git-workflow** — Branching, rebasing, conflicts, commit/changelog, releases.
  Say things like *"name this branch"*, *"rebase or merge?"*, *"fix this conflict"*,
  *"Conventional Commit for this"*, *"semver bump?"*.
- **craft:code-review** — Reviewer checklists, severity tagging, PR size, kind feedback.
  Say things like *"review this PR"*, *"block or nit?"*, *"how big is too big?"*,
  *"write this review comment"*.

## Subagents available

Heavier, autonomous workers. Dispatch one when you want a focused job done end-to-end
and returned as a self-contained result (design doc, diff, or cited review).

- **system-architect** — Dispatch for system design, project decomposition into phased
  task graphs, build-vs-buy, stack/DB selection, data modeling, and ADRs.
- **api-designer** — Dispatch to design or review an API contract (REST/GraphQL/gRPC):
  resource modeling, versioning, pagination, error models, auth, OpenAPI/SDL/proto.
- **code-reviewer** — Dispatch to review a diff/PR/commit range/files for correctness,
  readability, security, and performance. Returns severity-tagged, file:line findings.
- **test-engineer** — Dispatch to write or strengthen tests, design test strategy, fix
  flaky tests, or raise meaningful coverage. Returns a test diff plus run results.
- **security-auditor** — Dispatch to audit for OWASP Top 10, broken authn/z and IDOR,
  hardcoded secrets, and vulnerable deps. Read-only, defensive. Returns ranked findings.
- **performance-engineer** — Dispatch to profile and fix hot paths, slow queries, memory
  growth, or bloated payloads, measure-first. Returns ranked, measured fixes.
- **refactorer** — Dispatch to cut tech debt and code smells while preserving behavior.
  Returns a behavior-preserving diff plus a change log and verification evidence.
- **devops-engineer** — Dispatch to set up or repair CI/CD, git workflow, release
  automation, or build/test gating. Returns a diagnosis plus applied, verified changes.

## Engineering standards (digest)

The 20-30 cross-cutting rules these skills enforce. Concrete and checkable.

### Architecture & boundaries
- Dependencies point inward: domain/business logic never imports framework, I/O, or UI.
- Start with a modular monolith; extract a service only when a real scaling, deploy, or
  team-ownership pressure justifies the operational cost.
- One module = one reason to change; cross-module calls go through explicit interfaces,
  not shared mutable state or reaching into another module's internals.
- Record non-obvious, hard-to-reverse decisions as a short ADR (context, decision,
  consequences).

### APIs & contracts
- Contract-first: agree the schema (OpenAPI/SDL/proto) before implementing; treat it as
  the source of truth.
- Use correct HTTP semantics — nouns in paths, verbs as methods, accurate status codes;
  return a consistent error envelope (code, message, details), never raw stack traces.
- Versioning and additive change only on public contracts; breaking a field requires a
  new version. Paginate every unbounded list; make writes idempotent where retries occur.

### Data & migrations
- Every table has a primary key; enforce invariants with NOT NULL, FK, UNIQUE, and CHECK
  constraints, not just application code.
- Index for your actual query patterns; never ship an unbounded full-table scan on a hot
  path. Find and kill N+1 access.
- Migrations are forward-only and reversible-by-design: expand → backfill → contract for
  zero-downtime; never destructive in the same deploy that starts using the change.

### Project structure
- Group by feature/domain, not by technical layer, once the repo is past trivial size.
- One clear place for tests, config, scripts, and docs; predictable, consistent naming.
- Never commit secrets; provide `.env.example`, keep real `.env` git-ignored. Commit
  lockfiles; keep dependencies pinned and pruned.

### Clean code
- Names reveal intent; functions are small and do one thing; prefer guard clauses over
  nested conditionals.
- Comments explain *why*, not *what*; delete dead and commented-out code.
- No duplication of logic (DRY), no speculative generality (YAGNI); keep cyclomatic
  complexity low and prefer pure functions and immutable data where practical.

### Testing
- Follow the test pyramid: many fast unit tests, fewer integration, fewest e2e.
- Tests are deterministic — no real time, network, or randomness without control; fix or
  delete flaky tests, never `@skip` and forget.
- Test behavior and edge cases, not implementation details; every bug fix ships with a
  regression test. Gate CI on tests passing and a meaningful coverage floor.

### Security
- Validate and constrain all external input at the boundary; encode output for its sink
  (HTML, SQL, shell, URL).
- Parameterize every query; never build SQL, shell, or template strings from user input.
  Guard outbound requests against SSRF.
- Authenticate, then authorize every request on the server, checking object ownership
  (no IDOR). Keep secrets out of code, logs, and the client; rely on least privilege and
  secure defaults.

### Performance
- Measure before optimizing — profile to find the real hot path; never tune on a hunch.
- Eliminate N+1 and unbounded queries first; batch, cache (with an invalidation plan),
  and paginate. Keep payloads and bundles lean.
- An optimization is only "done" when a benchmark shows it helped and didn't break
  behavior.

### Git & review
- One logical change per commit; write Conventional Commit messages that say why.
- Branch off an up-to-date main; keep PRs small and focused so they can be reviewed well;
  protect main and require green CI before merge.
- Reviews are kind, specific, and actionable; tag severity (Critical/High/Medium/Low/Nit)
  and cite file:line. Block on correctness and security; everything else is a nit.

## How to use this file

**AI agents:** Treat this as standing project context. When a task matches a skill's
domain, invoke that skill by name; for a self-contained job (design, tests, review,
audit, refactor, CI), dispatch the matching subagent. Hold work to the standards digest
above, and read any project-specific sections added below.

**Humans:** Use this as a quick map of the engineering conventions in play and the
assistant capabilities available. Edit anything — add build/test/run commands, domain
notes, and house rules. Your edits win; the suite will not clobber an existing file.

<!-- Project-specific notes below this line are preserved across updates. -->

## Frontend & design skills

On-demand design expertise. Invoke by name when its domain comes up; each also
auto-activates on the trigger phrases shown.

- **design:fundamentals** — Visual design fundamentals: color, typography, the 8pt
  spacing grid, layout, hierarchy, contrast, Gestalt, whitespace, visual weight —
  grounded in named primary-source principles with WCAG 2.2 AA + perf as defaults.
  Say things like *"why does this look off?"*, *"fix the spacing/hierarchy"*,
  *"pick a type scale"*, *"is this contrast accessible?"*.
- **design:ux-principles** — Usability and interaction: Nielsen's 10 heuristics, Laws
  of UX (Fitts, Hick, Doherty…), Norman's principles, applied in React/TS/Tailwind.
  Say things like *"review this UX"*, *"name this control"*, *"show or hide this?"*,
  *"why is this screen confusing/error-prone?"*.
- **design:design-systems** — Design systems, tokens, themeable/dark-mode UI, and
  accessible React components (button, dialog, menu, combobox, tabs) with shadcn/ui,
  Radix, React Aria, Tailwind, cva, Framer Motion.
  Say things like *"build a design system"*, *"define tokens"*, *"add dark mode"*,
  *"make this dialog/menu accessible"*, *"variant/state matrix for this"*.
- **design:ui-animation** — UI motion: animations, transitions, easing/duration,
  micro-interactions, hover/press feedback, modals/toasts, route transitions,
  scroll-reveal, stagger, springs, FLIP, prefers-reduced-motion, jank.
  Say things like *"animate this"*, *"make this feel smooth"*, *"easing/duration?"*,
  *"add a hover effect"*, *"this animation is janky"*.
- **design:3d-effects** — 3D/WebGL: Three.js, React Three Fiber, glTF, GLSL shaders,
  bloom/postprocessing, instancing/draw-call perf, CSS 3D transforms, tilt, parallax,
  with reduced-motion + device-capability fallbacks.
  Say things like *"add a 3D scene"*, *"load this model"*, *"write a shader"*,
  *"add a tilt/parallax effect"*, *"is this 3D too heavy?"*.
- **design:frontend-backend** — Wiring React/Next to a backend API: TanStack
  Query/SWR/RTK Query, mutations/optimistic updates, end-to-end types (tRPC,
  OpenAPI/GraphQL codegen, Zod), auth (cookies vs JWT, refresh, CSRF),
  loading/error/empty states, retries, pagination/infinite scroll, uploads, realtime,
  RSC/server actions/revalidation.
  Say things like *"fetch and cache this"*, *"optimistic update"*, *"type this API
  boundary"*, *"cookies or JWT?"*, *"add infinite scroll"*, *"wire up SSE/WebSocket"*.
- **design:frontend-architecture** — Frontend structure and perf: component/folder
  architecture, where state lives (local/lifted/URL/server/global),
  CSR/SSR/SSG/ISR/RSC/PPR, mobile-first + container queries, Core Web Vitals
  (LCP/INP/CLS), code splitting, image/font loading, hydration cost, a11y, bundle
  budgets.
  Say things like *"where should this state live?"*, *"SSR or RSC here?"*, *"fix
  LCP/INP/CLS"*, *"split this bundle"*, *"structure this Next app"*.

## Frontend & design subagents

Heavier, autonomous workers. Dispatch one for a focused job done end-to-end and
returned as a self-contained result (shipped code, cited review, or integration plan).

- **frontend-designer** — Dispatch to build or restyle a page/component, define a
  design system/tokens, or add tasteful motion from a brief. Returns shipped,
  on-brand, accessible code plus a design rationale with file:line citations.
- **ux-reviewer** — Dispatch to audit a UI/screen/flow against usability heuristics,
  WCAG 2.2 AA, and visual-design fundamentals. Read-only. Returns severity-tagged
  findings with file:line and concrete fixes.
- **frontend-integration-engineer** — Dispatch to wire a frontend to its backend: data
  fetching, caching, mutations/optimistic updates, auth/session, realtime, end-to-end
  types, and loading/error/empty/offline states. Returns a file:line-cited integration
  plan plus minimal, verified edits.
- **motion-engineer** — Dispatch to implement UI animations and 3D/WebGL effects
  (Framer Motion, R3F/Three.js, scroll-driven, shaders). Returns working
  animation/3D code with reduced-motion + perf guardrails and a verification log.

## Design & frontend standards (digest)

Concrete, checkable cross-cutting rules these design skills/subagents enforce.

### Accessibility (WCAG 2.2 AA)
- Every interactive element is keyboard-operable, has a visible focus ring (never
  `outline: none` without a replacement), and a programmatic accessible name.
- Text contrast ≥ 4.5:1 (≥ 3:1 for large text and UI/graphical boundaries); never
  encode meaning with color alone.
- Respect `prefers-reduced-motion`: gate non-essential motion, parallax, and 3D behind
  it and provide a static/cross-fade fallback.
- Manage focus on route/modal change: trap focus in dialogs, return it to the trigger
  on close, and keep a logical DOM/tab order.
- Use semantic HTML first; reach for ARIA only to fill gaps, and prefer accessible
  primitives (Radix/React Aria) over hand-rolled widgets.

### Visual design
- Spacing, sizing, and radii come from an 8pt grid (4pt for fine adjustments) via
  tokens — no arbitrary magic pixel values.
- Type uses a defined modular scale with line-height ~1.4–1.6 for body and measure
  ~45–75 characters; don't ship more than ~2 font families.
- Establish one clear visual hierarchy per screen (size, weight, color, position); one
  primary action per view.
- Color, typography, spacing, radii, shadow, and z-index are design tokens — themeable
  and dark-mode-ready — not values scattered across components.

### Motion
- Animate only `transform` and `opacity` on hot paths; avoid animating layout
  properties (width/height/top/left) that trigger reflow.
- UI transition durations stay ~150–300ms with intentional easing (ease-out for
  enter, ease-in for exit); reserve springs for physical/draggable interactions.
- Motion has a job — guide attention, show continuity, give feedback — never decorate
  for its own sake; keep the Doherty threshold (<400ms) for feedback.
- Animated entrances must not cause layout shift; reserve space so motion never moves
  CLS.

### Performance (Core Web Vitals)
- Targets: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 (field/p75).
- Reserve dimensions for images, media, and ad/embeds (width/height or aspect-ratio)
  to keep CLS ~0; lazy-load below-the-fold images, eager-load the LCP image.
- Ship modern image formats (AVIF/WebP) with responsive `srcset`; self-host fonts with
  `font-display: swap` and preload the critical font.
- Code-split by route and lazy-load heavy/below-the-fold components; keep an enforced
  bundle budget and avoid shipping a 3D/animation library to routes that don't use it.
- Keep the main thread free for INP: break up long tasks, debounce expensive handlers,
  and avoid unnecessary hydration.

### Data & integration
- Server state (fetched/cached data) lives in a query cache (TanStack Query/SWR/RTK
  Query), not in `useState`/global store; client state stays local/lifted/URL.
- Every async surface handles all four states explicitly: loading (skeleton), error
  (with retry), empty, and success — never just the happy path.
- The API boundary is end-to-end type-safe (tRPC, OpenAPI/GraphQL codegen, or Zod-
  validated) and runtime-validated at the edge; no `any` across the wire.
- Mutations are optimistic where it helps, with rollback on error and cache
  invalidation/revalidation on settle; retries use backoff and are idempotent-safe.
- Auth tokens live in httpOnly cookies (with CSRF protection) by default; never persist
  secrets/JWTs in `localStorage`.

### 3D & when not to
- Reach for 3D/WebGL only when it carries real product value; otherwise prefer CSS/SVG.
  Gate it behind device-capability and reduced-motion checks with a 2D fallback.
- Budget draw calls: instance repeated geometry, reuse materials, dispose
  geometries/textures/render targets, and cap devicePixelRatio.
- Lazy-load the 3D bundle and pause the render loop when the canvas is offscreen or the
  tab is hidden.

### Responsive & structure
- Design mobile-first; use container queries for component-level responsiveness and a
  small set of named breakpoints, not ad-hoc pixel checks.
- Co-locate components with their styles/tests/stories; choose the rendering strategy
  (CSR/SSR/SSG/ISR/RSC/PPR) per route by its data freshness and SEO needs, and justify
  it.

## Commands
- `/design-audit [path]` — audits a UI / component / frontend dir across UX (Nielsen + Laws of UX), accessibility (WCAG 2.2 AA), visual design, motion & performance (Core Web Vitals), and data/loading states. Fans out parallel reviewers, verifies each finding, and returns a severity-ranked, file:line-cited, scored report (`design-audit-report.md`). Read-only — fixes are a separate step.
