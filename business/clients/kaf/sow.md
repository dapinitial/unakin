# Statement of Work — {{client.project}}

> ⚖️ **DRAFT for attorney review.** Attaches to and is governed by the Master Services Agreement between the Parties.

**SOW #:** [001] · **Date:** {{today}}
**Client:** {{client.legalName}} ({{client.contact}}, {{client.contactTitle}})
**Studio:** {{studio.legalName}} · {{studio.email}}
**Engagement class:** {{client.class}}

---

## 1. Overview
[1–2 sentences describing the project and its goal.]

## 2. Scope & deliverables
| # | Deliverable | Acceptance criteria |
|---|---|---|
| 1 | [Deliverable] | [How Client confirms it's done] |
| 2 | [Deliverable] | [Criteria] |
| 3 | **Go-live** — deployed to {{client.shortName}}-owned accounts, runbook, walkthrough | Solution live on Client infra; runbook delivered |

## 3. Out of scope
- [Anything explicitly excluded — prevents scope creep. Additions go through a Change Order.]

## 4. Schedule & milestones
| Milestone | Target | Payment |
|---|---|---|
| M0 — Signature & deposit | On signing | {{rates.depositPct}}% deposit |
| M1 — [Milestone] | [Date / week] | [%] |
| M2 — [Milestone] | [Date / week] | [%] |
| M3 — Final acceptance & go-live | [Date / week] | Balance |

_[Or: milestone-driven with no fixed dates — choose one.]_

## 5. Fees
| Line | Rack | This engagement |
|---|---|---|
| [Core scope] | $[RACK] | |
| [Optional module] | $[RACK] | |
| **Subtotal (rack)** | **$[RACK TOTAL]** | |
| {{client.class}} courtesy | | –$[ COURTESY ] |
| **Total** | | **$[ FINAL ]** |

- **Deposit:** {{rates.depositPct}}% of Total on signature.
- **Terms:** Net {{rates.paymentTermsDays}}; {{rates.lateFeeMonthlyPct}}%/mo on overdue. Billed by {{studio.legalName}}.
- Pricing is [fixed-price for the scope above] / [time & materials at rate card with a not-to-exceed cap of $[CAP]].

## 6. Hosting, license & continuity
- **Infrastructure:** deployed to **{{client.shortName}}-owned** accounts ([Supabase / DigitalOcean / other]), billed to Client. Client controls credentials and owns its data.
- **License:** per MSA §4 — {{studio.dba}} retains the source and reusable engine; Client receives a **perpetual, non-exclusive license** to run the delivered solution.
- **Continuity:** Client may keep running the delivered build on its own accounts. Transition assistance: [scope]. Source escrow: [yes / no].

## 7. Managed care  _(optional)_
[Include or omit] Monthly care at $[RATE]/mo: {{studio.dba}} deploys and operates the solution, applies updates and patches, and includes [N] change hours/mo with [response time] priority support. Month-to-month; either Party may cancel on [15] days' notice.

## 8. Client responsibilities & assumptions
- Timely feedback and approvals (within [3] business days), a single point of contact ({{client.contact}}), and access to needed accounts and assets.
- [Other assumptions the estimate depends on.]

## 9. Changes
Scope changes are handled via a signed **Change Order** referencing this SOW.

---

## Signatures

**{{studio.legalName}}** — By: __________________  {{studio.signatory}}, {{studio.signatoryTitle}}  Date: ______

**{{client.legalName}}** — By: __________________  {{client.contact}}, {{client.contactTitle}}  Date: ______

---

_⚖️ Review scope, acceptance criteria, fees, and §6 license/continuity with counsel before signature._
