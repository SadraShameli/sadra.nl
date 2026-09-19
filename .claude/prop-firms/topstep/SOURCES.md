# `Topstep`: Source Ledger

## Discovery completeness

Topstep's help center publishes a genuine, working sitemap: `help.topstep.com/robots.txt` names `Sitemap: https://help.topstep.com/sitemap.xml` directly, and that sitemap resolves to a flat list of every collection and article URL on the site (no marketing-site redirect, unlike FundedNext's help center).

**56 of 56 sitemap articles were fetched and read in full.** Of those, 39 unique articles are actually cited across this tree's 6 files (listed below). The remaining 17 were independently re-read end to end on 2026-09-19 specifically to check each exclusion against the article's own body content, not its title (an earlier pass in this same session had mischaracterized 3 articles as out of scope; that mistake is preserved below rather than silently corrected, since it is exactly the kind of failure this discipline exists to catch). All 17 are legitimately out of scope for the reasons given:

- **TopstepX™ (6 articles)**: TopstepX™ itself, API Access, Commissions and Fees, Indicators, Quantower Connection Instructions, General Platform Troubleshooting. Platform features and third-party connection how-tos, not drawdown/eval/payout-rule content.
- **Trading Education (5 articles)**: Topstep Learning, How to identify the Futures Front Month Contract, Staying Outside the 2% Price Limit Zone, CME Velocity Logic, Topstep Trader Lingo Glossary. General trading-education content, not plan-specific rules.
- **Topstep FAQs, non-plan-specific (1 article)**: When and What Products Can I Trade? (trading-hours and permitted-products list, no drawdown/eval/payout figures).
- **Getting Started, non-plan-specific (3 articles)**: Getting Started with the Topstep Dashboard (platform tour; also documents a Reset Credit Bank mechanic — each Trading Combine rebill earns a Reset Credit good for 1 year — not currently reflected in `standard.md`/`consistency.md`'s own flat Reset Fee rows; flagged as a known gap, not fixed in this pass), Contact Support, Topstep Community. None state drawdown/eval/payout figures.
- **Payout Information (1 article)**: Funded Trader Tax Questions. Tax treatment, not a plan rule.
- **Trading Combine® (1 article)**: Practice Account. A separate, free, ungated $150K product, not a documented plan.

**A note on a correction made during this pass:** an earlier point in this same session mischaracterized 3 of the above-then-22 excluded articles: Topstep Labs (article 15520357) was claimed to be "mentioned once, contains no additional figures," which was false, it documents 5 fully-specified, separately-priced products now covered in `labs.md`; the Focused Trader Program (article 10551016) and Responsible Trading Program (article 13620045) were filed under a vague "general policy content" label that undersold their own concrete numeric parameters, now covered in `trader-programs.md`. A direct re-read of all 22 then-excluded articles (not just these 3) caught the mistake, confirmed the other 19 exclusions were accurate, and both gaps were closed in this same pass rather than left open. Two further supporting articles, Prohibited Conduct (10296582) and What is Responsible Trading? (10406542), were correctly out of scope for their own dedicated files but are now also cited as supporting sources inside `trader-programs.md`.

## Primary sources used in this tree

One row per primary-source document actually cited in `standard.md`, `consistency.md`, `pro-account.md`, `live.md`, `labs.md`, or `trader-programs.md`. All 39 rows below were fetched live via a Python `urllib.request`-based fetch against `help.topstep.com` on 2026-09-19 (the help center is not Cloudflare-blocked; no browser-relay workaround was needed for this firm). One additional data point, the Scaling Plan's Max Contracts table, was read directly from that article's own embedded chart image (not its body text) by fetching the image and reading it with a multimodal read, also on 2026-09-19.

| Source URL | Article's Own "Updated" Date | Fetched/Pasted On | Used In | Notes |
| --- | --- | --- | --- | --- |
| `https://help.topstep.com/en/articles/10290170-professional-behavior-at-topstep` | `2026-06-10` | `2026-09-19` | `live.md` | Professional Behavior at Topstep |
| `https://help.topstep.com/en/articles/10296582-prohibited-conduct` | `2026-09-11` | `2026-09-19` | `trader-programs.md` | Prohibited Conduct |
| `https://help.topstep.com/en/articles/10305426-prohibited-trading-strategies-at-topstep` | `2026-06-10` | `2026-09-19` | `consistency.md`, `trader-programs.md` | Prohibited Trading Strategies at Topstep |
| `https://help.topstep.com/en/articles/10406542-what-is-responsible-trading` | `2026-08-13` | `2026-09-19` | `trader-programs.md` | What is Responsible Trading? |
| `https://help.topstep.com/en/articles/10551016-what-is-the-focused-trader-program` | `2026-08-10` | `2026-09-19` | `trader-programs.md` | What is the Focused Trader Program? |
| `https://help.topstep.com/en/articles/10370307-reset-purchase-limits` | `2026-06-18` | `2026-09-19` | `consistency.md`, `standard.md` | Reset Purchase Limits |
| `https://help.topstep.com/en/articles/10490293-daily-loss-limit-in-the-trading-combine-and-express-funded-account` | `2026-06-30` | `2026-09-19` | `consistency.md`, `standard.md` | Daily Loss Limit in the Trading Combine and Express Funded Account |
| `https://help.topstep.com/en/articles/10657969-live-funded-account-parameters` | `2026-09-17` | `2026-09-19` | `live.md` | Live Funded Account Parameters |
| `https://help.topstep.com/en/articles/11177768-topstepx-live-performance-bonus` | `2026-07-01` | `2026-09-19` | `live.md` | TopstepX™ Live Performance Bonus (article now documents the bonus's own retirement) |
| `https://help.topstep.com/en/articles/11748475-dynamic-live-risk-expansion` | `2026-07-17` | `2026-09-19` | `live.md` | Dynamic Live Risk Expansion |
| `https://help.topstep.com/en/articles/12060405-back2funded-rules-guidelines-and-how-it-works` | `2026-08-14` | `2026-09-19` | `standard.md` | Back2Funded: Rules, Guidelines, and How It Works |
| `https://help.topstep.com/en/articles/12578731-how-idv-identity-verification-works` | `2026-07-21` | `2026-09-19` | `pro-account.md` | How IDV/Identity Verification Works |
| `https://help.topstep.com/en/articles/13350348-topstep-holiday-trading-hours` | `2026-09-18` | `2026-09-19` | `live.md`, `pro-account.md` | Topstep Holiday Trading Hours |
| `https://help.topstep.com/en/articles/13613539-risk-adjustments-high-risk-high-volatility` | `2026-09-17` | `2026-09-19` | `consistency.md`, `labs.md`, `pro-account.md`, `standard.md` | Risk Adjustments: High Risk/High Volatility |
| `https://help.topstep.com/en/articles/13620045-what-is-the-responsible-trading-program` | `2026-07-21` | `2026-09-19` | `trader-programs.md` | What is the Responsible Trading Program? |
| `https://help.topstep.com/en/articles/13747047-understanding-hedging` | `2026-07-27` | `2026-09-19` | `pro-account.md` | Understanding Hedging |
| `https://help.topstep.com/en/articles/13747178-live-funded-account-call-up-and-call-down-process` | `2026-08-11` | `2026-09-19` | `live.md` | Live Funded Account Call Up and Call Down Process |
| `https://help.topstep.com/en/articles/14289835-topstep-pricing-and-payment-questions` | `2026-07-20` | `2026-09-19` | `consistency.md`, `standard.md` | Topstep Pricing and Payment Questions |
| `https://help.topstep.com/en/articles/14645398-what-is-a-pro-account` | `2026-09-11` | `2026-09-19` | `pro-account.md` | What is a Pro Account? |
| `https://help.topstep.com/en/articles/15520357-topstep-labs` | `2026-09-18` | `2026-09-19` | `labs.md` | Topstep Labs |
| `https://help.topstep.com/en/articles/15764697-the-topstep-octagon` | `2026-09-03` | `2026-09-19` | `live.md` | The Topstep Octagon |
| `https://help.topstep.com/en/articles/8284099-topstep-program-overview` | `2026-09-10` | `2026-09-19` | `consistency.md`, `live.md`, `standard.md` | Topstep Program Overview |
| `https://help.topstep.com/en/articles/8284113-can-i-trade-forex-with-you` | `2026-06-17` | `2026-09-19` | `standard.md` | Can I trade Forex with You? |
| `https://help.topstep.com/en/articles/8284116-am-i-eligible-to-trade-with-topstep` | `2026-09-04` | `2026-09-19` | `consistency.md`, `live.md`, `pro-account.md`, `standard.md` | Am I Eligible to Trade with Topstep? |
| `https://help.topstep.com/en/articles/8284117-topstep-refund-policies` | `2026-09-11` | `2026-09-19` | `labs.md`, `standard.md` | Topstep® Refund Policies |
| `https://help.topstep.com/en/articles/8284120-level-1-and-level-2-market-data` | `2026-06-18` | `2026-09-19` | `pro-account.md` | Level 1 and Level 2 Market Data |
| `https://help.topstep.com/en/articles/8284121-trading-combine-subscriptions` | `2026-09-04` | `2026-09-19` | `consistency.md`, `standard.md` | Trading Combine Subscriptions |
| `https://help.topstep.com/en/articles/8284128-what-is-a-reset` | `2026-06-18` | `2026-09-19` | `consistency.md` | What is a Reset? |
| `https://help.topstep.com/en/articles/8284197-trading-combine-parameters` | `2026-09-10` | `2026-09-19` | `consistency.md`, `standard.md` | Trading Combine® Parameters |
| `https://help.topstep.com/en/articles/8284199-new-to-topstep-start-here` | `2026-07-20` | `2026-09-19` | `consistency.md` | New to Topstep? Start here. |
| `https://help.topstep.com/en/articles/8284204-what-is-the-maximum-loss-limit` | `2026-09-18` | `2026-09-19` | `consistency.md`, `live.md`, `pro-account.md`, `standard.md` | What is the Maximum Loss Limit? |
| `https://help.topstep.com/en/articles/8284208-consistency-at-topstep` | `2026-09-17` | `2026-09-19` | `consistency.md`, `standard.md` | Consistency at Topstep |
| `https://help.topstep.com/en/articles/8284211-economic-releases` | `2026-09-10` | `2026-09-19` | `live.md`, `pro-account.md` | Economic Releases |
| `https://help.topstep.com/en/articles/8284215-express-funded-account-parameters` | `2026-08-05` | `2026-09-19` | `consistency.md`, `standard.md` | Express Funded Account™ Parameters |
| `https://help.topstep.com/en/articles/8284217-express-funded-account-activation` | `2026-08-24` | `2026-09-19` | `consistency.md`, `standard.md` | Express Funded Account™ Activation |
| `https://help.topstep.com/en/articles/8284223-what-is-the-scaling-plan` | `2026-07-16` | `2026-09-19` | `consistency.md`, `pro-account.md`, `standard.md` | What is the Scaling Plan? (Max Contracts figures read from this article's own embedded chart image, not its body text) |
| `https://help.topstep.com/en/articles/8284229-what-are-the-costs-in-the-live-funded-account` | `2026-06-16` | `2026-09-19` | `live.md` | What are the costs in the Live Funded Account? |
| `https://help.topstep.com/en/articles/8284233-topstep-payout-policy` | `2026-09-03` | `2026-09-19` | `consistency.md`, `standard.md` | Topstep Payout Policy |
| `https://help.topstep.com/en/articles/8765442-order-types-fills-and-slippage` | `2026-09-16` | `2026-09-19` | `consistency.md` | Order Types, Fills, and Slippage |
