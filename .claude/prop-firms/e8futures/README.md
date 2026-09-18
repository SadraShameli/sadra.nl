# E8 Futures Plans Reference

**Firm website:** https://e8futures.com
**Last Verified:** 2026-09-18
**Last Updated:** 2026-09-18
**Source:** see each plan's own file for plan-specific claims; the Firm-Wide Rules below are drawn from help-center articles on `helpfutures.e8markets.com` that explicitly state a firm-wide or cross-product scope. All sources were fetched by the user from their own browser session (Cloudflare blocked every direct/automated fetch attempt this session) on 2026-09-18 and handed back as a combined JSON dump, then cleaned and split into one file per article. See SOURCES.md.

## Overview

E8 Futures is the Futures-market line of E8 Markets, a simulated ("SimFi™") trading-skills platform established in 2021. E8 Markets' own help center (`helpfutures.e8markets.com`) actually covers the firm's entire product catalogue, not just Futures: per its own "All product overviews" article, E8 offers four single-phase ("1-Step") challenge products, E8 One, E8 Zero, E8 Pro, and E8 Signature, and only two of them are Futures products. **E8 Zero** is Futures-only. **E8 Signature** spans Forex, Crypto, and Futures, and this tree documents its Futures variant specifically ("E8 Signature Futures"). **E8 One** and **E8 Pro** are Forex and Perpetual-Futures (crypto) products only, explicitly not CME futures, and are out of scope for this tree: see Documentation Scope.

Both documented plans share the same shape: purchase a SimFi™ Challenge account, pass it by hitting a profit target under a set of guardrails, and advance to a SimFi™ Performance account, the final, payout-eligible, still-simulated stage. Neither plan has a live or broker-funded stage: see each plan file's own Live Transition section.

## Plans

- **[E8 Signature Futures](signature.md)**: 4 sizes ($25K/$50K/$100K/$150K), EOD Dynamic Drawdown, 35% Best Day Rule gates payout eligibility in the Performance stage, on-demand payouts (no fixed schedule) capped by a payout table that rises with payout count, 80% profit split, 5 concurrent Performance accounts, 5-payout lifetime cap per account.
- **[E8 Zero](zero.md)**: 3 sizes ($50K/$100K/$200K), sold as Starter or Max tiers at either an 80% or 100% payout share (4 purchasable variants). EOD Dynamic Drawdown never locks during the Challenge stage (a documented exception unique to this plan). No consistency rule, no daily loss limit, and no minimum-profitable-days requirement once funded; only a per-cycle payout cap and a 5-payout lifetime cap. 3 concurrent Performance accounts.

## Live Accounts

Not applicable: no plan documented in this tree has a live or broker-funded stage. Every source read this pass, across both plans, describes the SimFi™ Performance account as the final stage; see each plan file's own Live Transition section for the specific sources.

## Firm-Wide Rules

Confirmed independently in both `signature.md` and `zero.md`'s own cited sources unless noted otherwise:

- **Inactivity: 7 consecutive days without a placed-and-closed trade closes a Futures account**, per "Is there any inactivity rule?" (confirmed identically in both plan files, and independently restated inside the Signature and Zero product articles themselves). The same source states a *different* 60-day figure applies to E8's Forex/Crypto accounts: do not use that figure for Futures.
- **Bots, AI tools, and fully-or-semi-automated trading are prohibited outright** (not "allowed with conditions"), per "Trading Policies and Prohibited Trading Strategies." HFT is explicitly defined in the same article as more than 300 trades per day.
- **Hedging across multiple accounts, even a trader's own multiple accounts, is strictly prohibited**, per the same Trading Policies article and "Available Trading platforms for Futures." Futures accounts run on a netting system (an opposing same-instrument position automatically cancels out, rather than being held open as an offsetting hedge), so this rule specifically targets cross-account hedging, not a same-account mechanic.
- **Copy trading is allowed only across a single trader's own accounts** (Challenge, Performance, or personal): never with another user's accounts, no signal services, no team trading. Stated consistently across at least four separate articles ("Can I copy trades or trade as a team?," the Signature article, the Zero article, and the Trading Policies article).
- **Tick Scalping rule: a minimum of 50% of all profits (not trade count) must come from trades held 10 seconds or longer**, per "Trading Policies and Prohibited Trading Strategies." This is a one-part, profit-only rule: do not confuse it with a two-part "50% of trades AND 50% of profit" shape used by some other firms.
- **Front Month Contract requirement: traders must always trade the contract with the highest volume/liquidity**; trading the wrong month contract can result in account termination or profit deduction, per "Stop Trading the Wrong Contract Month," which also gives the full month-code table (H=March, M=June, N=July, Q=August, U=September, V=October, X=November, Z=December, F=January, G=February, J=April, K=May).
- **Restricted countries (Futures-specific list, distinct from E8's Classic-Markets/Perpetuals list)**: a substantial named list spanning roughly 60 countries (Afghanistan, Albania, Algeria, Angola, Antarctica, Bahamas, Barbados, Belarus, Bosnia & Herzegovina, Botswana, Bulgaria, Burkina Faso, Myanmar, Burundi, Cambodia, Cameroon, Central African Republic, Chad, China, Congo, Côte d'Ivoire, Croatia, Cuba, Democratic Republic of Congo, Djibouti, Ethiopia, Ghana, Gibraltar, Guinea-Bissau, Haiti, Iceland, Indonesia, Iran, Iraq, Jamaica, Jordan, Kenya, Kosovo, Laos, Lebanon, Lesotho, Liberia, Libya, Macedonia, Malawi, Mali, Mauritius, Mongolia, Montenegro, Mozambique, Namibia, Nicaragua, Nigeria, North Korea, Pakistan, Palestine, Panama, Papua New Guinea, Philippines, Qatar, Romania, Russia, Rwanda, Senegal, Serbia, Sierra Leone, Slovenia, Somalia, South Africa, South Sudan, Sri Lanka, Sudan, Syria, Tajikistan, Tanzania, Timor-Leste, Trinidad and Tobago, Tunisia, Turkey, Uganda, Ukraine, United Arab Emirates, Venezuela, Vietnam, Yemen, Zambia, Zimbabwe, and Crimea), per "Accepted Countries." Country is determined by the document provided during KYC, not current physical location. Do not use E8's separate, shorter "Classic Markets + Perpetuals" list for a Futures context: the two lists differ.
- **KYC is mandatory before any Challenge access or payout**, via third-party provider Veriff (automated, minutes), plus a manual secondary re-check within 24 hours after passing the Challenge, per "Is verification required?" All users must sign the ESPA (Educational Simulation Participant Agreement, replacing the older E8 Trader Agreement). Company/business-name accounts are not accepted: all accounts are personal; a KYB-style "Contractor" designation is selected only at payout time, via the payout processor, not by opening a separate business account.
- **Single-user-profile policy**: one account holder may hold only one E8X profile; creating multiple profiles across different emails is a Terms violation, independent of, and in addition to, the per-plan Max Active/Concurrent Accounts limits. Stated identically across at least three articles.
- **Account reset: after any failure, a 10% discount is available to restart from the Challenge phase at the same size and settings, valid for 7 days after the failure**, per "Account reset." (A separate, closed/legacy promotion, the "GIBBS" discount code, offered its own free-reset mechanic to traders who purchased with that code before April 20, 2026 and still purchase at least once every 30 days with it; that promotion is not open to new customers and is not a standing rule: see Documentation Scope.)
- **Standing discount code "E8" is always available** at checkout, per "Are there currently any discounts?": the article does not restate a specific percentage in the source read this pass; do not assume any particular figure without re-confirming it directly (an engine code comment claims 25%/$160→$120, but that specific figure was not independently corroborated by any source read this pass).
- **Refunds**: a full refund of the purchase fee is available only if the Challenge account has zero trading activity and is within 30 days of purchase; once trading begins, the purchase is non-refundable. Cryptocurrency purchases are never refundable (AML policy), even with zero activity. Chargebacks/payment disputes are themselves a Terms violation and can result in account termination, payout cancellation, and a permanent ban. Per "Refund Policy."
- **Platform: Tradovate is the only supported trading platform for both Futures products**, connectable to TradingView at no extra cost once the trader has logged into Tradovate directly and accepted its own agreements first. Per "Available Trading platforms for Futures," "How can I change my trading platform?," and the two dedicated Tradovate/TradingView setup articles. Market data for Futures products is sourced directly from CME, per "What broker do I trade with?"
- **Approved instruments and fees**: CME Equity, FX, Agricultural, and CBOT Financial futures, plus NYMEX and COMEX futures: a full instrument/commission/tick-size table is maintained below. No EUREX-listed instruments appear anywhere in the sourced tables (unlike some other firms in this tree). Interest-rate futures (ZT/ZF/ZN/ZB/UB/TN/ZQ) appear with margin figures in "Max. available Contract Sizes" but have no corresponding commission/tick-size row in "Instrument list and trading hours" or "Tick size and profit per tick Calculation": their commission and tick size are Unconfirmed, not zero.
- **Payouts are processed through one of three third-party processors**: WorkMarket, Rise, or Aeropay (US-only, direct bank-to-bank): selected by the trader at request time, subject to each processor's own country/KYC eligibility. E8 charges no commission on payouts, though the processors may charge their own fees. Per "Everything about Payouts," median time from request to E8's own approval is 11 hours, and median time to funds arriving is 24 hours from request, though the full process can take up to 5 business days depending on onboarding and processor review. Independent Contractor tax treatment applies (1099 for US residents via the processor, W-8 for international traders), per "Tax information."
- **E8 Markets is not a broker, does not accept deposits, and does not manage funds or trade on a client's behalf**: all accounts are simulated/demo, trading real market data without real capital at risk, per "Is my account Live or Demo?" and "What is E8 Markets? - Why us?"

### Approved Futures Instruments, Commissions, and Tick Sizes

All trading hours below are Sunday-Friday except CBOT Agricultural futures (Monday-Friday), all in CT, per "Instrument list and trading hours." Permitted trading window firm-wide is 17:00-15:10 CT; all open positions are force-closed daily at 15:10 CT (no overnight holding on either Futures plan), per "Can I hold positions overnight?"

| Symbol | Instrument | Commission (RT) | Tick Size | Profit/Tick |
| --- | --- | --- | --- | --- |
| EMD | E-mini S&P MidCap 400 | $2.58 + $0.52 + $0.38 | 0.1 | $10.00 |
| ES | E-mini S&P 500 | $2.58 + $2.80 + $0.38 | 0.25 | $12.50 |
| MES | Micro E-mini S&P | $0.78 + $0.74 + $0.38 | 0.25 | $1.25 |
| NKD | Nikkei | $2.58 + $2.80 + $0.38 | 5 | $25.00 |
| NQ | E-mini NASDAQ 100 | $2.58 + $2.80 + $0.38 | 0.25 | $5.00 |
| MNQ | Micro E-mini NASDAQ 100 | $0.78 + $0.74 + $0.38 | 0.25 | $0.50 |
| RTY | E-mini Russell 2000 | $2.58 + $2.80 + $0.38 | 0.1 | $5.00 |
| M2K | Micro E-mini Russell 2000 | $0.78 + $0.74 + $0.38 | 0.1 | $0.50 |
| MBT | Micro E-mini Bitcoin | $0.78 + $2.04 + $0.38 | 5 | $0.50 |
| MET | Micro E-mini Ether | $0.78 + $2.04 + $0.38 | 0.05 | $0.50 |
| 6A | Australian $ | $2.58 + $3.24 + $0.38 | 0.0001 | $10.00 |
| M6A | Micro AUD/USD | $0.78 + $0.52 + $0.38 | 0.0001 | $1.00 |
| 6B | British Pound | $2.58 + $3.24 + $0.38 | 0.0001 | $6.25 |
| M6B | Micro British Pound | $0.78 + $0.52 + $0.38 | 0.0001 | $0.63 |
| 6C | Canadian $ | $2.58 + $3.24 + $0.38 | Unconfirmed | Unconfirmed |
| 6E | Euro FX | $2.58 + $3.24 + $0.38 | 0.0001 | $12.50 |
| 7E | E-mini Euro FX | Unconfirmed | 0.0001 | $6.25 |
| M6E | Micro Euro | $0.78 + $0.52 + $0.38 | 0.0001 | $1.25 |
| MCD | Micro CAD/USD | Unconfirmed | 0.0001 | $1.00 |
| 6J | Japanese Yen | $2.58 + $3.24 + $0.38 | 0.0000001 | $12.50 |
| 6S | Swiss Franc | $2.58 + $3.24 + $0.38 | 0.0001 | $12.50 |
| 6M | Mexican Peso | $2.58 + $3.24 + $0.38 | 0.00005 | $5.00 |
| 6N | New Zealand $ | $2.58 + $3.24 + $0.38 | 0.0001 | $10.00 |
| LE | Live Cattle | $2.58 + $4.24 + $0.38 | 0.025 | $10.00 |
| HE | Lean Hogs | $2.58 + $4.24 + $0.38 | 0.025 | $10.00 |
| GF | Feeder Cattle | Unconfirmed | Unconfirmed | Unconfirmed |
| CL | Crude Oil | $2.58 + $3.04 + $0.38 | 0.01 | $10.00 |
| MCL | Micro Crude Oil | $0.78 + $1.04 + $0.38 | 0.01 | $1.00 |
| QM | E-mini Crude Oil | $2.58 + $2.44 + $0.38 | 0.025 | $12.50 |
| NG | Natural Gas | $2.58 + $3.24 + $0.38 | 0.001 | $10.00 |
| QG | E-mini Natural Gas | $2.58 + $1.04 + $0.38 | 0.005 | $12.50 |
| RB | RBOB Gasoline | $2.58 + $3.04 + $0.38 | 0.0001 | $4.20 |
| HO | Heating Oil | $2.58 + $4.24 + $0.38 | 0.0001 | $4.20 |
| ZC | Corn | $2.58 + $4.24 + $0.38 | 0.25 | $12.50 |
| ZW | Wheat | $2.58 + $4.24 + $0.38 | 0.25 | $12.50 |
| ZS | Soybeans | $2.58 + $4.24 + $0.38 | 0.25 | $12.50 |
| ZM | Soybean Meal | Unconfirmed | 0.1 | $10.00 |
| ZL | Soybean Oil | $2.58 + $4.24 + $0.38 | 0.01 | $6.00 |
| YM | Mini-DOW | $2.58 + $2.80 + $0.38 | 1 | $5.00 |
| MYM | Micro Mini-DOW | $0.78 + $0.74 + $0.38 | 1 | $0.50 |
| GC | Gold | $2.58 + $3.24 + $0.38 | 0.1 | $10.00 |
| MGC | Micro Gold | $0.78 + $1.24 + $0.38 | 0.1 | $1.00 |
| SI | Silver | $2.58 + $3.24 + $0.38 | 0.005 | $25.00 |
| HG | Copper | $2.58 + $3.24 + $0.38 | 0.0005 | $12.50 |
| PL | Platinum | $2.58 + $3.24 + $0.38 | 0.1 | $10.00 |
| PA | Palladium | $2.58 + $3.24 + $0.38 | 0.1 | $10.00 |
| ZT | 2-Year Note | Unconfirmed | Unconfirmed | Unconfirmed |
| ZF | 5-Year Note | Unconfirmed | Unconfirmed | Unconfirmed |
| ZN | 10-Year Note | Unconfirmed | Unconfirmed | Unconfirmed |
| ZB | 30-Year Bond | Unconfirmed | Unconfirmed | Unconfirmed |
| UB | Ultra-Bond | Unconfirmed | Unconfirmed | Unconfirmed |
| TN | Ultra-Note | Unconfirmed | Unconfirmed | Unconfirmed |
| ZQ | 30 Day Fed | Unconfirmed | Unconfirmed | Unconfirmed |

Commission column is broken out as stated in the source: Commission (RT) + Exchange and NFA (RT) + Clearing (RT). "6C," "7E," "MCD," "GF," and "ZM" each had at least one figure missing from one of the two commission/tick-size source tables (the two tables do not list exactly the same instrument set): treat the missing cells as Unconfirmed, not zero.

## Key Cross-Plan Differences

| Aspect | E8 Signature Futures | E8 Zero |
| --- | --- | --- |
| Account Sizes | $25K / $50K / $100K / $150K | $50K / $100K / $200K |
| Eval Fee | Unconfirmed | Unconfirmed |
| Profit Target | $1,500 / $3,000 / $6,000 / $9,000 | $3,000 / $6,500 / $13,500 |
| Eval Consistency | None (Challenge stage) | 40% Best Day Rule (Challenge stage only) |
| Min Eval Days | Unconfirmed | None stated ("No minimum Trading days") |
| Funded Drawdown Type | EOD Dynamic Drawdown, locks at Starting Balance on profit-trigger or first payout | EOD Dynamic Drawdown, same lock mechanic funded-side, but explicitly does **not** lock during the Challenge stage (a documented exception unique to Zero) |
| DLL (Funded) | Daily Pause (soft): 2% of starting balance, fixed $ amount | None |
| Sim Payout Split | 80% flat | 80% or 100%, selected at purchase |
| Max Funded Accounts | 5 per household | 3 per household |
| Inactivity Rule | 7 days | 7 days |
| Lifetime Sim Payouts | 5 payouts, then free replacement Challenge | 5 payouts, then free replacement Challenge |
| Consistency on Payouts | 35% Best Day Rule + 5 profitable days between payouts (not first) | None |
| Live Transition | None: SimFi Performance is the final stage | None: SimFi Performance is the final stage |

Every row traces back to the matching row in each plan's own file; where a plan file marks a figure Unconfirmed or computed, this table repeats that status rather than asserting a cleaner-looking number.

## Documentation Scope

**Explicitly out of scope, not documented in this tree:**

- **E8 One and E8 Pro**: per "All product overviews," these are Forex and Perpetual-Futures (crypto) products, not CME futures. E8 One's on-demand payout rules (40% Best Day, net profit > 50% of daily drawdown) and E8 Pro's static-drawdown/no-best-day model are genuinely different products with their own separate articles; do not assume any figure in this tree applies to them.
- **E8's "Classic Markets + Perpetuals" restricted-country list**: shorter than, and different from, the Futures list used above; do not conflate the two.
- **Affiliate program terms** (commission tiers, payout minimums/cadence, advertising restrictions) and the **Friends referral program**: business/marketing terms, not trading rules; five dedicated articles exist but were read only to confirm they contain no trading-rule content.
- **Hyper Cup Tournament** and any other time-boxed competition: a separate, one-shot simulated competition with its own $100K account, 5% daily/10% static drawdown, and prize-pool rules, structurally unrelated to the core Challenge/Performance products, consistent with how this tree treats other firms' competitions (see Tradeify's Grand Cup/PTL precedent).
- **Free trial accounts**: explicitly stated to be Classic-Markets-only ("no option to test Futures challenges with a free trial" per "Can I try E8 Markets for Free?"); not available for either plan in this tree.
- **The "GIBBS" discount promotion**: a closed/legacy promotion (new signups ended April 20, 2026), kept alive only for traders who already opted in and keep purchasing monthly; not a standing rule for new customers, mentioned above only for completeness.
- **Certificates, 2FA/account-security setup, crypto-payment mechanics, general company background (Discord, data-protection policy, proprietary-technology claims)**: read in full, contain no trading rules, not built out into their own sections.
- **`help.e8markets.com`** (the general E8 Markets domain, distinct from `helpfutures.e8markets.com`) was not fetched this pass. Its sitemap was requested but not yet supplied; every source used in this tree comes from the futures-specific help center only, which appears to be a complete, self-contained help center for both Futures products (it hosts its own copies of KYC, refund, inactivity, and account-limit articles rather than deferring to the general domain). If a future pass fetches `help.e8markets.com`, diff it against this tree's SOURCES.md before assuming nothing new applies to Futures specifically.
- **A genuine, unresolved source contradiction**: two articles ("Available Trading platforms for Futures," "How can I change my trading platform?") both state E8 Zero Futures is "currently the only available product for this market" / that only one platform is offered "for the E8 Zero Futures product," which reads as though E8 Signature Futures does not exist. This tree treats Signature Futures as real (per the weight of evidence: a full dedicated rules article, a dedicated payout-caps article, and explicit name-checks in two other articles), but the contradiction itself is not resolved: see `signature.md`'s own Not Confirmed section.
- **Engine/doc mismatches found this pass, not fixed here** (this skill does not edit the simulator; reported per its own instructions): `E8Futures.ts`'s `buildZeroPlan` applies the same lock-enabled drawdown to both the Challenge and Performance stages, but the source states the lock does not apply during Zero's Challenge stage: the engine likely needs a separate `fundedDrawdown` override (a field `Plan.ts` already supports) to match. Signature's `minPayoutRequest: dollars(0.01)` disagrees with the confirmed real minimum of $100 net / $125 gross. Signature's `minDaysAfterPassForPayout: 3` reflects an older, Wayback-archived source's framing; current live sources state this 3-day figure is not a separate rule, just an emergent property of the 35% Best Day Rule's math.
