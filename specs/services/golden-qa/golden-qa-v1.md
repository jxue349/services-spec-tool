# Golden QA v1 — regression set

Owner-verified by Jing Xue, 2026-10-22 (31 questions). Each entry lists the expected
rule IDs; an answer is correct when it matches those rules and caveats any rule that
carries an open register ref. Full original answer text lives with the owner; the
`expect` lines are the testable core.

### Q1 — Add-on behavior when the parent expires / cancels / enters grace / renews
- rules: ADDON-013, LIFE-014
- expect: no purchase on expired/expiring parent; canceled parent → add-ons don't renew; date alignment per LIFE-014 (free parent extension when the child ends later; child never extended); grace = platform dunning, do nothing; same-platform downgrade/qty reduction ≠ terminal.

### Q2 — Duplicate / cross-platform parents when buying add-ons
- rules: ADDON-014, DUP-001…004
- expect: cross-platform parents → app routes to website; web processes separate API calls per parent, presented as one transaction.

### Q3 — When can an add-on float or move between devices?
- rules: ENT-007, ENT-011, ADDON-012; caveat V-25
- expect: no independent rebind; parent move carries children atomically; device deletion → floating; self-serve rebind is P1; renewal treatment of floating add-ons is unreconciled (V-25).

### Q4 — App-version gating of add-on entry points
- rules: ADDON-015
- expect: Pro AI + Cloud CVR need app ≥3.23 (released 2026-09-30) + full-release switch; below/unparseable/web → Cloud 60 only; switch off → whitelist; Cloud 60 via Firebase remote config.

### Q5 — Device eligibility stays aligned with product configuration
- rules: ADDON-016, ADDON-018, FEAT-004
- expect: server-driven; model + tier + parent in RENEW; exclude owned; Stripe catalog for price and ordering; matrix for model support.

### Q6 — App-version and firmware gating
- rules: ADDON-015, ADDON-018
- expect: 3.23 gate for Pro AI/Cloud CVR, not Cloud 60; Cloud CVR per-model minimum firmware from config; no universal firmware cutoff.

### Q7 — CPT + HMS coexistence; Noonlight; T3 monitoring
- rules: MON-001, MON-004, MON-005; caveat V-06
- expect: no coexistence (shared Monitoring tab); CPT = cameras + video verification; HMS = sensors; T3 = manual emergency button only, no video verification.

### Q8 — Cloud CVR after T1 moves away
- rules: ADDON-019
- expect: CVR needs active T1 association + add-on; timeline shows a gap, never continuous recording.

### Q9 — Service page with multiple licenses in different states
- rules: SURF-007
- expect: same-tier merge into one card; platform pills; expiration inline on manage; non-current platform → read-only + "expires at {date}" + route to owning channel.

### Q10 — Cloud CVR replay window
- rules: ADDON-019
- expect: 7-day replay/retention.

### Q11 — Cross-store upgrades
- rules: LIFE-019
- expect: no cross-store management; stores manageable without the app; website can cancel Google Play but not Apple.

### Q12 — Cloud 60 messaging for T3; Pro-AI page "Add Cam Plus"
- rules: ADDON-011, ADDON-003, SURF-008
- expect: Cloud 60 included with T3, never sold to T3; floating T1 → binding takes priority; otherwise purchase.

### Q13 — Reactivation after cancellation
- rules: LIFE-017
- expect: child keeps access through paid term; non-expired → reactivate, expired → repurchase; parent Reactivate button only within 31 days before expiration.

### Q14 — Pro AI model support
- rules: ADDON-018
- expect: all models except Cam V1, Window Bird Cam, WCO v1/v2, Doorbell v1.

### Q15 — Cloud 60 model support
- rules: ADDON-018
- expect: same exclusion list as Pro AI.

### Q16 — Cloud CVR model support
- rules: ADDON-018
- expect: Cam V3, Pan V3, Cam V4 (as of 2026-10-22).

### Q17 — Add-on free trials
- rules: ADDON-017
- expect: none; parent must be in its paid period.

### Q18 — Subscription free trials
- rules: TRIAL-001, TRIAL-002, TRIAL-003; caveat V-27
- expect: opt-out 1-month IAP intro offers; iOS shared subscription group = no new trial on upgrade; Google upgrade = new subscriber + 30-day trial; web 30-day trial since Stripe; T3 opt-in experiment ended.

### Q19 — Involuntary churn
- rules: LIFE-018
- expect: native store dunning; 30-day grace everywhere; Butter improves Stripe retries.

### Q20 — CPL cost
- rules: LEGACY-005, PRICE-005
- expect: pay-as-you-want; majority $0; paying customers average ~$1.50.

### Q21 — What is Wyze Stories?
- rules: FEAT-008, FEAT-011, FEAT-003, ADDON-004
- expect: AI groups related events into one story + grouped notification; evolution of Descriptive Alerts; in T3, or via Pro AI on eligible T1/T2 cameras.

### Q22 — Stories notification mechanics
- rules: FEAT-011
- expect: per-clip evaluation; 20-min idle close; 4-hour/50-clip caps; 120-min window = legacy grouping; importance 1–5 with floors All=1 / High=3 / internal=4; story-ID push updates; filtering never deletes recordings.

### Q23 — Importance/Stories vs device notification settings
- rules: FEAT-012
- expect: legacy settings behavior; Stories on + importance off → motion notification first, then updates; defaults enabled on subscription purchase.

### Q24 — Friendly Faces quota
- rules: FEAT-013
- expect: 10 named profiles per account across Family/Others; unknown faces don't count.

### Q25 — Does Cam Plus include Friendly Faces?
- rules: FEAT-001, FEAT-002
- expect: no — T2 and above.

### Q26 — Website upgrade/downgrade
- rules: LIFE-015 (CURRENT web), LIFE-010, LIFE-013
- expect: Stripe processes; upgrade immediate with credit; downgrade immediate prorated credit or scheduled EOC; website changes never cancel Apple/Google subscriptions.

### Q27 — Two Cam Unlimited plans visible
- rules: DUP-001, DUP-003, DUP-006, DUP-005
- expect: usually two real subscriptions across sources; sometimes a canceled plan running out its term; diagnose via source/status/renewal; cancel the redundant one via its owning source; use approved "Savings tip" copy.

### Q28 — Cam Plus and Cam Unlimited both visible
- rules: DUP-006, PROMO-002
- expect: different channels (e.g., IAP + website promo); coupon redemption doesn't check current subscription status.

### Q29 — Customer can't see their subscription in the app
- rules: TSHOOT-001, TSHOOT-005
- expect: wrong account / unlinked store purchase → support; unassigned → edit covered cameras; not visible → per-camera service reset.

### Q30 — Promotion offers in the app
- rules: TRIAL-001, PROMO-001; caveat V-26
- expect: 1-month IAP intro trials; churned-user offers: 50% off CP ×3mo, $5 off CP next year (→$10 after 3.26 in Nov), 50% off CU ×3mo, $10 off CU next year.

### Q31 — Why prices differ across Native IAP / Stripe IAP / Web Stripe
- rules: PRICE-009, PRICE-005, PRICE-007
- expect: three channels, three prices; Stripe IAP = 15% off standard IAP first year, then standard IAP at renewal; web renews at web price unless promo/price change.
