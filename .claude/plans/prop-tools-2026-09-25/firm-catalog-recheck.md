# Firm catalog and live-trigger recheck (PT-71, R-V4 and R-V5)

Date: 2026-09-26

## Method

Every row comes from the firm's own pages only: its marketing site, its help center (including the Intercom or Zendesk host that serves the same articles), its public checkout or pricing APIs, and its terms. Third-party review sites, cached skill docs and memory were not used. One researcher per firm fetched the pages with curl (WebFetch where noted) and filled both tables. A separate verifier per firm then re-fetched the rows independently and gave each a verdict (agree, disagree, could-not-fetch). The Verifier column below records that verdict and the verifier's fetch time. Rows with status `reused-2026-09-26` reuse a PT-35 step 0 row from `firm-policy-recheck.md` that was fetched and verified earlier the same day. Those rows were allowed to skip a fresh fetch; the Verifier column says whether one was done anyway. No browser automation was used and no login wall was bypassed. Quotes are verbatim; `[dash]` stands for a dash character on the source page, and `[...]` marks an elision.

Status values: `confirmed` (quote read today on a firm page), `conflict` (two firm pages disagree, both quoted), `needs-paste` (page blocked, user paste required), `not-found` (no firm page confirms the item is sold), `reused-2026-09-26` (PT-35 step 0 row).

Engine sizes: every firm in the engine models the 50K size only (each firm's `*AccountSize` type in `core/PlanId.ts` is `50_000`).

---

## Apex Trader Funding

Every Apex page except robots.txt returned a Cloudflare 403 on 2026-09-26 (researcher 15:44 UTC, verifier 15:45 UTC). R-V4 cannot list what Apex sells today. The engine's Apex prices rest only on the 2026-09-23 user paste of the homepage product picker.

### R-V4 catalog

| Plan | Size | Sold today | Engine PlanId | Price or fee | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|---|---|
| EOD Trailing Drawdown Evaluation to PA | not retrieved; engine 50K only | unclear | `apex-50000-eod` for 50K; other sizes not modeled | not retrieved; engine $590 eval / $90 PA activation from the 2026-09-23 paste, not live-verified | needs-paste | none (live fetch blocked) | https://apextraderfunding.com/ ; https://apextraderfunding.com/pricing/ ; https://apextraderfunding.com/help-center/billing/evaluation-plan-fees-and-access-explained/ | 2026-09-26 15:44 UTC, HTTP 403 (cf-ray a41363d19dcc1c89-AMS, a41363d21d5506c8-AMS, a41363d4094d7748-AMS; WebFetch 403) | could-not-fetch, 15:45 UTC, same 403s (cf-ray a41365282c7566c2-AMS, a4136528bfd966f3-AMS, a41365292f58f546-AMS) |
| Intraday Trailing Drawdown Evaluation to PA | not retrieved; engine 50K only | unclear | `apex-50000-intraday` for 50K; other sizes not modeled | not retrieved; engine $249 eval / $59 PA activation from the 2026-09-23 paste, not live-verified | needs-paste | none (live fetch blocked) | same three URLs | 2026-09-26 15:44 UTC, HTTP 403 | could-not-fetch, 15:45 UTC, HTTP 403 |
| 5-Pack Evaluation Bundles (EOD, Intraday, No Activation Fee) and the Legacy subscription line | not retrieved; engine notes (2026-09-23 paste, not a source) list 25K, 50K, 100K, 150K | unclear | not modeled: bundles and Legacy are not engine plans; non-50K sizes not modeled | not retrieved | needs-paste | none (live fetch blocked) | https://apextraderfunding.com/ | 2026-09-26 15:44 UTC, HTTP 403 (cf-ray a41363d19dcc1c89-AMS) | could-not-fetch, 15:45 UTC, HTTP 403 |
| Second Chance Eval-to-Live (requalification after a live bust) | not stated | unclear | not modeled: post-bust requalification, not a sold eval | $199 per attempt (PT-35 row, from the 2026-09-23 paste) | needs-paste | "Price \| $199, whether it is the first attempt or third attempt." | https://apextraderfunding.com/help-center/getting-started/apex-live-prop-trading-program-faq/ | PT-35 row 2026-09-26 10:51 UTC (paste); re-probed 15:44 UTC HTTP 403 (cf-ray a41363d39eb55d56-AMS) | could-not-fetch, 15:45 UTC (cf-ray a413652979b555e3-AMS); quote matches PT-35 line 1395 verbatim but rests on the paste |

### R-V5 live triggers

| Plan | Trigger | Kind | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|
| 50K EOD PA (`apex-50000-eod`) to Apex Live | No count or balance trigger. Move to live is at Apex's discretion; three consecutive withdrawals from one PA is a monitoring guideline only | discretionary | reused-2026-09-26 | "Is moving to live trading automatic? No. Apex reserves the right to move a trader out of the simulated environment and into the live environment at any time. [...]" / "Three consecutive withdrawals from one single Simulated PA account." / "These are monitoring guidelines, not automatic qualification rules." | https://apextraderfunding.com/help-center/getting-started/apex-live-prop-trading-program-faq/ | PT-35 row 2026-09-26 10:51 UTC (firm-policy-recheck.md line 1392; live 403, quote from 2026-09-23 paste, page dateModified 2026-06-30); re-probed 15:44 UTC HTTP 403 | agree against PT-35 line 1392; live page still 403 at 15:45 UTC, so the paste is not confirmed current |
| 50K Intraday PA (`apex-50000-intraday`) to Apex Live | Same discretionary rule as the EOD PA | discretionary | reused-2026-09-26 | same quotes as the EOD row | same URL | same as the EOD row | agree against PT-35 line 1392; same caveat |
| Apex Live (`buildApexLivePlan`) | End of path, no onward trigger. The $4,500 rule governs adding live accounts (up to 5) | none-published | reused-2026-09-26 | "As each new account is created, that new account must reach a profit of $4500 or more, and a trader may request another account, up to the maximum of 5 live accounts." | same URL | PT-35 rows (lines 1391, 1392), paste of 2026-09-23; re-probed 15:44 UTC HTTP 403 | agree against PT-35 line 1391 verbatim; live page 403 |

---

## Take Profit Trader (TPT)

Engine: `tpt-50000` (TakeProfitTrader.ts), live builders `buildTptLivePlan` (in `LIVE_PLAN_BUILDERS[FirmId.Tpt]`) and `buildTptLiveDevelopmentPlan` (standalone), both hardcoded to 50K figures. Sources: the public Zendesk Help Center API (HTTP 200, 88 articles, same count as PT-35) and https://takeprofittrader.com/ (HTTP 200). Every other takeprofittrader.com path, and the Zendesk article HTML, returned a Cloudflare 403. No reachable page states the monthly Test list price for any size.

### R-V4 catalog

| Plan | Size | Sold today | Engine PlanId | Price or fee | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|---|---|
| Test to PRO | 25K | yes | not modeled | monthly list price not on any reachable page; Test reset $79; PRO activation $130 one-time; PRO reset $449; target $1,500, EOD DD $1,500, 3 contracts | confirmed | "account-25k":"Test Account $25K" / "$25,000 3 Contracts $1,500 $1,500" / "25K $79" / "25k PRO Reset: $449" / "Pay a one time $130 PRO Account setup fee, and ZERO monthly fees after that." | https://takeprofittrader.com/ ; https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15169070804125-Rule-1-Hit-Your-Profit-Target ; .../15170265979165-Rule-3-Do-Not-Hit-End-Of-Day-EOD-Maximum-Trailing-Drawdown ; .../15140989806493-Resetting-Your-Test-Account ; .../15171895352733-Resetting-A-PRO-Account | 2026-09-26, homepage 200, API 200 (Rule 1 updated 2026-09-10, Rule 3 2026-08-25, Test reset 2026-05-22, PRO reset 2026-09-16) | agree, re-fetched 2026-09-26, all figures match |
| Test to PRO | 50K | yes | `tpt-50000` | monthly list price not on any reachable page (engine 170 unconfirmed); promo totals NOFEE40 $102, NOFEE50 $85; Test reset $99; PRO activation $130; PRO reset $649; target $3,000, EOD DD $2,000, 6 contracts / 60 micros (match engine) | confirmed | "$50,000 6 Contracts $3,000 $2,000" / "$50,000 6 Contracts / 60 Micros" / "50K $99" / "50k PRO Reset: $649" / "you'd be getting a $50k funded account for just $102 flat!" | same as above plus .../15169066911133-Rule-2-Do-Not-Exceed-Maximum-Position-Size ; .../29660646764445-NOFEE40-PROMO-FAQS ; .../35985020984605-NOFEE50-PROMO-FAQS | 2026-09-26, API 200 (NOFEE40/50 updated 2026-08-26, Rule 2 2026-06-07) | agree; NOFEE50 not re-fetched; monthly price stays unconfirmed |
| Test to PRO | 75K | yes | not modeled | monthly list price not reachable; Test reset $139; PRO activation $130; PRO reset $799; target $4,500, EOD DD $2,500, 9 contracts | confirmed | "account-75k":"Test Account $75K" / "$75,000 9 Contracts $4,500 $2,500" / "75K $139" / "75k PRO Reset: $799" | as 25K row | 2026-09-26, 200 | agree |
| Test to PRO | 100K | yes | not modeled | monthly list price not reachable; Test reset $169; PRO activation $130; PRO reset $999; target $6,000, EOD DD $3,000, 12 contracts | confirmed | "$100,000 12 Contracts $6,000 $3,000" / "100K $169" / "100k PRO Reset: $999" | as 25K row | 2026-09-26, 200 | agree |
| Test to PRO | 150K | yes | not modeled | monthly list price not reachable; Test reset $199; PRO activation $130; PRO reset $1499; target $9,000, EOD DD $4,500, 15 contracts | confirmed | "$150,000 15 Contracts $9,000 $4,500" / "150K $199" / "150k PRO Reset: $1499" | as 25K row | 2026-09-26, 200 | agree |
| Test monthly subscription list price | all sizes | yes | 50K: `tpt-50000` (monthlySubscription 170, unconfirmed); others not modeled | no reachable page states it; homepage price cards load from a 403 API | needs-paste | "choose-your-account-size-text-1":"Purchase the subscription that meets your needs as a Trader. " / "Your Trading Test with TakeProfitTrader is structured as a monthly subscription ." | https://takeprofittrader.com/pricing (403) ; https://takeprofittrader.com/api/subscriptions/products (403) ; https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15141145057053-Test-Subscriptions | 2026-09-26 (/pricing 403, API 403; Test Subscriptions updated 2026-08-14) | could-not-fetch; /pricing still 403, no static price in homepage HTML |
| PRO+ (standard, live) from a 50K PRO | 50K origin ($0 start, -$2,000 EOD DD) | no | live builder `buildTptLivePlan`, no PlanId | not sold: invitation only, no fee stated | confirmed | "Once a trader becomes eligible for a PRO+ upgrade, an official invitation will be sent via email [...]" / "if the PRO account was a $50,000 account, the PRO+ account would start at $0 with an EOD drawdown of -$2,000." | .../15171978600349-PRO-Account-Upgrade-Process-Overview-and-Guidelines ; .../15171929948829-Advantages-of-PRO | 2026-09-26, API 200 (updated 2026-09-01) | agree, updated_at unchanged |
| PRO+ (standard) from 25K/75K/100K/150K PRO | non-50K origin | no | not modeled: builder hardcodes the 50K $2,000 drawdown | not sold: invitation only | confirmed | "The PRO+ account will begin with a $0 balance and an initial EOD drawdown equivalent to the starting drawdown of the original PRO account." | .../15171978600349-PRO-Account-Upgrade-Process-Overview-and-Guidelines | 2026-09-26, API 200 | agree (same article) |
| PRO+ Development | 50K (2/20 contracts, $1,000 soft DLL, $1,250 EOD DD) | no | live builder `buildTptLiveDevelopmentPlan` (not in `LIVE_PLAN_BUILDERS`), no PlanId | not sold: discretionary placement | confirmed | "50K 2/20 $1,000 $1,250" / "Placement in PRO+ Development is based on a review of your overall trading performance [...]" | .../36429526878237-PRO-Development-Accounts ; .../39331980656925-PRO-Development-30-Day-Live-Capital-Cooldown | 2026-09-26, API 200 (updated 2026-09-01; cooldown 2026-09-26) | agree |
| PRO+ Development | 25K, 75K, 100K, 150K | no | not modeled: builder hardcodes 50K constants | not sold | confirmed | "25K 1/10 $500 $750 / 75K 3/30 $1,250 $1,500 / 100K 4/40 $1,500 $1,750 / 150K 5/50 $2,000 $2,250" | .../36429526878237-PRO-Development-Accounts | 2026-09-26, API 200 | agree |

### R-V5 live triggers

| Plan | Trigger | Kind | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|
| `tpt-50000` PRO to standard PRO+ (`buildTptLivePlan`) | No published threshold; invitation after holistic review. Grep of all 88 bodies found no numeric trigger | discretionary | reused-2026-09-26 | "There isn't a single threshold that determines promotion. Instead, our team reviews trader performance holistically [...]" / "the decision to upgrade a trader to a PRO+ account is made solely at the discretion of Take Profit Trader." | .../15171978600349-PRO-Account-Upgrade-Process-Overview-and-Guidelines ; .../15171929948829-Advantages-of-PRO | PT-35 row; API re-check 2026-09-26, updated_at 2026-09-01 unchanged | agree (spot-check: updated_at unchanged) |
| `tpt-50000` PRO or PRO+ to PRO+ Development | No threshold; discretionary pattern review; way back is about 60 days of disciplined risk, no profit figure | discretionary | reused-2026-09-26 | "Placement in PRO+ Development is based on a review of your overall trading performance [...]" / "We want to see roughly 60 days of consistent, disciplined risk management." / "We're not looking for a specific profit number." | .../36429526878237-PRO-Development-Accounts | PT-35 row; API re-check 2026-09-26 unchanged | agree (spot-check) |
| Passed 50K Test to PRO+ Development, cooldown traders only | Narrow route: a trader in Development cooldown can activate passed Tests into PRO+ Development | other | reused-2026-09-26 | "They can still trade any active test, PRO, or PRO+ account and can activate passed tests into PRO+ Development accounts." | .../39331980656925-PRO-Development-30-Day-Live-Capital-Cooldown | PT-35 row; API re-check updated_at 2026-09-26 unchanged | not re-fetched (cooldown article) |
| `tpt-50000` Test to PRO (context) | Not a live move: PRO is simulated. Passing (target, all rules, minimum 3 trading days, paid-up subscription) moves to PRO; only PRO to PRO+ is live | other | confirmed | "PRO accounts must access and trade on the simulated environment." / "the PRO account is practice for PRO+ when you'll trade the live market with our funds." / "if you pass the test with an overdue subscription, your account will not move to PRO until the balance is paid." | .../15172725020701-Understanding-the-Simulation-for-Your-PRO-account ; .../15141145057053-Test-Subscriptions ; verifier adds https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15170316538013 (Rule 5) for "you must trade for a minimum of 3 trading days." | 2026-09-26, API 200 (Simulation updated 2026-08-13, Test Subscriptions 2026-08-14; Rule 5 2026-09-22) | agree; the 3-day paraphrase is sourced from Rule 5, now cited |

---

## Tradeify

Sources: the pricing reference at intercom.help/tradeify (HTTP 200; the canonical help.tradeify.co host returned 403 for the same article), the homepage plan data (Last Published Fri Sep 25 2026 15:01:14 GMT) and /select-plan. The logged-in checkout was not viewed.

### R-V4 catalog

| Plan | Size | Sold today | Engine PlanId | Price or fee | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|---|---|
| Growth Evaluation | 25K | yes | not modeled | $99 one-time; reset $60 | confirmed | "Growth 25K \| $99 \| $60" / "['Reset Fee', '<strike>$70</strike> $60', { tooltip: '' }]" | https://intercom.help/tradeify/en/articles/14369021-tradeify-pricing-reference ; https://tradeify.co/ | 2026-09-26, 200 (pricing ref dateModified 2026-09-01) | agree |
| Growth Evaluation | 50K | yes | `tradeify-50000-growth` (evalCost 145, resetFee 95 match) | $145; reset $95 | confirmed | "Growth 50K \| $145 \| $95" / "name: '50K', [...] price: 145, [...] ['Reset Fee', '$95', { tooltip: '' }]" | same | 2026-09-26, 200 | agree (engine match not re-checked by verifier) |
| Growth Evaluation | 100K | yes | not modeled | $255; reset $155 (pricing ref) vs $169 (homepage, /select-plan) | conflict | "Growth 100K \| $255 \| $155" VERSUS "name: '100K', [...] price: 255 [...] ['Reset Fee', '$169', { tooltip: '' }]" | same plus https://tradeify.co/select-plan | 2026-09-26, 200 | agree, conflict is real |
| Growth Evaluation | 150K | yes | not modeled | $369; reset $215 (pricing ref) vs $229 (homepage, /select-plan) | conflict | "Growth 150K \| $369 \| $215" VERSUS "['Reset Fee', '$229', { tooltip: '' }]" | same | 2026-09-26, 200 | agree, conflict is real |
| Select Evaluation | 25K | yes | not modeled | $109; reset $75 (/select-plan shows older $65) | confirmed | "Select 25K \| $109 \| $75" / "['Reset Fee', '$75', { tooltip: 'Allowed up to 10 resets per month' }]" | pricing ref ; https://tradeify.co/ | 2026-09-26, 200 | agree |
| Select Evaluation | 50K | yes | `tradeify-50000-select-daily` and `tradeify-50000-select-flex` (evalCost 165, SELECT_RESET_FEE 109 match) | $165; reset $109 (/select-plan still $99, stale) | confirmed | "Select 50K \| $165 \| $109" / "Pass the evaluation and choose between Select Daily or Select Flex payout paths." | pricing ref ; homepage ; /select-plan | 2026-09-26, 200 | agree |
| Select Evaluation | 100K | yes | not modeled | $265; reset $169 | confirmed | "Select 100K \| $265 \| $169" | pricing ref ; homepage | 2026-09-26, 200 | agree |
| Select Evaluation | 150K | yes | not modeled | $369; reset $239 | confirmed | "Select 150K \| $369 \| $239" | pricing ref ; homepage | 2026-09-26, 200 | agree |
| Select Evaluation 300K (limited release, no resets) | 300K | unclear | not modeled | $349 (V2, 300K article) vs $449 (pricing ref, homepage hidden entry) | conflict | "Select 300K V2 (current): $349 evaluation, $8,000 maximum loss limit, $4,000 daily loss limit. This is the version on sale now." VERSUS "Select 300K (limited release) \| $449 \| Not available" / "const is300visible = false;" | https://intercom.help/tradeify/en/articles/16497699-300k-select-account ; pricing ref ; homepage | 2026-09-26, 200 (300K article dateModified 2026-08-28) | agree; verifier adds "Select 300K V1 (legacy): $449 evaluation [...] No longer on sale.", so $449 looks like the stale V1 price; purchasability unconfirmed (checkout needs login) |
| Select with 50% Consistency Add-on | 25K, 50K, 100K, 150K | yes | not modeled: no variant or opt-in | $135 / $205 / $329 / $459; resets $90 / $135 / $209 / $299; 300K not available | confirmed | "The 50% Consistency Add-on raises your consistency limit from 40% to 50% [...]" / "Select 50K \| $205 \| $135" | pricing ref (single source) | 2026-09-26, 200 | agree |
| Lightning Funded (instant) | 25K | yes | not modeled | $345 one-time; no resets | confirmed | "Lightning 25K \| $345" / "No resets are available [dash] if the account fails, a new one must be purchased." | pricing ref ; homepage | 2026-09-26, 200 | agree |
| Lightning Funded | 50K | yes | `tradeify-50000-lightning` (evalCost 492 matches; engine resetFee 492 is display-only) | $492; no resets | confirmed | "Lightning 50K \| $492" | pricing ref ; homepage | 2026-09-26, 200 | agree |
| Lightning Funded | 100K | yes | not modeled | $660; no resets | confirmed | "Lightning 100K \| $660" | pricing ref ; homepage | 2026-09-26, 200 | agree |
| Lightning Funded | 150K | yes | not modeled | $796; no resets | confirmed | "Lightning 150K \| $796" | pricing ref ; homepage | 2026-09-26, 200 | agree |

### R-V5 live triggers

| Plan | Trigger | Kind | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|
| Growth 50K (`tradeify-50000-growth`) | 3 approved payouts on one account or 10 total, for consideration only. Conflict carried from PT-35: FAQ says 4-5, 12987441 says 5, comparison page says 4 (Q14) | payout-count | reused-2026-09-26 | "3 payouts on a single account, or" / "10 total payouts since the last live transition across all plan types" / "These thresholds represent the minimum requirements for consideration, not automatic qualification." VERSUS "typically after 4-5 payouts on a single account." | https://intercom.help/tradeify/en/articles/12969284-tradeify-elite-program ; https://tradeify.co/funded-trader-agreement ; https://intercom.help/tradeify/en/articles/12268494-common-faqs ; https://intercom.help/tradeify/en/articles/12987441-introducing-the-new-select-plan-changes-to-the-live-program ; https://tradeify.co/tradeify-vs-myfundedfutures-comparison | PT-35 row, 2026-09-26, 200 | agree against PT-35 lines 1490-1491; not re-fetched |
| Growth 50K | Discretionary at any time after a successful payout; no dollar or single-day threshold | discretionary | reused-2026-09-26 | "Tradeify reserves the right, in its sole and absolute discretion, to move a Trader [...] at any point in the Trader's funded account journey" / "Any Funded account that has received at least one payout transitions to Elite Live." | agreement ; https://intercom.help/tradeify/en/articles/11083796-growth-funded-account-payout-policy ; Elite article | PT-35 row | agree against PT-35; not re-fetched |
| Select Daily 50K (`tradeify-50000-select-daily`) | Same 3-or-10 thresholds; same conflict | payout-count | reused-2026-09-26 | "These eligibility criteria apply across all plan types [dash] Select, Growth, and Lightning." / Agreement 5.2: "three (3) approved payouts on a single Simulated Funded Account." VERSUS "5-payout qualification for Growth/Lightning/Select." | https://intercom.help/tradeify/en/articles/12853966-select-flex-and-select-daily-payout-policies ; Elite article ; agreement ; 12987441 | PT-35 row | agree against PT-35 |
| Select Daily 50K | Discretionary at any point | discretionary | reused-2026-09-26 | "If a Sim Funded account has not received a payout, it will not transition to Live." | agreement ; 12853966 ; Elite article | PT-35 row | agree against PT-35 |
| Select Flex 50K (`tradeify-50000-select-flex`) | Same 3-or-10 thresholds; same conflict | payout-count | reused-2026-09-26 | Homepage: "Hit 3 approved payouts to qualify for Tradeify Elite" | 12853966 ; Elite article ; https://tradeify.co/ | PT-35 row | agree against PT-35 |
| Select Flex 50K | Discretionary at any point | discretionary | reused-2026-09-26 | Agreement 5.1 (as above) | agreement ; 12853966 ; Elite article | PT-35 row | agree against PT-35 |
| Lightning 50K (`tradeify-50000-lightning`) | Same 3-or-10 thresholds; same conflict | payout-count | reused-2026-09-26 | Elite article quotes as above VERSUS "5-payout qualification for Growth/Lightning/Select." | Elite article ; 12987441 ; common FAQs | PT-35 row | agree against PT-35 |
| Lightning 50K | Discretionary at any time after a successful payout | discretionary | reused-2026-09-26 | "Note: Tradeify reserves the right to move you to a Live Funded Account at any time after a successful payout." | https://intercom.help/tradeify/en/articles/10495932-lightning-funded-account-payout-policy ; agreement ; Elite article | PT-35 row | agree against PT-35 |

---

## FundedNext Futures

Sources: fundednext.com/futures and /labs, help articles at helpfutures.fundednext.com, the public checkout calculator (`api.fundednext.com/api/new-checkout/plan-bundle-calculate`) and the add-on API (`api.fundednext.com/api/plan-wise-addons`). All HTTP 200 on 2026-09-26 around 15:45 UTC. "No-code" means the checkout price with `coupon: null`.

### R-V4 catalog

| Plan | Size | Sold today | Engine PlanId | Price or fee | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|---|---|
| Rapid Pro | 25K | yes | not modeled | $159.98 no-code (plan_id 89); RAPID coupon $79.99; reset $84.99 | confirmed | "Rapid Pro and Daily \| $25K \| $159.98 \| $79.99 \| $59.99" / {"id":89,"name":"Futures Rapid Pro 25000 USD","price":159.98} | https://fundednext.com/futures ; https://helpfutures.fundednext.com/en/articles/15053874-what-are-the-available-account-sizes-and-their-prices-in-fundednext-futures ; checkout API plan_id 89 | 2026-09-26 ~15:45 UTC, 200 | not individually re-checked |
| Rapid Pro | 50K | yes | `fundednext / rapid-pro / 50000` (evalCost 299.98, reset 174.99 match) | $299.98 no-code (plan_id 90); first-purchase $159.99; reset $174.99 | confirmed | {"id":90,"name":"Futures Rapid Pro 50000 USD","price":299.98} / "Rapid Pro 50K \| $169.99 \| $174.99" | futures page ; 15053874 ; https://helpfutures.fundednext.com/en/articles/14260538 ; checkout API plan_id 90 | 2026-09-26 ~15:45 UTC, 200 | agree, re-fetched, dateModified unchanged |
| Rapid Pro | 100K | yes | not modeled | $499.98 no-code (plan_id 91); coupon $279.99; reset $299.99 | confirmed | {"id":91,"name":"Futures Rapid Pro 100000 USD","price":499.98} | futures page ; 15053874 ; checkout API | 2026-09-26, 200 | not individually re-checked |
| Rapid Pro + Daily Loss Limit Add-On | 25K | yes | not modeled | $139.98 derived ($159.98 plus -$20 add-on effect); reset $64.99 | confirmed | "Daily Loss Limit (Price -$20)" / "25K \| $139.98 \| $59.99 \| $79.99" | https://api.fundednext.com/api/plan-wise-addons?plan_id=89 ; https://helpfutures.fundednext.com/en/articles/16295692 ; 14260538 | 2026-09-26 ~15:46 UTC, 200 | not individually re-checked |
| Rapid Pro + DLL Add-On | 50K | yes | `fundednext / rapid-pro-dll-add-on / 50000` (evalCost 259.98, reset 134.99 match) | $259.98 derived; reset $134.99; coupon prices disagree across pages ($129.99 / $119.99 / $109.99) | confirmed | "Daily Loss Limit (Price -$40)" / "50K \| $259.98 \| $119.99 \| $139.99" / "Rapid Pro with Add-On 50K \| $109.99 \| $134.99" | add-on API plan_id 90 ; 16295692 ; 14260538 ; 15053874 | 2026-09-26, 200 | not individually re-checked |
| Rapid Pro + DLL Add-On | 100K | yes | not modeled | $449.98 derived ($499.98 less $50); 16295692 First Purchase table shows $499.98; reset $249.99 | conflict | "Daily Loss Limit (Price -$50)" VERSUS "100K \| $499.98 \| $229.99 \| $219.99" | add-on API plan_id 91 ; 16295692 ; 14260538 | 2026-09-26, 200 | **disagree**: see Disagreements; the same article's Recurring table shows $449.98 |
| Rapid Daily | 25K | yes | not modeled | $159.98 no-code (plan_id 92); coupon $79.99; reset $89.99; no add-ons | confirmed | {"id":92,"name":"Futures Rapid Daily 25000 USD","price":159.98} | futures page ; checkout API | 2026-09-26, 200 | not individually re-checked |
| Rapid Daily | 50K | yes | `fundednext / rapid-daily / 50000` (evalCost 299.98, reset 189.99 match) | $299.98 no-code (plan_id 93); first-purchase $169.99; reset $189.99 | confirmed | {"id":93,"name":"Futures Rapid Daily 50000 USD","price":299.98} / "Rapid Daily 50K \| $169.99 \| $189.99" | futures page ; checkout API ; 14260538 | 2026-09-26, 200 | not individually re-checked |
| Rapid Daily | 100K | yes | not modeled | $499.98 no-code (plan_id 94); coupon $279.99; reset $299.99 | confirmed | {"id":94,"name":"Futures Rapid Daily 100000 USD","price":499.98} | futures page ; checkout API | 2026-09-26, 200 | not individually re-checked |
| Flex | 50K | yes | `fundednext / flex / 50000` (evalCost 133.99, reset 77.99 match) | $133.99 no-code (plan_id 82); FNFLEX coupon $69.99; reset $77.99 | confirmed | {"id":82,"name":"Futures Flex 50000 USD","price":133.99} / "Flex 50K \| $133.99 \| $77.99" | futures page ; 15053874 ; checkout API ; 14260538 | 2026-09-26, 200 | not individually re-checked |
| Flex | 100K | yes | not modeled | $264.99 no-code (plan_id 83); coupon $139.99 (table, first 2) vs $129.99 (text, first five); reset $147.99 | confirmed (coupon wording conflicts inside 15053874) | "Flex \| $100K \| $264.99 \| $139.99 \| $149.99" VERSUS "The first five purchases made with the coupon get the best pricing: $69.99 at 50K, $129.99 at 100K, and $249.99 at 150K." | futures page ; 15053874 ; checkout API | 2026-09-26, 200 | agree, internal conflict confirmed on the page |
| Flex | 150K | yes | not modeled | $483.99 no-code (plan_id 84); coupon $249.99; reset $278.99 | confirmed | {"id":84,"name":"Futures Flex 150000 USD","price":483.99} | futures page ; 15053874 ; checkout API | 2026-09-26, 200 | not individually re-checked |
| Legacy | 25K | yes | not modeled | $79.99 (plan_id 53); reset $73.99 | confirmed | {"id":53,"name":"Futures Legacy Challenge 25000 USD","price":79.99} | futures page ; 15053874 ; checkout API | 2026-09-26, 200 | not individually re-checked |
| Legacy | 50K | yes | `fundednext / legacy / 50000` (evalCost 199.99, reset 183.99 match) | $199.99 (plan_id 54); reset $183.99 | confirmed | {"id":54,"name":"Futures Legacy Challenge 50000 USD","price":199.99} / "Legacy 50K \| $199.99 \| $183.99" | futures page ; 15053874 ; checkout API ; 14260538 | 2026-09-26, 200 | agree; verifier notes a stale prose example in 14260538 ("originally cost $149.99, the reset fee is $137.99") that the table and API override |
| Legacy | 100K | yes | not modeled | $239.99 (plan_id 55); reset $220.79 | confirmed | {"id":55,"name":"Futures Legacy Challenge 100000 USD","price":239.99} | futures page ; 15053874 ; checkout API | 2026-09-26, 200 | not individually re-checked |
| FNL:003 Instant (Labs) | 50K | no | `fundednext / fnl-003 / 50000` (modeled, but the Labs card is Expired) | $149.99 one-time; checkout calculator still prices plan_id 99 | confirmed | "status":"expired" [...] "badgeLabel":"Expired" [...] "hideCta":true / "FNL:003 50K Instant \| $50,000 \| $149.99" | https://fundednext.com/labs ; https://helpfutures.fundednext.com/en/articles/16847874-what-is-the-fundednext-futures-fnl-003-50k-instant-account ; checkout API plan_id 99 | 2026-09-26 ~15:46 UTC, 200 | agree (Labs card); checkout API not re-called |
| Rapid Challenge (former) and Bolt Challenge | all sizes | no | not modeled: discontinued | not sold | confirmed | "Note: Effective 10 July 2026, Rapid and Bolt accounts will no longer be available for new purchases or account resets." | https://helpfutures.fundednext.com/en/articles/14255818-what-types-and-sizes-of-challenges-are-available-at-fundednext-futures | 2026-09-26 ~15:44 UTC, 200 | not individually re-checked |

### R-V5 live triggers

| Plan | Trigger | Kind | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|
| Rapid Pro 50K | 15 Performance Rewards journey-wide enter a discretionary review pool; returning live traders every 5; transitions only at cycle end | payout-count | reused-2026-09-26 | "Earn 15 Performance Rewards during your FundedNext journey to enter the live review pool." / "Meeting the threshold does not guarantee a transition." | https://helpfutures.fundednext.com/en/articles/16522296-road-to-live-trading-rapid-challenge-and-flex-challenge ; .../15900277-road-to-live-trading-rapid-challenge | PT-35 row ~10:52 UTC; dateModified re-checked 15:46 UTC unchanged | not re-fetched (reused) |
| Rapid Pro DLL Add-On 50K | Same as Rapid Pro | payout-count | reused-2026-09-26 | as above | as above | PT-35 row | not re-fetched (reused) |
| Rapid Daily 50K | Same as Rapid Pro; each Rapid Daily account concludes after 5 withdrawals | payout-count | reused-2026-09-26 | "Maximum number of withdrawals: 5" | 16522296 ; .../15878210-what-are-the-performance-reward-eligibility-criteria-for-fundednext-futures-rapid-daily-fundednext-account | PT-35 row | not re-fetched (reused) |
| Flex 50K | Three-sided conflict: 15 rewards journey-wide vs 5 reward cycles from one account vs $100,000 Total Active Profits or 5 withdrawals (Q14) | payout-count | conflict | "Earn 15 Performance Rewards during your FundedNext journey [...]" VERSUS "Completion of 5 Performance Reward Cycles from a single account" VERSUS "Five reward journeys from one FundedNext account." VERSUS "after reaching $100,000 in Total Active Profits or 5 withdrawals from a single Flex Account (or earlier by discretionary review)." | .../15430139-road-to-live-trading-flex-challenge ; .../14878751-what-is-fundednext-futures-flex-challenge ; https://fundednext.com/futures/flex ; .../14283903-road-to-live-trading-legacy-challenge-rapid-challenge-former | PT-35 row; 14878751 re-fetched 15:46 UTC unchanged | agree, all four quotes verbatim, conflict real |
| Legacy 50K | $100,000 Total Active Profits across all accounts (older program), or earlier by review; discretionary. PT-04 flag stands: engine gives Legacy the new-structure live builder | cumulative-profit | reused-2026-09-26 | "A trader becomes eligible for the FundedNext Live Trading Program review after reaching the Qualification Threshold of $100,000 in Total Active Profits across all active FundedNext Futures Accounts." | 14283903 | PT-35 row; dateModified re-checked unchanged | not re-fetched (reused) |
| FNL:003 50K Instant | No published live path; product no longer sold | none-published | reused-2026-09-26 | none on live | 16847874 ; .../16847913 ; .../16847859 ; 16522296 | PT-35 row | not re-fetched (reused) |

---

## Lucid Trading

Sources: all 69 URLs in https://support.lucidtrading.com/sitemap.xml (HTTP 200). lucidtrading.com itself returned a Cloudflare challenge 403, so no non-Maxx list price could be read; the engine's non-Maxx prices rest on the 2026-09-23 paste of `LucidPricingConfig`. Rows are `confirmed` for plan, size and rules; the price column says where a paste is still needed.

### R-V4 catalog

| Plan | Size | Sold today | Engine PlanId | Price or fee | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|---|---|
| LucidPro (25K DLL is None) | 25K | yes | not modeled | not on help center; one-time fee, no activation fee; list price needs paste | confirmed | "$25,000 \| $1,250 \| $1,000 \| None \| 2 mini or 20 micros" / "There is no activation fee to upgrade a LucidPro Evaluation to a LucidPro Funded." | https://support.lucidtrading.com/en/articles/12890029-lucidpro-evaluation-account ; .../11404620-simulated-account-fees ; .../12890122-lucidpro-daily-loss-limit | 2026-09-26 15:44 UTC, 200 | agree, 15:48 UTC |
| LucidPro, DLL ON | 50K | yes | `lucid-50000-pro` | not on help center; engine $167 / $115 reset from paste; needs paste | confirmed | "$50,000 \| $3,000 \| $2,000 \| $1,200 \| 4 mini or 40 micros" / "Cheapest version of LucidPro" | 12890029 ; .../16226068-lucidpro-customization | 2026-09-26, 200 | agree (same page) |
| LucidPro, DLL OFF | 50K | yes | `lucid-50000-pro-no-dll` | not on help center; engine $192 / $140 from paste; needs paste | confirmed | "Option 2: Daily Loss Limit OFF" / "Higher pricing version of LucidPro" | 16226068 ; 12890029 | 2026-09-26, 200 | agree (same page) |
| LucidPro | 100K | yes | not modeled | needs paste | confirmed | "$100,000 \| $6000 \| $3,000 \| $1,800 \| 6 mini or 60 micros" | 12890029 ; 16226068 | 2026-09-26, 200 | agree |
| LucidPro | 150K | yes | not modeled | needs paste | confirmed | "$150,000 \| $9,000 \| $4,500 \| $2,700 \| 10 mini or 100 micros" | 12890029 ; 16226068 | 2026-09-26, 200 | agree |
| LucidFlex | 25K | yes | not modeled | needs paste | confirmed | "$25,000 \| $1,250 \| $1,000 \| 50% \| 2 mini or 20 micros" / "Optional DLL available at checkout" | .../12945790-lucidflex-evaluation-account ; .../16226050-lucidflex-customization | 2026-09-26, 200 | not individually re-checked |
| LucidFlex, DLL ON | 50K | yes | `lucid-50000-flex-dll` | engine $131 / $90 from paste; needs paste | confirmed | "Cheapest version of LucidFlex" / "$50,000 \| $3,000 \| $2,000 \| 50% \| 4 mini or 40 micros" | 12945790 ; 16226050 | 2026-09-26, 200 | not individually re-checked |
| LucidFlex, DLL OFF | 50K | yes | `lucid-50000-flex` | engine $146 / $105 from paste; needs paste | confirmed | "Higher pricing version of LucidFlex" | 16226050 ; 12945790 | 2026-09-26, 200 | not individually re-checked |
| LucidFlex | 100K | yes | not modeled | needs paste | confirmed | "$100,000 \| $6,000 \| $3,000 \| 50% \| 6 mini or 60 micros" | 12945790 ; 16226050 | 2026-09-26, 200 | not individually re-checked |
| LucidFlex | 150K | yes | not modeled | needs paste | confirmed | "$150,000 \| $9,000 \| $4,500 \| 50% \| 10 mini or 100 micros" | 12945790 ; 16226050 | 2026-09-26, 200 | not individually re-checked |
| LucidDaily (4 configurations) | 25K | yes | not modeled | needs paste | confirmed | "$25,000 \| $1,250 \| $1,000 \| 50% \| 2 mini or 20 micros" / "These settings create four unique LucidDaily account configurations." | .../15996664-luciddaily-evaluation ; .../16033858-luciddaily-customization ; .../16085900-luciddaily-daily-loss-limit | 2026-09-26, 200 | not individually re-checked |
| LucidDaily, DLL ON + Intraday | 50K | yes | `lucid-50000-daily-intraday-dll` | engine $131 / $90 from paste; needs paste | confirmed | "Option 1: Daily Loss Limit ON + Intraday Evaluation Drawdown" / "Cheapest version of LucidDaily" | 16033858 ; 15996664 | 2026-09-26, 200 | agree (ordering labels), prices need paste |
| LucidDaily, DLL ON + EOD | 50K | yes | `lucid-50000-daily-eod-dll` | engine $160 / $110 from paste; needs paste | confirmed | "Option 2: Daily Loss Limit ON + End-of-Day Evaluation Drawdown" / "Mid-tier pricing version of LucidDaily" | 16033858 ; 15996664 | 2026-09-26, 200 | agree |
| LucidDaily, DLL OFF + Intraday | 50K | yes | `lucid-50000-daily-intraday` | engine $156 / $115 from paste; needs paste | confirmed | "Option 3: Daily Loss Limit OFF + Intraday Evaluation Drawdown" | 16033858 ; 15996664 | 2026-09-26, 200 | agree |
| LucidDaily, DLL OFF + EOD | 50K | yes | `lucid-50000-daily-eod` | engine $185 / $135 from paste; needs paste | confirmed | "Option 4: Daily Loss Limit OFF + End-of-Day Evaluation Drawdown" / "Most expensive version of LucidDaily" | 16033858 ; 15996664 | 2026-09-26, 200 | agree |
| LucidDaily | 100K | yes | not modeled | needs paste | confirmed | "$100,000 \| $6,000 \| $3,000 \| 50% \| 6 mini or 60 micros" | 15996664 ; 16033858 | 2026-09-26, 200 | not individually re-checked |
| LucidDaily | 150K | yes | not modeled | needs paste | confirmed | "$150,000 \| $9,000 \| $4,500 \| 50% \| 10 mini or 100 micros" | 15996664 ; 16033858 | 2026-09-26, 200 | not individually re-checked |
| LucidDirect | 25K | yes | not modeled | needs paste (one-time fee) | confirmed | "$25,000 \| $1,000 \| None \| None \| 2 mini or 20 micros" | .../12890148-luciddirect-funded-account ; 11404620 | 2026-09-26, 200 | agree, 15:48 UTC |
| LucidDirect | 50K | yes | `lucid-50000-direct` | engine $515 from paste; needs paste | confirmed | "$50,000 \| $2,000 \| $1,200 \| 60% of Peak EOD Balance \| 4 mini or 40 micros" | 12890148 | 2026-09-26, 200 | agree |
| LucidDirect | 100K | yes | not modeled | needs paste | confirmed | "$100,000 \| $3,500 \| $2,100 \| 60% of Peak EOD Balance \| 6 mini or 60 micros" | 12890148 | 2026-09-26, 200 | agree |
| LucidDirect | 150K | yes | not modeled | needs paste | confirmed | "$150,000 \| $5,000 \| $3,000 \| 60% of Peak EOD Balance \| 10 mini or 100 micros" | 12890148 | 2026-09-26, 200 | agree |
| LucidMaxx (invite-only) | 25K | yes | not modeled | $110 eval and reset (Tier 1); $130 / $155 / $175 Tiers 2-4 | confirmed | "$25,000 \| $110 \| $130 \| $155 \| $175" / "No discounts are offered on LucidMaxx evaluations" | .../14316866-lucidmaxx-eval-pricing ; .../13891785-lucidmaxx-overview ; .../14315460-lucidmaxx-eval-rules | 2026-09-26, 200 | agree, 15:48 UTC |
| LucidMaxx | 50K | yes | `lucid-50000-maxx` (evalCost 180 = Tier 1) | $180 Tier 1; $215 / $250 / $290 | confirmed | "$50,000 \| $180 \| $215 \| $250 \| $290" / "There is no public purchase option." | 14316866 ; 13891785 | 2026-09-26, 200 | agree |
| LucidMaxx | 100K | yes | not modeled | $270 Tier 1; $325 / $380 / $430 | confirmed | "$100,000 \| $270 \| $325 \| $380 \| $430" | 14316866 ; 14315460 | 2026-09-26, 200 | agree |
| LucidMaxx | 150K | yes | not modeled | $425 Tier 1; $510 / $595 / $680 | confirmed | "$150,000 \| $425 \| $510 \| $595 \| $680" | 14316866 ; 14315460 | 2026-09-26, 200 | agree |
| LucidBlack (collection labeled Legacy) | 25K, 50K, 100K | unclear | not modeled | not shown; needs paste to settle whether still sold | needs-paste | "LucidBlack (Legacy)" / "$50,000 \| $3,000 \| $2,000 \| 60% \| 4 mini or 40 micros" | https://support.lucidtrading.com/en/collections/17988163-lucidblack-legacy ; .../13424894-lucidblack-evaluation-account | 2026-09-26, 200 (13424894 dateModified 2026-08-26) | not individually re-checked; lucidtrading.com still 403 at 15:48 UTC |

### R-V5 live triggers

| Plan | Trigger | Kind | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|
| Flex, FlexDll | Moves live after the 5th payout per account (matches engine maxLifetimePayouts 5); discretionary triggers also apply | payout-count | reused-2026-09-26 | "Traders may take up to 5 payouts from each LucidFlex account after which they will be moved live." | https://support.lucidtrading.com/en/articles/12945796-lucidflex-payouts | PT-35 row 10:52 UTC; re-checked verbatim 15:45 UTC, dateModified 2026-07-28 | not re-fetched by verifier (reused) |
| Pro, ProNoDll | Payout count unsettled: review pool after Payout 5 vs "No simulated payout caps" (Q14) | payout-count | conflict | "After receiving the final payout (Payout 5) on their plan" VERSUS "No simulated payout caps" | .../13425130-new-live-structure ; .../12890069-lucidpro-funded-account ; .../12890092-lucidpro-payouts | PT-35 row; re-checked 15:44-15:45 UTC | agree, 15:48 UTC; legacy page 13432107 (sixth payout) applies only to accounts bought on or before 2/27/26 |
| Direct | Payout count unsettled: Payout 5 final vs "No simulated payout caps" (Q14) | payout-count | conflict | "After receiving the final payout (Payout 5) on their plan" / "Payouts 1-3 \| Payouts 4-5" VERSUS "No simulated payout caps" | 13425130 ; .../12890164-luciddirect-payout-objectives ; 12890148 | PT-35 row; re-checked 15:44-15:45 UTC | agree, 15:48 UTC |
| Pro, ProNoDll, Flex, FlexDll, Direct | Discretionary review pool: significant lifetime payouts (no figure), exceptional performance, previously live; at least 1 payout per account | discretionary | reused-2026-09-26 | "After being paid out a significant amount of capital lifetime" / "All live transitions occur at the discretion of the Lucid risk team." | 13425130 | PT-35 row | not re-fetched (reused) |
| Daily (4 variants) | Maximum Daily Profit in one day ($8,000 at 50K); automatic per Payouts page vs review pool per Live page | other | conflict | "If you meet or exceed the daily amount you are automatically moved live." VERSUS "Traders enter the live review pool when one or more of the following conditions are met: If they earn the Maximum Daily Profit for their account size" | .../15997266-luciddaily-payouts ; .../16010520-luciddaily-live | PT-35 row; re-checked 15:45 UTC | agree, 15:48 UTC, amounts and conflict confirmed |
| Daily (4 variants) | Discretionary; no payout-count trigger on Daily | discretionary | reused-2026-09-26 | "After being paid out a significant amount of capital lifetime" | 16010520 | PT-35 row | not re-fetched (reused) |
| All modeled sim plans | No published cumulative-profit or balance threshold across all 69 sitemap pages | none-published | confirmed | "After being paid out a significant amount of capital lifetime" (no dollar figure anywhere) | https://support.lucidtrading.com/sitemap.xml ; 13425130 ; 16010520 | 2026-09-26 15:44-15:45 UTC, 69 URLs 200 (Terms 403, not checked) | agree; legacy "Max Moved Live" caps are transfer caps, not triggers |
| Maxx (`lucid-50000-maxx`) | No sim stage: passing the eval goes straight to live | other | reused-2026-09-26 | "Once passed, the trader transitions directly into a live account." | 14315460 ; 13891785 | PT-35 row | not re-fetched (reused) |

---

## MyFundedFutures (MFFU)

Sources: myfundedfutures.com /plans, /plans/rapid, /plans/rapid-eod, /plans/pro, /plans/builder (JSON-LD Offer lists and visible price boxes) and help.myfundedfutures.com. All HTTP 200 on 2026-09-26. /pricing is 404; the checkout (/challenge?id=70) is a client-rendered shell with no data. Engine fees all match the list prices.

### R-V4 catalog

| Plan | Size | Sold today | Engine PlanId | Price or fee | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|---|---|
| Rapid | 25K | yes | not modeled | $145 one-time list | confirmed | "My Funded Futures Rapid Plan 25,000 Account","price":"145.00" [...] "sku":"Rapid25kOTP" | https://myfundedfutures.com/plans/rapid ; https://help.myfundedfutures.com/en/articles/14116402-rapid-plan-25k-a-comprehensive-look | 2026-09-26, 200 | agree |
| Rapid | 50K | yes | `mffu-50000-rapid` (evalCost $209 matches) | $209 list; $125 promo (code CLUB) | confirmed | "Starting at" "$125" "Based on current promotions" "$209" / "No activation fee · One-time payment, no renewals" | /plans/rapid ; .../13134709-rapid-plan-50k-a-comprehensive-look | 2026-09-26, 200 | agree |
| Rapid | 100K | yes | not modeled | $356 list | confirmed | "Rapid Plan 100,000 Account","price":"356.00" [...] "sku":"Rapid100K-v2OTP" | /plans/rapid ; .../13286542 | 2026-09-26, 200 | agree |
| Rapid | 150K | yes | not modeled | $463 list | confirmed | "Rapid Plan 150,000 Account","price":"463.00" | /plans/rapid ; .../13286582 | 2026-09-26, 200 | agree |
| Rapid EOD | 25K | yes | not modeled | $145 list; $87 promo | confirmed | "One-time fee" "$87" "Based on current promotions" "$145" / "sku":"Rapid25kEODOTP" | https://myfundedfutures.com/plans/rapid-eod ; .../16727601 | 2026-09-26, 200 | agree |
| Rapid EOD | 50K | yes | `mffu-50000-rapid-eod` ($209 matches) | $209 list | confirmed | "Rapid EOD Plan 50,000 Account","price":"209.00" | /plans/rapid-eod ; .../16158363 | 2026-09-26, 200 | agree |
| Pro | 50K | yes | `mffu-50000-pro` ($265 matches) | $265 list; $159 promo | confirmed | "Starting at" "$159" "Based on current promotions" "$265" / "sku":"Pro50KOTP" | https://myfundedfutures.com/plans/pro ; .../11802674 | 2026-09-26, 200 | agree |
| Pro | 100K | yes | not modeled | $401 list | confirmed | "Pro Plan 100,000 Account","price":"401.00" | /plans/pro | 2026-09-26, 200 | agree |
| Pro | 150K | yes | not modeled | $557 list | confirmed | "Pro Plan 150,000 Account","price":"557.00" | /plans/pro | 2026-09-26, 200 | agree |
| Pro One-Day add-on | 50K | unclear | not modeled | free add-on per article | not-found | "Get funded in just ONE day with the Pro $50K plan and the free One-Day add-on." / "For a limited time," (not on the current Pro page) | https://help.myfundedfutures.com/en/articles/12879226-pro-plan-1day-addon ; /plans/pro | 2026-09-26, 200 (12879226 dateModified 2026-05-19) | agree; the Pro page's "one-day pass" text belongs to a Builder cross-sell card |
| Builder | 25K | yes | not modeled | $105 list | confirmed | "Builder Plan 25,000 Account","price":"105.00" [...] "sku":"builder-25k-v2OTP" | https://myfundedfutures.com/plans/builder ; .../17036130 | 2026-09-26, 200 | agree |
| Builder | 50K | yes | `mffu-50000-builder` (BUILDER_EVAL_FEE $153 matches) | $153 list; $92 promo | confirmed | "Starting at" "$92" "Based on current promotions" "$153" | /plans/builder ; .../14290805 | 2026-09-26, 200 | agree |
| Builder | 100K | yes | not modeled | $282 list | confirmed | "Builder Plan 100,000 Account","price":"282.00" / "The Builder 100K runs on a $3,000 payout cap per cycle, up to 5 sim payouts [...]" (hero still says "$25K & $50K Builder.", stale) | /plans/builder ; .../17005296 ; /plans | 2026-09-26, 200 (17005296 dateModified 2026-09-25) | agree, stale tagline confirmed |
| Builder | 150K | yes | not modeled | $398 list | confirmed | "Builder Plan 150,000 Account","price":"398.00" / "The Builder 150K runs on a $4,500 payout cap per cycle [...]" | /plans/builder ; .../17035331 | 2026-09-26, 200 | agree |
| Flex (legacy), Builder 25K Legacy No DLL | 25K, 50K | no | not modeled: legacy | n/a | confirmed | Collection "Legacy Plans" lists "Builder Plan 25k - Legacy No DLL", "25K Flex Plan (Legacy)" [...]; /plans lists only Rapid, Rapid EOD, Builder, Pro | https://help.myfundedfutures.com/en/collections/16162798-legacy-plans ; /plans | 2026-09-26, 200 | not re-fetched |
| Perps (myfundedperpetuals.com) | not checked | yes | not modeled: separate perpetuals product | not checked (off-domain) | confirmed | "Perps" "New" "24/7 perps trading" | https://myfundedfutures.com/ | 2026-09-26, 200 | not re-fetched |

### R-V5 live triggers

| Plan | Trigger | Kind | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|
| Rapid 50K (`mffu-50000-rapid`) | Automatic to Rapid Live on $10,000 net profit in one trading day; excess that day forfeited (single-day, not cumulative) | other | reused-2026-09-26 | "$10,000 net profit achieved in a single trading day (automatic transition), or" | https://help.myfundedfutures.com/en/articles/13134718-understanding-rapid-live ; .../13745661-payout-policy-overview-best-and-fastest-prop-firm-payouts | 2026-09-26, 200 | not re-fetched (reused) |
| Rapid 50K | Discretionary Risk Management review | discretionary | reused-2026-09-26 | "final transition approval remains at the Risk Management Team's sole discretion." | 13134718 | 2026-09-26, 200 | not re-fetched (reused) |
| Rapid EOD 50K (`mffu-50000-rapid-eod`) | Same as Rapid 50K | other | reused-2026-09-26 | "Live transition on Rapid EOD 50k follows the same rules as standard Rapid 50k." | .../16158363 ; 13745661 | 2026-09-26, 200 | not re-fetched (reused) |
| Pro 50K (`mffu-50000-pro`) | 3 consecutive payouts on one Pro account; automatic vs review only (Q14). Plan page table: "Live Transition Trigger" "3 consecutive payouts" | payout-count | conflict | "Live Account Transition Triggers \| Achieve 3 consecutive payouts, or [...]" VERSUS "Reviewed for Live Account transition after: / 3 consecutive payouts, or / $20,000 profit milestone" / "After three consecutive payouts on the same Pro account, the account is reviewed by our team [...]" | .../11802674 ; 13745661 ; /plans/pro | 2026-09-26, 200 | agree, re-fetched, conflict stands |
| Pro 50K | $20,000 profit milestone triggers a review only | cumulative-profit | reused-2026-09-26 | "Note: Reaching a $20,000 profit milestone will trigger an account for review but may not guarantee a transition to a Live account." | 11802674 ; 13745661 | 2026-09-26, 200 | agree (re-fetched anyway) |
| Pro 50K | Profit above the $100,000 per-user cap moves to live, up to $5,000 at 50K (modeled as maxLifetimePayoutDollars) | cumulative-profit | reused-2026-09-26 | "excess profits moved to their live account balance up to the following amounts: $50,000 account - $5,000" | 11802674 ; /plans/pro | 2026-09-26, 200 | not independently confirmed |
| Pro 50K | Risk team may contact at any time | discretionary | reused-2026-09-26 | "The risk team may contact you at any point during your Sim Funded journey for a transition to a Live account." | 11802674 ; 13745661 | 2026-09-26, 200 | not re-fetched (reused) |
| Builder 50K (`mffu-50000-builder`) | 5th approved sim payout (also the sim max) vs "5 consecutive payouts / total sim cap of $100k / discretion"; the $100k is unreachable in 5 payouts of at most $2,000 | payout-count | conflict | "After your 5th approved sim payout, you are eligible for promotion to a live funded account." / "The fifth approved payout triggers promotion to a live account underwritten by Blue Row Capital." VERSUS "5 consecutive payouts / Reaching the total sim cap of $100k / Consistent performance in sim funded account (Discretion of the Risk Management Team)" | .../14290805 ; /plans/builder ; 13745661 | 2026-09-26, 200 | agree, conflict stands; 17005296 repeats the 5th-payout wording for 100K |
| All modeled plans | Discretionary invite; the trader cannot refuse | discretionary | reused-2026-09-26 | "Unfortunately, rejecting the move to a Live Funded Account is not possible." | .../10101257 ; .../12109396 | 2026-09-26, 200 | not re-fetched (reused) |
| Rapid Live 50K (`buildMffuRapidLivePlan`) | Not applicable: this is the live stage | other | reused-2026-09-26 | "Rapid Live accounts start at $0, so balances may go negative until the maximum loss limit trails up to $0." | 13134718 | 2026-09-26 | not re-fetched (reused) |

---

## Topstep

Sources: help.topstep.com (pricing article 14289835, dateModified 2026-09-25) and https://www.topstep.com/no-activation-fee, all HTTP 200 at 15:44 UTC. /pricing and /trading-combine are 404 (guessed URLs). Labs purchases sit behind the dashboard login.

### R-V4 catalog

| Plan | Size | Sold today | Engine PlanId | Price or fee | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|---|---|
| Combine, Standard path, Standard XFA, no DLL | 50K | yes | `topstep-50000-standard-standard` | $49/month; $149 XFA activation; reset $49 | confirmed | "50K \| $49/month \| $95/month" / "Standard Path: Lower monthly cost. $149 Activation Fee charged once per Express Funded Account (XFA) earned." | https://help.topstep.com/en/articles/14289835-topstep-pricing-and-payment-questions ; https://www.topstep.com/no-activation-fee | 2026-09-26 15:44 UTC, 200 | agree, 15:48 UTC |
| Combine, Standard path, Consistency XFA, no DLL | 50K | yes | `topstep-50000-standard-consistency` | $49/month; $149 activation; reset $49 | confirmed | "Option 2: Consistency [...] Keep your best day within 40% of total profit [...] $3,000 $6,000 Payout Caps" | 14289835 ; no-activation-fee ; .../8284217-express-funded-account-activation | 2026-09-26, 200 | not individually re-checked |
| Combine, Standard path + DLL, Standard XFA | 50K | yes | `topstep-50000-standard-standard-dll` | $49/month; $149 activation; $1,000 DLL; cap $4,000 | confirmed | "Daily Loss Limit: $1,000 DOUBLE Payout Caps: Included Discount: -$10 Reset Fee: $49 [...] Express Funded Activation Fee: $149" | no-activation-fee ; 14289835 | 2026-09-26, 200 | agree; notes the article text mentions an activation discount that the discount table does not price |
| Combine, Standard path + DLL, Consistency XFA | 50K | yes | `topstep-50000-standard-consistency-dll` | $49/month; $149 activation; $1,000 DLL; cap $6,000 | confirmed | standard-price="$49" / "Option 2: Consistency [...] $3,000 $6,000 Payout Caps" | no-activation-fee | 2026-09-26, 200 | not individually re-checked |
| Combine, No Activation Fee path, Standard XFA | 50K | yes | `topstep-50000-no-fee-standard` | $95/month; $0 activation; reset $95 | confirmed | "No Activation Fee Path: Higher monthly cost. No fee when you pass." / xfa-price="$95" xfa-fee="Free" | 14289835 ; no-activation-fee | 2026-09-26, 200 | not individually re-checked |
| Combine, No Activation Fee path, Consistency XFA | 50K | yes | `topstep-50000-no-fee-consistency` | $95/month; $0 activation; reset $95 | confirmed | "No Activation Fee Path [dash] $0." | 14289835 ; no-activation-fee | 2026-09-26, 200 | not individually re-checked |
| Combine, No Activation Fee path + DLL, Standard XFA | 50K | yes | `topstep-50000-no-fee-standard-dll` | $85/month ($10 recurring discount); $0 activation; $1,000 DLL; cap $4,000 | confirmed | xfa-discount-price="$85" / "Discount recurs monthly. The DLL is fixed and carried into your XFA when you pass." | no-activation-fee ; 14289835 | 2026-09-26, 200 | agree |
| Combine, No Activation Fee path + DLL, Consistency XFA | 50K | yes | `topstep-50000-no-fee-consistency-dll` | $85/month; $0 activation; $1,000 DLL; cap $6,000 | confirmed | xfa-discount-price="$85" / "$10 off → 50K" | no-activation-fee ; 14289835 | 2026-09-26, 200 | not individually re-checked |
| Combine, Standard path, no DLL | 100K | yes | not modeled | $99/month; $149 activation; reset $99; caps $3,000 / $4,000 | confirmed | "100K \| $99/month \| $149/month" / "Profit Target: $6,000 [...] Max Loss Limit (One Rule): $3,000" | 14289835 ; no-activation-fee | 2026-09-26, 200 | not individually re-checked |
| Combine, Standard path + DLL | 100K | yes | not modeled | $99/month; $149 activation; $2,000 DLL; caps $6,000 / $8,000 | confirmed | "Daily Loss Limit: $2,000 DOUBLE Payout Caps: Included Discount: -$20 Reset Fee: $99" | no-activation-fee | 2026-09-26, 200 | not individually re-checked |
| Combine, No Activation Fee path, no DLL | 100K | yes | not modeled | $149/month; $0 activation; reset $149 | confirmed | xfa-price="$149" xfa-fee="Free" | 14289835 ; no-activation-fee | 2026-09-26, 200 | not individually re-checked |
| Combine, No Activation Fee path + DLL | 100K | yes | not modeled | $129/month; $0 activation; $2,000 DLL; caps $6,000 / $8,000 | confirmed | xfa-discount-price="$129" / "$20 off → 100K" | no-activation-fee ; 14289835 | 2026-09-26, 200 | agree |
| Combine, Standard path, no DLL | 150K | yes | not modeled | $199/month; $149 activation; reset $199; caps $5,000 / $6,000 | confirmed | "150K \| $199/month \| $229/month" / "Profit Target: $9,000 [...] Max Loss Limit (One Rule): $4,500" | 14289835 ; no-activation-fee | 2026-09-26, 200 | not individually re-checked |
| Combine, Standard path + DLL | 150K | yes | not modeled | $199/month; $149 activation; $3,000 DLL; caps $10,000 / $12,000 | confirmed | "Daily Loss Limit: $3,000 DOUBLE Payout Caps: Included Discount: -$30 Reset Fee: $199" | no-activation-fee | 2026-09-26, 200 | not individually re-checked |
| Combine, No Activation Fee path, no DLL | 150K | yes | not modeled | $229/month; $0 activation; reset $229 | confirmed | xfa-price="$229" xfa-fee="Free" | 14289835 ; no-activation-fee | 2026-09-26, 200 | not individually re-checked |
| Combine, No Activation Fee path + DLL | 150K | yes | not modeled | $199/month ($30 off); $0 activation; $3,000 DLL | confirmed | xfa-discount-price="$199" / "$30 off → 150K" | no-activation-fee ; 14289835 | 2026-09-26, 200 | agree |
| Back2Funded XFA Reactivation | 50K / 100K / 150K | yes | not modeled: reactivation fee, left out deliberately | $599 / $699 / $829; $50 off with DLL | confirmed | "Reactivation fees: $50K XFA [dash] $599 $100K XFA [dash] $699 $150K XFA [dash] $829" | 14289835 | 2026-09-26, 200 | agree |
| Pro Account (call-up only) | 50K-derived tier | no | `topstep-50000-pro-account` (CallUpOnly) | not sold | confirmed | "Topstep's Risk team will reach out when you're ready to move to a Pro Account." | https://help.topstep.com/en/articles/14645398-what-is-a-pro-account | 2026-09-26, 200 (dateModified 2026-09-11) | agree |
| Live Funded Account (call-up only) | 50K tier in engine | no | no PlanId: live plan `buildTopStepLivePlan()` | not sold | confirmed | "Topstep's prop firm capital. Called up by the Risk Team after consistent XFA performance." | https://help.topstep.com/en/articles/8284099-topstep-program-overview | 2026-09-26, 200 | agree |
| Labs #001 $25K Static Drawdown Combine | 25K | unclear | not modeled | $75 one-time; no resets | confirmed | "$75 one-time [dash] no subscription. 90 Day expiration." / listed under "Past Lab Drops" | https://help.topstep.com/en/articles/15520357-topstep-labs ; https://www.topstep.com/labs | 2026-09-26 ~15:46 UTC, 200 | not individually re-checked |
| Labs #002 $250K Freedom Combine | 250K | unclear | not modeled | $499 one-time; mandatory $5,000 DLL; no resets | confirmed | "$499 one-time [dash] no subscription. 90 Day expiration." / "For the $250K Re-release, you may purchase up to 5 accounts." | 15520357 ; /labs | 2026-09-26, 200 | agree; /labs 50% vs 55% consistency not re-verified |
| Labs #003 $3K Challenge | $1,000 static MLL | unclear | not modeled: fixed-payout challenge | $49 one-time | confirmed | "The $3K Challenge is a 2 round challenge for $49, one time." | 15520357 | 2026-09-26, 200 | not individually re-checked |
| Labs #004 $1.5K Challenge | $500 static MLL | unclear | not modeled | $39 one-time; 5 per trader | confirmed | "Make $1,500. Do it again. Keep $1,500. $39, one time." | 15520357 | 2026-09-26, 200 | not individually re-checked |
| Labs #005 $6K Challenge | $2,000 static MLL | unclear | not modeled | $149 one-time; 5 per trader; 10,000 units | confirmed | "Make $6,000. Do it again. Keep $6,000. $149, one time." / "There are 10,000 units available, first come, first serve." | 15520357 ; /labs | 2026-09-26, 200 | agree |

### R-V5 live triggers

| Plan | Trigger | Kind | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|
| All 8 XFA variants to LFA | Discretionary Risk Team call-up; no threshold; 5 payouts not required; cannot decline and keep the XFA | discretionary | reused-2026-09-26 | "Do I need 5 payouts to move to Live? No. All decisions are based on overall performance and Risk Team review." / "Can I decline the invitation to move to Live and stay in my XFA? No." | .../13747178-live-funded-account-call-up-and-call-down-process ; .../10657969-live-funded-account-parameters ; 8284099 | PT-35 row | call-up page fetched today still carries the quoted FAQ |
| All 8 XFA variants to LFA (today's re-check) | Same; firm discloses a 0.71% call-up rate for 2025 (a statistic, not a trigger) | discretionary | confirmed | "Moving to the Live Funded Account® (LFA) isn't automatic [dash] it's earned." / "(d) 0.71% of individual participants trading in an Express Funded Account were called up to a Live Funded Account." | 13747178 ; https://www.topstep.com/ | 2026-09-26 15:44-15:47 UTC, 200 | agree, 15:48 UTC |
| All 8 XFA variants to Pro Account | Discretionary call-up in jurisdictions without live access; $200,000 total payout cap there | discretionary | reused-2026-09-26 | "take up to $200,000 in total payouts. No Live Funded Account access" | 14645398 ; .../8284116-am-i-eligible-to-trade-with-topstep | PT-35 row | not re-fetched (reused) |
| ProAccount to LFA | No published route or threshold | none-published | confirmed | "Topstep will reach out to notify you if their Live Funded Account policy or live market access changes for your jurisdiction." | 14645398 | 2026-09-26 15:47 UTC, 200 | agree |
| LFA call-down | Already live; call-down to a Shoulder Tap XFA is discretionary, no warning | discretionary | reused-2026-09-26 | "No. There is no warning before being called down." | 13747178 | PT-35 row | not re-fetched (reused) |

---

## FTMO Futures

Sources: https://ftmo.com/en/futures/#pricing (data-futures-pricing JSON), /en/futures/comparison-table/ and /en/futures/trading-objectives-and-rules/, all HTTP 200 at 15:44 UTC. /en/futures/pricing/ is 404; the checkout redirects to SSO login.

### R-V4 catalog

| Plan | Size | Sold today | Engine PlanId | Price or fee | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|---|---|
| Growth | 50K | yes | `ftmo-futures-50000-growth` ($119, reset $109, activation $0 match) | $119/month; reset $109; no activation fee | confirmed | "account_size":"50",[...]"price_per_month":"119" / "The monthly fee is $119/month." / "The Reset Fee is $109." | https://ftmo.com/en/futures/#pricing ; https://ftmo.com/en/futures/comparison-table/ ; https://ftmo.com/en/futures/trading-objectives-and-rules/ | 2026-09-26 15:44:33 UTC, 200 | agree, 15:46 UTC |
| Growth | 100K | yes | not modeled | $169/month; reset $159 | confirmed | "account_size":"100","favourite":true,"price_per_month":"169" / "The Reset Fee is $159." | same | 2026-09-26, 200 | agree |
| Growth | 150K | yes | not modeled | $229/month; reset $219 | confirmed | "price_per_month":"229" / "The Reset Fee is $219." | same | 2026-09-26, 200 | agree |
| Pro | 50K | yes | `ftmo-futures-50000-pro` ($139, reset $129 match) | $139/month; reset $129; no activation fee | confirmed | account_type "1", "price_per_month":"139" / "The Reset Fee is $129." | same | 2026-09-26, 200 | agree |
| Pro | 100K | yes | not modeled | $199/month; reset $189 | confirmed | "price_per_month":"199" / "The Reset Fee is $189." | same | 2026-09-26, 200 | agree |
| Pro | 150K | yes | not modeled | $269/month; reset $259 | confirmed | "price_per_month":"269" / "The Reset Fee is $259." | same | 2026-09-26, 200 | agree |

### R-V5 live triggers

| Plan | Trigger | Kind | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|
| Growth 50K | No numeric trigger; invitation only at the Trading Department's discretion after approved payouts; no `LIVE_PLAN_BUILDERS` entry | discretionary | reused-2026-09-26 | "The Live Funded Account is not something you apply for." / "Not automatic: the Live Funded Account is offered by invitation only, after FTMO validates your Sim-Funded trading." | https://ftmo.com/en/futures/faq/who-is-eligible-for-a-live-funded-account/ ; .../who-is-an-ftmo-trader-and-how-do-i-become-one/ ; https://ftmo.com/en/futures/how-it-works/ ; T&C v5 PDF | PT-35 row 10:51-10:52 UTC; How It Works re-fetched 15:44 UTC unchanged | not re-fetched (reused) |
| Pro 50K | Same as Growth | discretionary | reused-2026-09-26 | "Progression from a Sim-Funded Account to a Live Funded Account is at the discretion of our Trading Department [...]" | same | PT-35 row | not re-fetched (reused) |

---

## Alpha Futures

Sources: alpha-futures.com /product/zero, /standard, /advanced, /direct, the homepage pricing tabs and help articles 9492068, 11771813, 11632512, 11634907, 15838742, all HTTP 200 at 15:44 UTC. /pricing is 404; checkout is a JavaScript-only app.

### R-V4 catalog

| Plan | Size | Sold today | Engine PlanId | Price or fee | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|---|---|
| Zero | 25K | yes | not modeled | $89/month; reset $79; activation $0; Qualified reset $399 | confirmed | "25K Zero Eval" \| "$89/month" \| "Resets" \| "$79" / "25k Zero Evaluation $89/month" | https://alpha-futures.com/product/zero ; https://help.alpha-futures.com/en/articles/11771813-zero-account-overview ; .../9492068-monthly-subscription | 2026-09-26 15:44 UTC, 200 | agree, 15:46 UTC |
| Zero | 50K | yes | `alphafutures-50000-zero` ($139, reset $119, Qualified reset $499 match) | $139/month; reset $119; Qualified reset $499 | confirmed | "50K Zero Eval" \| "$139/month" [...] "Resets" \| "$119" / "50K Zero Qualified" \| "$139/month" \| "Resets" \| "$499" | /product/zero ; homepage ; 9492068 | 2026-09-26, 200 | agree (Qualified reset not separately re-extracted) |
| Zero | 100K | yes | not modeled | $279/month; reset $249; Qualified reset $799 | confirmed | "100K Zero Eval" \| "$279/month" \| "Resets" \| "$249" | /product/zero ; 9492068 | 2026-09-26, 200 | agree |
| Standard | 50K | yes | `alphafutures-50000-standard` ($129, reset $109, Qualified reset $599 match) | $129/month; reset $109; Qualified reset $599 | confirmed | "50K Standard Eval" \| "$129/month" [...] "Resets" \| "$109" / "50K Standard Qualified" [...] "Resets" \| "$599" | https://alpha-futures.com/product/standard ; .../11632512-standard-account-overview | 2026-09-26, 200 | not individually re-checked |
| Standard | 100K | yes | not modeled | $239/month; reset $199; Qualified reset $799 | confirmed | "100K Standard Eval" \| "$239/month" [...] "Resets" \| "$199" | /product/standard | 2026-09-26, 200 | not individually re-checked |
| Standard | 150K | yes | not modeled | $349/month; reset $289; Qualified reset $999 | confirmed | "150K Standard Eval" \| "$349/month" [...] "Resets" \| "$289" | /product/standard ; 9492068 | 2026-09-26, 200 | agree |
| Advanced | 50K | yes | `alphafutures-50000-advanced` ($209, reset $189 match) | $209/month; reset $189; activation $0 (bought after July 8, 2026); no Qualified reset | confirmed | "50K Advanced Eval" \| "$209/month" [...] "Resets" \| "$189" / "Accounts Purchased after July 8, 2026 enjoy No Activation Fees" | https://alpha-futures.com/product/advanced ; .../11634907-advanced-account-overview ; .../9492083-activation-fee | 2026-09-26, 200 | agree |
| Advanced | 100K | yes | not modeled | $349/month; reset $319 | confirmed | "100K Advanced Eval" \| "$349/month" [...] "Resets" \| "$319" | /product/advanced | 2026-09-26, 200 | not individually re-checked |
| Advanced | 150K | yes | not modeled | $489/month; reset $449 | confirmed | "150K Advanced Eval" \| "$489/month" [...] "Resets" \| "$449" | /product/advanced | 2026-09-26, 200 | agree |
| Direct Qualified (no eval, one-time) | 25K | yes | not modeled: no Direct variant | $349 one-time | confirmed | "25K Direct Qualified" \| "$349" / "All Direct Accounts are one time fee, no monthly subscription." | https://alpha-futures.com/product/direct ; .../15838742-direct-account-overview | 2026-09-26, 200 | not individually re-checked |
| Direct Qualified | 50K | yes | not modeled: no Direct variant | $519 one-time | confirmed | "50K Direct Qualified" \| "$519" [...] "Consistency Rule" \| "20%" / "The Direct Account is available as of July 7th, 2026." | /product/direct ; 15838742 | 2026-09-26, 200 | agree |
| Direct Qualified | 100K | yes | not modeled | $689 one-time | confirmed | "100K Direct Qualified" \| "$689" | /product/direct | 2026-09-26, 200 | agree |
| Direct Qualified | 150K | yes | not modeled | $859 one-time | confirmed | "150K Direct Qualified" \| "$859" | /product/direct | 2026-09-26, 200 | agree |

Flag for the writer of the engine side (not a catalog row): the product pages show a $/month price on every Qualified card ("Your monthly stays the same after you qualify"), while help 9492068 says "The Evaluation subscription automatically ends once you pass." and, per the verifier, "Qualified Traders do not pay a monthly subscription." How the engine charges the Qualified phase was not checked here.

### R-V5 live triggers

| Plan | Trigger | Kind | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|
| Zero, Standard, Advanced 50K Qualified to Live | May be reviewed or called up after 5 payouts on one Qualified account (review, not automatic); conflicts with the how-it-works figures | payout-count | reused-2026-09-26 | "A trader may be reviewed or called to live immediately if they have met one or more of the following conditions:" / "5 performance fees on a single Qualified Account" | https://help.alpha-futures.com/en/articles/10743344-path-to-live-structure | PT-35 row 10:52 UTC | not re-fetched (reused) |
| same | +$40,000 payable balance or 5 payout cycles starts a Prime review; no $40,000 figure in the help center | balance | reused-2026-09-26 | "Once your simulated Qualified Account reaches +$40,000 in payable balance, or after 5 payout cycles, our team reviews your trading history for the opportunity to move to Alpha Prime." | https://alpha-futures.com/how-it-works | PT-35 row; re-fetched 15:44 UTC unchanged | not re-fetched (reused) |
| same | Discretionary conditions with no number | discretionary | reused-2026-09-26 | "A significant amount of lifetime performance fees" / "Outstanding performance in a Qualified Account" | 10743344 | PT-35 row | not re-fetched (reused) |
| same | Eligibility gate: at least one payout; one live account per eligible Qualified account | other | reused-2026-09-26 | "Eligible Qualified Account = a Qualified Account that has reached at least one payout." | 10743344 | PT-35 row | not re-fetched (reused) |
| same | No automatic single-day or cumulative-dollar transfer | none-published | reused-2026-09-26 | none | 10743344 ; .../11023753-live-account-rules-and-parameters ; how-it-works ; https://alpha-futures.com/terms-and-conditions | PT-35 row | not re-fetched (reused) |
| Advanced 50K Qualified | Qualified traders are the pool considered for Prime; no threshold. Zero and Standard pages have no live wording | discretionary | confirmed | "Our Qualified Traders are the talent considered for Alpha Prime." | 11634907 | 2026-09-26 15:44 UTC, 200 | agree, 15:46 UTC |

---

## E8 Futures

Sources: https://e8futures.com/ and /e8-zero (rendered configurators and embedded `__NUXT_DATA__`), the configurator script /_nuxt/CRagblFX.js, and help articles at intercom.help/E8futures. All HTTP 200. The checkout (e8x.e8markets.com) and the canonical help host (helpfutures.e8markets.com) returned 403. The 100% payout prices are computed with the site's own configurator function, `ceil(price x (1 + 20 x pht))`, not read from a displayed checkout.

### R-V4 catalog

| Plan | Size | Sold today | Engine PlanId | Price or fee | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|---|---|
| E8 Signature (80% payout only) | 25K | yes | not modeled | $120 list ($90 with code E8); no activation fee | confirmed | "25% OFF $25K $120 $90 25% OFF $50K $160 $120 25% OFF $100K Recommended $280 $210 25% OFF $150K $450 $338" | https://e8futures.com/ ; https://intercom.help/E8futures/en/articles/11755943-e8-signature | 2026-09-26, 200 (11755943 dateModified 2026-09-23) | agree |
| E8 Signature | 50K | yes | `e8futures-50000-signature` (oneTimeEval $160 matches) | $160 list ($120) | confirmed | "25% OFF $50K $160 $120" / "No Activation Fee" | e8futures.com | 2026-09-26, 200 | agree |
| E8 Signature | 100K | yes | not modeled | $280 list ($210) | confirmed | "$100K One phase $280 $210 Save $70 with code E8 on first order" | e8futures.com | 2026-09-26, 200 | agree |
| E8 Signature | 150K | yes | not modeled | $450 list ($338) | confirmed | "25% OFF $150K $450 $338" | e8futures.com ; 11755943 | 2026-09-26, 200 | agree |
| E8 Zero MAX 80% | 50K | yes | `e8futures-50000-zero-max-80` (listEvalFee $328 matches) | $328 list ($214 with E8) | confirmed | "35% OFF $50K $328 $214 35% OFF $100K Recommended $588 $383 35% OFF $200K $1,088 $708" | https://e8futures.com/e8-zero | 2026-09-26, 200 | agree |
| E8 Zero MAX 100% | 50K | yes | `e8futures-50000-zero-max-100` (listEvalFee $428 matches) | $428 list, computed | confirmed | "Keep 80% or 100% Choose your payout at purchase. The 100% option costs a bit more [dash] and every payout is fully yours." / "o*=1+(u-d)*h}return Math.ceil(o)" | /e8-zero ; https://e8futures.com/_nuxt/CRagblFX.js | 2026-09-26, 200 | agree, recomputed ceil(328 x 1.3048) = 428 |
| E8 Zero MAX 80% | 100K | yes | not modeled | $588 list ($383; homepage promo $353 at 40% off) | confirmed | "$100K One phase $588 $383 Save $205 with code E8 on first order" | /e8-zero ; e8futures.com | 2026-09-26, 200 | agree |
| E8 Zero MAX 100% | 100K | yes | not modeled | $748 list, computed | confirmed | configurator function applied to 588 | /e8-zero ; CRagblFX.js | 2026-09-26, 200 | agree, recomputed |
| E8 Zero MAX 80% | 200K | yes | not modeled | $1,088 list ($708) | confirmed | "35% OFF $200K $1,088 $708" / "$200,000 - $13,500" | /e8-zero ; https://intercom.help/E8futures/en/articles/15935817-e8-zero-starter-and-max | 2026-09-26, 200 | agree |
| E8 Zero MAX 100% | 200K | yes | not modeled | $1,418 list, computed | confirmed | configurator function applied to 1088 | /e8-zero ; CRagblFX.js | 2026-09-26, 200 | agree, recomputed |
| E8 Zero Starter 80% | 50K | yes | `e8futures-50000-zero-starter-80` (listEvalFee $178 matches) | $178 list (embedded data, not rendered text) | confirmed | "Starter costs less and has lower payout caps per cycle ($1,000 / $1,600 / $2,100 at $50K / $100K / $200K)" / e8zero_start_fu balances 50000 price 178 | /e8-zero | 2026-09-26, 200 | agree |
| E8 Zero Starter 100% | 50K | yes | `e8futures-50000-zero-starter-100` (listEvalFee $228 matches) | $228 list, computed | confirmed | configurator function applied to 178 | /e8-zero ; CRagblFX.js | 2026-09-26, 200 | agree, recomputed |
| E8 Zero Starter 80% | 100K | yes | not modeled | $278 list (embedded data) | confirmed | e8zero_start_fu balances 100000 price 278 | /e8-zero | 2026-09-26, 200 | agree |
| E8 Zero Starter 100% | 100K | yes | not modeled | $358 list, computed | confirmed | configurator function applied to 278 | /e8-zero ; CRagblFX.js | 2026-09-26, 200 | agree, recomputed |
| E8 Zero Starter 80% | 200K | yes | not modeled | $558 list (embedded data) | confirmed | "E8 Zero Starter: $50,000 - $1,000 $100,000 - $1,600 $200,000 - $2,100" | /e8-zero ; 15935817 | 2026-09-26, 200 | agree |
| E8 Zero Starter 100% | 200K | yes | not modeled | $708 list, computed | confirmed | configurator function applied to 558 | /e8-zero ; CRagblFX.js | 2026-09-26, 200 | agree, recomputed |
| Free Trial (homepage modal) | not stated | unclear | not modeled: no size, price or funded path; config ids e8trialone lack the futures suffix | free | not-found | "Choose your challenge Free Trial Sign in with Google Sign in with Discord" | e8futures.com | 2026-09-26, 200 | agree |

### R-V5 live triggers

| Plan | Trigger | Kind | Status | Quote | URL | Fetched | Verifier |
|---|---|---|---|---|---|---|---|
| Signature 50K | No live transfer exists; all accounts are demo; the 5-payout closure leads to a free Challenge, not live | none-published | reused-2026-09-26 | "All accounts at E8 Markets are demo accounts within a simulated environment powered by real market data." / "After you request 5 payouts, [...] the cycle is closed, the account is deactivated, and you move on with the free Challenge of the same size." | https://intercom.help/E8futures/en/articles/5514957-is-my-account-live-or-demo ; .../5514892 ; 11755943 | PT-35 row | not re-fetched (reused) |
| ZeroMax80 50K | Same | none-published | reused-2026-09-26 | "2.3 Simulated, Not Real-World, Trading. All activity on the Platform occurs in a virtual environment [...]" | 5514957 ; https://e8futures.com/e8-markets-terms-and-conditions ; /e8-zero | PT-35 row | not re-fetched (reused) |
| ZeroMax100 50K | Same | none-published | reused-2026-09-26 | as above | 5514957 ; T&C | PT-35 row | not re-fetched (reused) |
| ZeroStarter80 50K | Same | none-published | reused-2026-09-26 | as above | 5514957 ; T&C | PT-35 row | not re-fetched (reused) |
| ZeroStarter100 50K | Same | none-published | reused-2026-09-26 | as above | 5514957 ; T&C | PT-35 row | not re-fetched (reused) |

---

## Needs-paste pages

These pages hold values no reachable firm page states. A user paste (page text or HTML) is needed to settle them.

| Firm | URL | HTTP status (2026-09-26) | What the paste settles |
|---|---|---|---|
| Apex | https://apextraderfunding.com/ | 403 (Cloudflare, cf-ray a41363d19dcc1c89-AMS) | Sizes sold, eval and PA activation prices, bundles, Legacy line (product picker) |
| Apex | https://apextraderfunding.com/pricing/ | 403 (cf-ray a41363d21d5506c8-AMS) | Same |
| Apex | https://apextraderfunding.com/help-center/billing/evaluation-plan-fees-and-access-explained/ | 403 (cf-ray a41363d4094d7748-AMS) | Fee structure |
| Apex | https://apextraderfunding.com/help-center/getting-started/apex-live-prop-trading-program-faq/ | 403 (cf-ray a41363d39eb55d56-AMS) | Whether the 2026-09-23 paste of the live FAQ and the $199 Second Chance price are still current |
| TPT | https://takeprofittrader.com/pricing | 403 (Cloudflare) | Monthly Test list price at 25K to 150K (engine 50K 170 unconfirmed) |
| TPT | https://takeprofittrader.com/api/subscriptions/products | 403 (Cloudflare) | Same (source of the homepage price cards) |
| Lucid | https://lucidtrading.com/ | 403 (cf-mitigated: challenge) | Non-Maxx list prices for every plan and size (engine 50K prices from the 2026-09-23 paste) |
| Lucid | https://lucidtrading.com/checkout/ | 403 (cf-mitigated: challenge) | Whether LucidBlack is still sold; whether the 25K Pro offers a DLL toggle |

Other blocked or login-only pages, not needed for today's rows: Apex /evaluation/, /help-center/, /member/, sitemap, wp-json, payout and T&C pages, support.apextraderfunding.com (all 403); TPT /checkout, /faq, /rules, /terms, /pro-plus (403; /terms would also settle the PRO-while-PRO+ question); Tradeify canonical help host (403, same article read at intercom.help) and logged-in checkout (would settle whether the Select 300K V2 is purchasable); Lucid www, /pricing/, /lucidpro/, /terms-of-use/ (403); E8 checkout, dashboard and canonical help host (403); Topstep dashboard (login, would settle Labs availability); FTMO checkout (SSO login); Alpha Futures checkout (JavaScript-only).

## Disagreements between researcher and verifier

One row has a `disagree` verdict.

**FundedNext, Rapid Pro with Daily Loss Limit Add-On, 100K (catalog).**

- Researcher: status `conflict`, derived price $449.98 against the offer article's DLL Base of $499.98. Quote: add-on API plan_id=91 "Daily Loss Limit (Price -$50)" VERSUS 16295692 "100K \| $499.98 \| $229.99 \| $219.99" (DLL table, Base column).
- Verifier: disagree with the framing. Quote: 16295692 second table "Rapid Pro with DLL Add-on [dash] Recurring Purchases (Existing Futures Users) \| Package \| Base (with DLL) \| Discounted + DLL Add-On \| You Save \| 25K \| $139.98 \| $64.99 \| $74.99 \| 50K \| $259.98 \| $134.99 \| $124.99 \| 100K \| $449.98 \| $249.99 \| $199.99". Only the First Purchase table shows $499.98, so the conflict sits inside article 16295692 itself, and $449.98 has support on the firm's own page. Keep the conflict flag, cite both tables; the derived price is not wrong.

Verifier additions that are not disagreements:

- TPT Test to PRO live-trigger row: the "minimum 3 trading days" paraphrase is not in the cited articles; it comes from Rule 5 (https://takeprofittraderhelp.zendesk.com/hc/en-us/articles/15170316538013, "you must trade for a minimum of 3 trading days."). Added to the row above.
- Tradeify Select 300K: the 300K article also says "Select 300K V1 (legacy): $449 evaluation [...] No longer on sale.", which suggests the pricing reference and homepage still carry the V1 price.
- Alpha Futures Qualified monthly fee: the conflict is stronger than the researcher wrote (help 9492068: "Qualified Traders do not pay a monthly subscription." against $/month on every Qualified card).
- FundedNext Legacy 50K: help 14260538 prose still says "If your $50K Legacy Challenge originally cost $149.99, the reset fee is $137.99.", which the table and checkout API contradict.
- Topstep 50K Standard + DLL: pricing article text says the Responsible Trading Discount also covers "Express Funded Account Activations", but its table prices no activation discount and the card still shows $149.
- MFFU: the "one-day pass" wording on the Pro page belongs to a Builder cross-sell card; the Builder catalog row does not note it.

## Sizes and plans the engine does not model (input for U18 / QV-2)

The engine models the 50K size only at every firm. This is a factual list of what the firms sell today (or may sell) that has no engine plan. It does not recommend which to add.

| Firm | Sold today, not modeled | Unclear or not sold, not modeled |
|---|---|---|
| Apex | Unknown: catalog blocked (engine notes from the 2026-09-23 paste list 25K, 100K, 150K) | 5-Pack bundles, Legacy subscription line, Second Chance Eval-to-Live ($199, paste only) |
| TPT | Test to PRO 25K, 75K, 100K, 150K | PRO+ from a non-50K PRO; PRO+ Development 25K, 75K, 100K, 150K (invitation or placement, not sold) |
| Tradeify | Growth 25K, 100K, 150K; Select 25K, 100K, 150K; Select 50% Consistency Add-on at 25K, 50K, 100K, 150K; Lightning 25K, 100K, 150K | Select 300K (limited, hidden on homepage, price in conflict) |
| FundedNext | Rapid Pro 25K, 100K; Rapid Pro DLL Add-On 25K, 100K; Rapid Daily 25K, 100K; Flex 100K, 150K; Legacy 25K, 100K | Rapid (former) and Bolt (discontinued). Also: FNL:003 50K is modeled but marked Expired on the Labs page |
| Lucid | LucidPro 25K, 100K, 150K; LucidFlex 25K, 100K, 150K; LucidDaily 25K, 100K, 150K (4 configurations each); LucidDirect 25K, 100K, 150K; LucidMaxx 25K, 100K, 150K (invite-only) | LucidBlack 25K, 50K, 100K (labeled Legacy, sale status unknown) |
| MFFU | Rapid 25K, 100K, 150K; Rapid EOD 25K; Pro 100K, 150K; Builder 25K, 100K, 150K | Pro One-Day add-on (not on the current plan page); legacy Flex and Builder 25K No DLL (not sold); Perps (separate perpetuals product) |
| Topstep | Trading Combine 100K and 150K on all four paths (Standard or No Activation Fee, with or without DLL) and both XFA types (Standard, Consistency); Back2Funded reactivation (50K to 150K) | Labs drops #001 $25K Static, #002 $250K Freedom, #003 $3K, #004 $1.5K, #005 $6K Challenges (listed as past drops, availability behind login) |
| FTMO Futures | Growth 100K, 150K; Pro 100K, 150K | none |
| Alpha Futures | Zero 25K, 100K; Standard 100K, 150K; Advanced 100K, 150K; Direct Qualified 25K, 50K, 100K, 150K (no Direct variant) | none |
| E8 Futures | Signature 25K, 100K, 150K; Zero MAX 100K, 200K (80% and 100%); Zero Starter 100K, 200K (80% and 100%) | Free Trial (no futures-specific size or price) |

Values the engine models but that could not be confirmed today: Apex 50K EOD and Intraday prices, TPT 50K monthly subscription (170), and all Lucid non-Maxx 50K prices. Each rests on a 2026-09-23 user paste and is listed under Needs-paste pages.
