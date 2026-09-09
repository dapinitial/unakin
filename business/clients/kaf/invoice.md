# Invoice

| | |
|---|---|
| **Invoice #** | [YYYY]-[CLIENT]-[NN] |
| **Date** | {{today}} |
| **Due** | Net {{rates.paymentTermsDays}} — by [DUE DATE] |
| **Type** | [ Deposit / Milestone / Final ] |

**From**
{{studio.legalName}}
{{studio.address}}
{{studio.email}}
{{studio.einNote}}

**Bill to**
{{client.legalName}}
Attn: {{client.contact}}
{{client.email}}

---

## Summary

| Description | Amount |
|---|---|
| [Line item — e.g. "{{client.project}} — Deposit ({{rates.depositPct}}%)"] | $[AMOUNT] |
| [Line item] | $[AMOUNT] |
| {{client.class}} courtesy _(if shown)_ | –$[COURTESY] |
| **Subtotal** | **$[SUBTOTAL]** |
| Tax [if applicable] | $[TAX] |
| **Amount due** | **$[TOTAL DUE]** |

_Reference: SOW #[001], [milestone].`_

---

## Payment

- **Card / bank (recommended):** pay securely via Stripe → **[STRIPE PAYMENT LINK]**
- **ACH / wire:** [bank details on request]
- Terms: **Net {{rates.paymentTermsDays}}**. Overdue balances accrue **{{rates.lateFeeMonthlyPct}}%/mo**.
- Please reference the invoice number with payment. Questions: {{studio.email}}.

Thank you — {{studio.dba}}.

---

_Generated from the {{studio.dba}} toolkit. Confirm revenue recognition, deposit handling, and sales-tax treatment with a CPA._
