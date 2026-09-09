# Unakin.com — Marketing + Client-Intake Site (build brief)

Rebuild this repo as Unakin's high-fidelity, SEO-first marketing site with a client-intake
pipeline that feeds the portal. Read this, then propose a Phase-1 plan before building.

## Who we are
Unakin, LLC — an avant-garde **design & engineering studio** (entity-first brand; contact
**hello@unakin.com**; a senior team with 20 years at Apple & Microsoft, award-winning —
keep the pedigree **name-free**, no personal name in marketing copy). Premium positioning;
never appear to undersell. Showcases: **Sedulous** (tactical-athlete readiness), **d-tours**,
and an **immersive 3D trail/terrain fly-by** (brand-safe — never say "panogram").

## Current state (read first, preserve the good parts)
Vite + vanilla TypeScript Web Components: a coming-soon splash with a **Three.js heart-model**,
a **gooey metaball gradient-blob**, **GSAP**, and a waitlist form (`src/main.ts`,
`src/components/*`, `src/styles.css`, `index.html`). **Port** the 3D + gradient + motion into
the new build — don't discard them.

## Sister app (read for patterns + SHARED infra)
`~/Sites/unakin-portal` — the live client portal: **Astro SSR (@astrojs/node) + Supabase
(project ref `zvsdawsckzupjvcoicby`) + DO App Platform**. Reuse its Supabase client setup and
design tokens; study its `accounts` / `documents` schema. The marketing site **shares that
Supabase project.**

## Goal
Cohesive, fast, avant-garde site that (1) positions the studio, (2) showcases work with
tasteful WebGL/3D + live demos, and (3) converts prospects via an intake form that creates a
**reviewable lead in the portal**.

## Decisions (already made — don't re-litigate)
- **Astro** (SSR via `@astrojs/node`, matching the portal) for SEO. Heavy 3D as
  `client:visible` / `client:idle` islands only.
- **Design system** carries the house language (see tokens below): Fraunces + IBM Plex Mono;
  dark violet/mint palette; gooey metaball gradient; glass surfaces; "Encrypted via Proton"
  ethos. Cohesive with the portal.
- **Intake pipeline:** public form INSERTs a `leads` row into the shared Supabase (RLS: anon
  **INSERT-only, zero read**). Owner reviews leads in the portal; converting a lead stamps a
  client account + a **Claude-DRAFTED initial proposal/scope** to revise & publish. **Never
  auto-provision full accounts to strangers — owner approves.** Spam protection (honeypot +
  rate limit; Turnstile if easy); require a valid email.

## Scope / phases
- **Phase 1 (ship first):** Astro shell; SEO baseline (semantic HTML, meta/OG/Twitter,
  JSON-LD ProfessionalService/Organization, sitemap, robots, fast LCP); hero (port the
  3D/gradient island) + positioning + services/how-we-work + a REAL intake form wired to
  Supabase.
- **Phase 2:** work/demos gallery + case-study pages; WebGL/3D showcase pieces (Meshy/Blender
  GLTF); the immersive trail fly-by teaser (brand-safe).
- **Phase 3:** Claude-drafted plan pipeline (lead description → draft proposal in the portal)
  + deeper onboarding handoff.

## Quality bar / guardrails
- **Avant-garde but FAST.** Every 3D island: lazy, static poster fallback, mobile-lite path,
  `prefers-reduced-motion` respected. Do not regress Core Web Vitals for effects. Accessible:
  focus states, contrast, keyboard, semantic landmarks.
- Motion via GSAP — tasteful and orchestrated, not scattered. (`animate` / `spacelab-styles`
  skills available.)
- **Copy must be concrete, not hollow buzzwords** — earn every claim with specifics.
- Secrets in env. Do NOT modify the portal or its Supabase schema destructively; `leads` is
  additive with tight RLS.

## Design tokens (house system — match the portal)
```css
:root{
  --bg-1:rgb(8,10,15); --bg-2:rgb(0,17,32);
  --panel:#0d1220; --panel-2:#121a2c; --border:rgba(188,192,255,.14);
  --text:#f4f5fb; --muted:#9a9fc4;
  --accent:#bcc0ff; --violet:#6d4aff; --mint:#8bf0cf; --amber:#f0d68b; --red:#fb7185;
  --mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
}
/* Display: Fraunces (opsz). Body: system-ui. Mono/labels: IBM Plex Mono.
   Ground gradient: radial violet + accent washes over linear bg-1→bg-2.
   Headings: gradient-clipped text (#fff → --accent → --violet). */
```
Fonts: `Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400` + `IBM+Plex+Mono:400;500`.
Copy the Supabase server/admin client + auth patterns from `~/Sites/unakin-portal/src/lib/`.

## Deploy
DO App Platform, domain **unakin.com**. Repo + DO now live under the **business** account
(`officiallyunakin` GitHub + the `unakin-com` DO app) — see repo migration notes. The rebuild
only needs to update the **build command/output** to Astro (`npm run build` →
`node dist/server/entry.mjs`), not re-point the source.

## Start by
Reading this repo + the portal, then propose a concrete Phase-1 plan (routes, components, the
`leads` schema + RLS, the intake API, SEO checklist, and how the ported 3D island loads)
BEFORE building. Then build Phase 1 and deploy a preview.
