# Product-ID & plan-ID mapping (MAP)

### MAP-001 — Identity rules
- source: [KB page of record §Identity rules](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

`service_code` identifies the service family; `plan_id` identifies the recurring plan variant; neither is a provider SKU or a price. Use monthly/yearly suffixes only where the plan catalog confirms them — never derive a suffix from a display name. `feature-*` rows are child add-ons and retain parent UUID, covered device, source, and binding state.

### MAP-002 — Apple product-ID → plan_id
- source: [Third-party Plan Code & Membership Plan ID Mapping](https://wyzelabs.atlassian.net/wiki/spaces/TECH/pages/2156331054)
- refs: V-23 (only 1–3 quantity SKUs purchasable today; 4–9/99 presumed legacy)

| Apple product ID | plan_id | Product / quantity |
|---|---|---|
| `10001–10009`, `10099` | `cam-plus-monthly` | T1 monthly, 1–9 devices / 99 unlimited bucket |
| `20001–20009`, `20099` | `cam-plus-yearly` | T1 annual, 1–9 devices / 99 unlimited bucket |
| `40001–40005` | `cam-plus-pro-monthly` | CPT monthly, 1–5 devices |
| `50001–50005` | `cam-plus-pro-yearly` | CPT annual, 1–5 devices |
| `69999` | `cam-unlimited-monthly` | T2 monthly |
| `79999` | `cam-unlimited-yearly` | T2 annual |
| `11001` | `cam-ultimate-monthly` | T3 monthly |
| `21001` | `cam-ultimate-yearly` | T3 annual |

### MAP-003 — Google product-ID → plan_id
- source: [Third-party Plan Code & Membership Plan ID Mapping](https://wyzelabs.atlassian.net/wiki/spaces/TECH/pages/2156331054)
- refs: V-17 (T2 IDs look like placeholders), V-23

| Google product ID | plan_id | Product / quantity |
|---|---|---|
| `1001–1009`, `1099` | `cam-plus-monthly` | T1 monthly, 1–9 devices / 99 unlimited bucket |
| `2001–2009`, `2099` | `cam-plus-yearly` | T1 annual, 1–9 devices / 99 unlimited bucket |
| `3001–3005` | `cam-plus-pro-monthly` | CPT monthly, 1–5 devices |
| `4001–4005` | `cam-plus-pro-yearly` | CPT annual, 1–5 devices |
| `1234567890123` | `cam-unlimited-monthly` | T2 monthly |
| `1234567890124` | `cam-unlimited-yearly` | T2 annual |
| `6001` | `cam-ultimate-monthly` | T3 monthly |
| `7001` | `cam-ultimate-yearly` | T3 annual |

### MAP-004 — Trial/discount product-ID variants
- source: [Third-party Plan Code & Membership Plan ID Mapping](https://wyzelabs.atlassian.net/wiki/spaces/TECH/pages/2156331054)

Google `f*` (free-trial) and `d*` (discount) product-ID variants resolve to the corresponding base Cam Plus monthly/yearly `plan_id` — never new plan families.

### MAP-005 — No store IDs for HMS, CPL, add-ons
- source: [KB page of record §product-ID mapping](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

HMS, CPL, and the current add-ons have NO Apple/Google product IDs in the canonical mapping table — never infer them from display names.

### MAP-006 — Base-plan plan_id reference
- source: [KB page of record §Base-plan plan_id reference](https://wyzelabs.atlassian.net/wiki/spaces/PMT/pages/4516053040)

T1 `cam-plus` → `cam-plus-monthly`/`-yearly`; T2 `cam-unlimited` → `cam-unlimited-monthly`/`-yearly`; T3 `cam-ultimate` → `cam-ultimate-monthly`/`-yearly`; CPT `cam-plus-pro` → `cam-plus-pro-monthly`/`-yearly`; HMS `hms` (plan IDs per TIER-008); CPL `edge_ai`/legacy mapping, account-specific. Prices per PRICE-005 (the $3.99 T3 cell once shown in the Confluence reference table was a confirmed copy error).
