# Unakin business toolkit

The document + pricing system for **Unakin, LLC** as an operating studio.
This folder is self-contained and does **not** affect the unakin.com site build.
It's also the foundation for the client portal — `variables.json` is the seed data model.

## The engagement pipeline

```
   onboard              tailor              review            send → sign → pay
┌───────────┐      ┌─────────────┐     ┌───────────┐        ┌──────────────────┐
│new-client │  →   │variables.json│  →  │ build.mjs │   →    │ PDF · e-sign ·   │
│  .mjs     │      │  + [BRACKETS]│     │ serve.mjs │        │ Stripe           │
└───────────┘      └─────────────┘     └───────────┘        └──────────────────┘
```

## Layout

```
business/
├─ variables.json        ← SINGLE SOURCE OF TRUTH. Entity, rates, classes, clients.
├─ new-client.mjs        ← onboard a client: register + stamp base package
├─ build.mjs             ← generator (zero deps): fills {{tokens}} → dist/
├─ serve.mjs             ← local styled preview (http://localhost:4455)
├─ templates/
│  ├─ rate-card.md       ← studio-wide (rendered as-is)
│  └─ package/           ← per-client base docs (proposal, msa, sow, invoice)
├─ clients/<slug>/       ← each client's tailored copies
└─ dist/                 ← GENERATED, ready-to-send docs (git-ignored)
```

## Onboard a new client

```sh
node business/new-client.mjs "kaf adventures" \
     --contact "Mick" --email mick@kafadventures.com \
     --class player --project "Immersive 3D Trail Fly-By"
```

Registers the client in `variables.json` and stamps their base package into `clients/<slug>/`.
Then: tailor → build → review → send.

## Edit once, regenerate everything

1. Edit `variables.json` (rates, a client's details) and the `[BRACKETS]` in the client's docs.
2. `node business/build.mjs`  → fills every `{{token}}` into `dist/`.
3. `node business/serve.mjs`  → preview + Print-to-PDF at http://localhost:4455.

**Two kinds of blanks:**
- `{{tokens}}` — auto-filled from `variables.json`. `{{client.*}}` binds to the folder under `clients/`. Never hand-edit; change the value and rerun.
- `[BRACKETS]` — intentionally bespoke per engagement (a courtesy figure, a milestone date). Fill by hand.

## What's here

| Doc / tool | Status |
|---|---|
| Rate card & engagement terms (class matrix) | ✅ |
| Onboarding command (`new-client.mjs`) | ✅ |
| Proposal (base + kaf tailored) | ✅ |
| Master Services Agreement (owns-source / licensed-solution IP model) | ✅ |
| Statement of Work | ✅ |
| Invoice (deposit / milestone / final, Stripe-ready) | ✅ |
| Change Order | ⏳ |
| Managed-care agreement | ⏳ |
| Go-live / deployment checklist + W-9 note | ⏳ |
| e-signature (Dropbox Sign / DocuSign) | tooling — Phase 2 |
| Stripe payments/invoicing | tooling — Phase 2 |
| Branded client + admin portal (Astro + Supabase + Stripe) | Phase 3 |

## ⚠️ Professional review

Every legal/financial doc here is a **draft for professional review**. David Puerto is not an attorney or CPA and neither is the tool that drafted these. Before signing or sending anything binding:
- **Attorney:** MSA §4 (IP/license), §7 (liability cap), SOW scope/acceptance, warranty/indemnity, governing law.
- **CPA:** barter/trade treatment, deposit & revenue recognition, W-9/1099, sales-tax nexus as you go global.
