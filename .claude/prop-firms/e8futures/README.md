# E8 Futures Plans Reference

**Firm website:** <https://e8futures.com>
**Last Verified:** 2026-09-19
**Last Updated:** 2026-09-19
**Source:** see each plan's own file for plan-specific claims; the Firm-Wide Rules below are drawn from help-center articles on `helpfutures.e8markets.com` that explicitly state a firm-wide or cross-product scope. All sources were fetched by the user from their own browser session (Cloudflare blocked every direct/automated fetch attempt this session) on 2026-09-18 and handed back as a combined JSON dump, then cleaned and split into one file per article. See SOURCES.md.

## Overview

E8 Futures is the Futures-market line of E8 Markets, a simulated ("SimFi™") trading-skills platform established in 2021. E8 Markets' own help center (`helpfutures.e8markets.com`) actually covers the firm's entire product catalogue, not just Futures: per its own "All product overviews" article, E8 offers four single-phase ("1-Step") challenge products, E8 One, E8 Zero, E8 Pro, and E8 Signature, and only two of them are Futures products. **E8 Zero** is Futures-only. **E8 Signature** spans Forex, Crypto, and Futures, and this tree documents its Futures variant specifically ("E8 Signature Futures"). **E8 One** and **E8 Pro** are Forex and Perpetual-Futures (crypto) products only, explicitly not CME futures, and are out of scope for this tree: see Documentation Scope.

Both documented plans share the same shape: purchase a SimFi™ Challenge account, pass it by hitting a profit target under a set of guardrails, and advance to a SimFi™ Performance account, the final, payout-eligible, still-simulated stage. Neither plan has a live or broker-funded stage: see each plan file's own Live Transition section.

- **New Performance/Sim Funded credentials arrive within 30-90 minutes**: "You will receive a new account with new credentials, usually within 30-90 minutes after finishing your Challenge."

## Plans

- **[E8 Signature Futures](signature.md)**: 4 sizes ($25K/$50K/$100K/$150K), EOD Dynamic Drawdown, 35% Best Day Rule gates payout eligibility in the Performance stage, on-demand payouts (no fixed schedule) capped by a payout table that rises with payout count, 80% profit split, 5 concurrent Performance accounts, 5-payout lifetime cap per account.
- **[E8 Zero](zero.md)**: 3 sizes ($50K/$100K/$200K), sold as Starter or Max tiers at either an 80% or 100% payout share (4 purchasable variants). EOD Dynamic Drawdown never locks during the Challenge stage (a documented exception unique to this plan). No consistency rule, no daily loss limit, and no minimum-profitable-days requirement once funded; only a per-cycle payout cap and a 5-payout lifetime cap. 3 concurrent Performance accounts.

## Live Accounts

Not applicable: no plan documented in this tree has a live or broker-funded stage. Every source read this pass, across both plans, describes the SimFi™ Performance account as the final stage; see each plan file's own Live Transition section for the specific sources.

## Firm-Wide Rules

Sourced from help-center articles whose own text states a firm-wide or cross-product scope, and documented here once rather than repeated per plan (both plan files' Overviews say exactly that). Some of these articles are not in either plan file's own Sources footer, so do not read the bullets below as facts each plan file independently corroborates:

- **Inactivity: 7 consecutive days without a placed-and-closed trade closes a Futures account**, per "Is there any inactivity rule?" (confirmed identically in both plan files, and independently restated inside the Signature and Zero product articles themselves). The same source states a _different_ 60-day figure applies to E8's Forex/Crypto accounts: do not use that figure for Futures. Note an unresolved inconsistency in E8's own materials: the general "Refund policy" article restates a 60-day rule without scoping it away from Futures ("after 60 days of inactivity, the account is disabled and there is no entitlement to a refund"). This tree treats the dedicated inactivity article's 7-day/Futures split as authoritative and flags the refund article's wording rather than blending them.
- **Bots, AI tools, and fully-or-semi-automated trading are prohibited outright** (not "allowed with conditions"), per "Trading Policies and Prohibited Trading Strategies." HFT is explicitly defined in the same article as more than 300 trades per day.
- **Hedging across multiple accounts, even a trader's own multiple accounts, is strictly prohibited**, per the same Trading Policies article and "Available Trading platforms for Futures." Futures accounts run on a netting system (an opposing same-instrument position automatically cancels out, rather than being held open as an offsetting hedge), so this rule specifically targets cross-account hedging, not a same-account mechanic.
- **Copy trading is allowed only across a single trader's own accounts** (Challenge, Performance, or personal): never with another user's accounts, no signal services, no team trading. Stated consistently across at least four separate articles ("Can I copy trades or trade as a team?," the Signature article, the Zero article, and the Trading Policies article).
- **Tick Scalping rule: a minimum of 50% of all profits (not trade count) must come from trades held 10 seconds or longer**, per "Trading Policies and Prohibited Trading Strategies." This is a one-part, profit-only rule: do not confuse it with a two-part "50% of trades AND 50% of profit" shape used by some other firms.
- **Front Month Contract requirement: traders must always trade the contract with the highest volume/liquidity**; trading the wrong month contract can result in account termination or profit deduction, per "Stop Trading the Wrong Contract Month," which also gives the full month-code table (H=March, M=June, N=July, Q=August, U=September, V=October, X=November, Z=December, F=January, G=February, J=April, K=May).
- **Restricted countries (Futures-specific list, distinct from E8's Classic-Markets/Perpetuals list)**: a substantial named list of 88 countries (Afghanistan, Albania, Algeria, Angola, Antarctica, Bahamas, Barbados, Belarus, Bosnia & Herzegovina, Botswana, Bulgaria, Burkina Faso, Myanmar, Burundi, Cambodia, Cameroon, Central African Republic, Chad, China, Congo, Côte d'Ivoire, Croatia, Cuba, Democratic Republic of Congo, Djibouti, Ethiopia, Ghana, Gibraltar, Guinea-Bissau, Haiti, Iceland, Indonesia, Iran, Iraq, Jamaica, Jordan, Kenya, Kosovo, Laos, Lebanon, Lesotho, Liberia, Libya, Macedonia, Malawi, Mali, Mauritius, Mongolia, Montenegro, Mozambique, Namibia, Nicaragua, Nigeria, North Korea, Pakistan, Palestine, Panama, Papua New Guinea, Philippines, Qatar, Romania, Russia, Rwanda, Senegal, Serbia, Sierra Leone, Slovenia, Somalia, South Africa, South Sudan, Sri Lanka, Sudan, Syria, Tajikistan, Tanzania, Timor-Leste, Trinidad and Tobago, Tunisia, Turkey, Uganda, Ukraine, United Arab Emirates, Venezuela, Vietnam, Yemen, Zambia, Zimbabwe, and Crimea), per "Accepted Countries." Country is determined by the document provided during KYC, not current physical location. Do not use E8's separate, shorter "Classic Markets + Perpetuals" list for a Futures context: the two lists differ.
- **KYC is strongly recommended before purchase and required for full access**, via third-party provider Veriff (automated, minutes), plus a manual secondary re-check within 24 hours after passing the Challenge, per "Is verification required?" The same personal information must also match what is on file with payout processors Riseworks and WorkMarket, per "Tax information." The article frames it as partial restrictions rather than an absolute gate: without it a trader "might not be able to: See all available products in checkout, See all trading platforms in checkout, Access your challenge credentials after your purchase, Receive the Performance account after passing your challenge, Use our Free Trial." All users must sign the ESPA (Educational Simulation Participant Agreement, replacing the older E8 Trader Agreement). Company/business-name accounts are not accepted: all accounts are personal; a KYB-style "Contractor" designation is selected only at payout time, via the payout processor, not by opening a separate business account.
- **Single-user-profile policy**: one account holder may hold only one E8X profile; creating multiple profiles across different emails is a Terms violation, independent of, and in addition to, the per-plan Max Active/Concurrent Accounts limits. Stated identically across at least three articles.
- **Account reset: after any failure, a 10% discount is available to restart from the Challenge phase at the same size and settings, valid for 7 days after the failure**, per "Account reset." (A separate, closed/legacy promotion, the "GIBBS" discount code, offered its own free-reset mechanic to traders who purchased with that code before April 20, 2026 and still purchase at least once every 30 days with it; that promotion is not open to new customers and is not a standing rule: see Documentation Scope.)
- **Standing discount code "E8" is always available** at checkout, per "Are there currently any discounts?": the article does not restate a specific percentage in the source read this pass; do not assume any particular figure without re-confirming it directly (an engine code comment claims 25%/$160→$120, but that specific figure was not independently corroborated by any source read this pass).
- **Refunds: a real, unresolved contradiction between two of E8's own binding sources, not silently reconciled.** The help center's "Refund Policy" article states a full refund of the purchase fee is available if the Challenge account has zero trading activity and is within 30 days of purchase; once trading begins, the purchase is non-refundable. The Terms of Service instead state, in Section 4.2, that fees are non-refundable "under any circumstance" the moment platform access is "activated," because "the educational services are deemed fully delivered" on activation alone, regardless of whether a trade was ever placed. The Terms of Service's own list of non-refundable triggers includes "Inability to access services due to failed KYC verification or geographic restriction," a scenario where the trader plainly never traded at all. The Terms of Service is the signed, binding agreement; the help-center article is presentational. Do not assume a zero-activity, within-30-days purchase is refundable on the strength of the help-center article alone. Approved refunds, where granted, arrive within 2-5 business days via the original payment method. Cryptocurrency purchases are never refundable (AML policy), even with zero activity. Chargebacks/payment disputes are themselves a Terms violation and can result in account termination, payout cancellation, and a permanent ban. Per "Refund Policy" and the Terms of Service, Section 4.2.
- **Platform: Tradovate is the only supported trading platform for both Futures products**, connectable to TradingView at no extra cost once the trader has logged into Tradovate directly and accepted its own agreements first. Per "Available Trading platforms for Futures," "How can I change my trading platform?," and the two dedicated Tradovate/TradingView setup articles. Market data for Futures products is sourced directly from CME, per "What broker do I trade with?"
- **Approved instruments and fees**: CME Equity, FX, Agricultural, and CBOT Financial futures, plus NYMEX and COMEX futures: a full instrument/commission/tick-size table is maintained below. No EUREX-listed instruments appear anywhere in the sourced tables (unlike some other firms in this tree). Interest-rate futures (ZT/ZF/ZN/ZB/UB/TN/ZQ) appear with margin figures in "Max. available Contract Sizes" but have no corresponding commission/tick-size row in "Instrument list and trading hours" or "Tick size and profit per tick Calculation": their commission and tick size are Unconfirmed, not zero.
- **Payouts are processed through one of three third-party processors**: WorkMarket, Rise, or Aeropay (US-only, direct bank-to-bank): selected by the trader at request time, subject to each processor's own country/KYC eligibility. E8 charges no commission on payouts, though the processors may charge their own fees. Per "Everything about Payouts," median time from request to E8's own approval is 11 hours, and median time to funds arriving is 24 hours from request, though the full process can take up to 5 business days depending on onboarding and processor review. Payouts are not processed at all over the weekend, so a weekend request adds to the timeline. Independent Contractor tax treatment applies (1099 for US residents via the processor, W-8 for international traders); 1099s are generally issued by January 31 for the prior tax year, per "Tax information." **A payout sent to an incorrectly-provided wallet address is forfeited by the trader**: "If you provide incorrect wallet information and the payment has been made, the payment will be deemed forfeited by you due to the provision of incorrect account information," and E8 "is not liable for any incorrect money transactions in case you have provided wrong wallet or banking information." Per the Terms of Service, Section 5.2.
- **Minimum age is 18**: "you represent and warrant that you are at least eighteen (18) years of age, or the legal age of majority in your jurisdiction," per the Terms of Service, Section 1.2. The Privacy Policy separately states a lower 16-and-older figure ("Participation in our Services is limited to individuals of 16 years old or older"), an internal inconsistency in E8's own documents; the Terms of Service is the document actually governing account eligibility, so 18 is treated as the binding figure here.
- **Public criticism of E8 is a contractual violation, enforceable by account termination.** "Posting, publishing, or sharing defamatory, misleading, or harmful content about E8, its personnel, users, partners, or technology" is prohibited, per Terms of Service Section 9.1(h); a violation lets E8 "suspend or terminate your account" and "invalidate your performance data and deny any pending or future rewards" (Section 9.2). Separately, "conduct deemed to damage E8's operations, reputation, or legal standing" is its own termination trigger (Section 12.2(e)).
- **Disputes go to mandatory binding AAA arbitration, with a class-action and jury-trial waiver, unless the trader opts out within 30 days.** "Any dispute, claim, or controversy between you and E8 arising out of or relating to these Terms or your use of the Platform... shall be resolved by binding arbitration administered by the American Arbitration Association (AAA) in accordance with its Commercial Arbitration Rules," seated in Dallas County, Texas, under Texas law. A trader "can elect to reject the agreement to arbitrate by sending us a written opt-out notice... within thirty (30) days following the date you first agree to these terms." Per the Terms of Service, Section 15.
- **E8 Markets is not a broker, does not accept deposits, and does not manage funds or trade on a client's behalf**: all accounts are simulated/demo, trading real market data without real capital at risk, per "Is my account Live or Demo?" and "What is E8 Markets? - Why us?"

### Approved Futures Instruments, Commissions, and Tick Sizes

**Weekend holding is a separate parameter from overnight holding**: the "All product overviews" comparison table lists "Weekend Holding" as its own row (No for Zero and Signature Futures, matching the daily-flatten rule), distinct from "Overnight Holding" two rows below it in the same table.

The source "Instrument list and trading hours" article internally mislabels its NYMEX Natural Gas row with the symbol "NQ" (already used correctly elsewhere in the same article for E-mini NASDAQ 100). This tree’s own table uses "NG" for Natural Gas, matching the source’s evident intent, not its literal typo.

All trading hours below are Sunday-Friday except the "CME Agricultural Futures" group (Live Cattle LE and Lean Hogs HE only), which the source lists Monday-Friday; the grain instruments sit under "CBOT Commodity Futures" and are Sunday-Friday. All in CT, per "Instrument list and trading hours." Permitted trading window firm-wide is 17:00-15:10 CT; all open positions are force-closed daily at 15:10 CT (no overnight holding on either Futures plan), per "Can I hold positions overnight?"

| Symbol | Instrument                | Commission (RT)       | Tick Size   | Profit/Tick |
| ------ | ------------------------- | --------------------- | ----------- | ----------- |
| EMD    | E-mini S&P MidCap 400     | $2.58 + $0.52 + $0.38 | 0.1         | $10.00      |
| ES     | E-mini S&P 500            | $2.58 + $2.80 + $0.38 | 0.25        | $12.50      |
| MES    | Micro E-mini S&P          | $0.78 + $0.74 + $0.38 | 0.25        | $1.25       |
| NKD    | Nikkei                    | $2.58 + $2.80 + $0.38 | 5           | $25.00      |
| NQ     | E-mini NASDAQ 100         | $2.58 + $2.80 + $0.38 | 0.25        | $5.00       |
| MNQ    | Micro E-mini NASDAQ 100   | $0.78 + $0.74 + $0.38 | 0.25        | $0.50       |
| RTY    | E-mini Russell 2000       | $2.58 + $2.80 + $0.38 | 0.1         | $5.00       |
| M2K    | Micro E-mini Russell 2000 | $0.78 + $0.74 + $0.38 | 0.1         | $0.50       |
| MBT    | Micro E-mini Bitcoin      | $0.78 + $2.04 + $0.38 | 5           | $0.50       |
| MET    | Micro E-mini Ether        | $0.78 + $2.04 + $0.38 | 0.05        | $0.50       |
| 6A     | Australian $              | $2.58 + $3.24 + $0.38 | 0.0001      | $10.00      |
| M6A    | Micro AUD/USD             | $0.78 + $0.52 + $0.38 | 0.0001      | $1.00       |
| 6B     | British Pound             | $2.58 + $3.24 + $0.38 | 0.0001      | $6.25       |
| M6B    | Micro British Pound       | $0.78 + $0.52 + $0.38 | 0.0001      | $0.63       |
| 6C     | Canadian $                | $2.58 + $3.24 + $0.38 | 0.0001      | $10.00      |
| 6E     | Euro FX                   | $2.58 + $3.24 + $0.38 | 0.0001      | $12.50      |
| 7E     | E-mini Euro FX            | $2.58 + $1.74 + $0.38 | 0.0001      | $6.25       |
| M6E    | Micro Euro                | $0.78 + $0.52 + $0.38 | 0.0001      | $1.25       |
| MCD    | Micro CAD/USD             | $0.78 + $0.52 + $0.38 | 0.0001      | $1.00       |
| 6J     | Japanese Yen              | $2.58 + $3.24 + $0.38 | 0.0000001   | $12.50      |
| 6S     | Swiss Franc               | $2.58 + $3.24 + $0.38 | 0.0001      | $12.50      |
| 6M     | Mexican Peso              | $2.58 + $3.24 + $0.38 | 0.00005     | $5.00       |
| 6N     | New Zealand $             | $2.58 + $3.24 + $0.38 | 0.0001      | $10.00      |
| LE     | Live Cattle               | $2.58 + $4.24 + $0.38 | 0.025       | $10.00      |
| HE     | Lean Hogs                 | $2.58 + $4.24 + $0.38 | 0.025       | $10.00      |
| GF     | Feeder Cattle             | Unconfirmed           | Unconfirmed | Unconfirmed |
| CL     | Crude Oil                 | $2.58 + $3.04 + $0.38 | 0.01        | $10.00      |
| MCL    | Micro Crude Oil           | $0.78 + $1.04 + $0.38 | 0.01        | $1.00       |
| QM     | E-mini Crude Oil          | $2.58 + $2.44 + $0.38 | 0.025       | $12.50      |
| NG     | Natural Gas               | $2.58 + $3.24 + $0.38 | 0.001       | $10.00      |
| QG     | E-mini Natural Gas        | $2.58 + $1.04 + $0.38 | 0.005       | $12.50      |
| RB     | RBOB Gasoline             | $2.58 + $3.04 + $0.38 | 0.0001      | $4.20       |
| HO     | Heating Oil               | $2.58 + $4.24 + $0.38 | 0.0001      | $4.20       |
| ZC     | Corn                      | $2.58 + $4.24 + $0.38 | 0.25        | $12.50      |
| ZW     | Wheat                     | $2.58 + $4.24 + $0.38 | 0.25        | $12.50      |
| ZS     | Soybeans                  | $2.58 + $4.24 + $0.38 | 0.25        | $12.50      |
| ZM     | Soybean Meal              | $2.58 + $4.24 + $0.38 | 0.1         | $10.00      |
| ZL     | Soybean Oil               | $2.58 + $4.24 + $0.38 | 0.01        | $6.00       |
| YM     | Mini-DOW                  | $2.58 + $2.80 + $0.38 | 1           | $5.00       |
| MYM    | Micro Mini-DOW            | $0.78 + $0.74 + $0.38 | 1           | $0.50       |
| GC     | Gold                      | $2.58 + $3.24 + $0.38 | 0.1         | $10.00      |
| MGC    | Micro Gold                | $0.78 + $1.24 + $0.38 | 0.1         | $1.00       |
| SI     | Silver                    | $2.58 + $3.24 + $0.38 | 0.005       | $25.00      |
| HG     | Copper                    | $2.58 + $3.24 + $0.38 | 0.0005      | $12.50      |
| PL     | Platinum                  | $2.58 + $3.24 + $0.38 | 0.1         | $10.00      |
| PA     | Palladium                 | $2.58 + $3.24 + $0.38 | 0.1         | $10.00      |
| ZT     | 2-Year Note               | Unconfirmed           | Unconfirmed | Unconfirmed |
| ZF     | 5-Year Note               | Unconfirmed           | Unconfirmed | Unconfirmed |
| ZN     | 10-Year Note              | Unconfirmed           | Unconfirmed | Unconfirmed |
| ZB     | 30-Year Bond              | Unconfirmed           | Unconfirmed | Unconfirmed |
| UB     | Ultra-Bond                | Unconfirmed           | Unconfirmed | Unconfirmed |
| TN     | Ultra-Note                | Unconfirmed           | Unconfirmed | Unconfirmed |
| ZQ     | 30 Day Fed                | Unconfirmed           | Unconfirmed | Unconfirmed |

Commission column is broken out as stated in the source: Commission (RT) + Exchange and NFA (RT) + Clearing (RT). "GF" (Feeder Cattle) is the only instrument absent from both source tables; its row is Unconfirmed throughout. The two tables do not list exactly the same instrument set, so treat any Unconfirmed cell as missing data, not zero. A 2026-09-19 re-audit found that "6C," "7E," "MCD," and "ZM" had in fact been marked Unconfirmed in error: all four are stated in the source tables and are now filled in.

**Required margin per contract** (source: "All product overviews / margin per instrument"), the dollar figure a trader needs to convert the plan’s Max Contracts limit into buying power, is a separate ~40-row table not reproduced verbatim here; consult the source article directly for a specific instrument’s margin.

### Prohibited trading practices (all stages)

Per "Trading Policies and Prohibited Trading Strategies", the following are prohibited outright, and "Engaging in prohibited trading practices will result in termination from our program and a refund of the fee paid from the account where this rule was broken":

- Semi- or fully-automated trading, "such as trading bots, AI tools, HFT trading (more than 300 trades per day)".
- "Holding a position within 2% of a product's lock limit." A concrete numeric threshold, distinct from the general volatility guidance.
- "Any strategies that exploit imperfections of the simulated market, such as Gapped, Illiquid Market Trading", and "Any strategies that create or exploit errors in the services, such as errors in the display of prices, delays in their updating".
- "Irresponsible Trading and All-or-Nothing Trading: Executing large-volume trades without a coherent strategy."
- "Not being compliant with CME Group Rules: All trading activities must adhere to CME Group's rules and regulations."
- "Performing trades in conflict with the terms and conditions of E8 Markets."
- "All trading strategies must be demonstrably replicable under both simulated and real market conditions", naming account rolling, micro-scalping during illiquid market hours, and excessive or disproportionate risk-taking as examples of strategies that fail this test. Enforcement here is termination "without further notice."

Two discretionary powers sit alongside that list: "Before receiving a simulated SimFi™ performance account, we will review your trading activities for compliance", and "E8 Markets reserves the right to de-risk your trading strategy." Extreme or all-or-nothing trading can trigger a risk-team review requiring extended demonstrated consistency, and "E8's risk team may request a brief interview with traders at any stage. This is not standard practice." A failed compliance/consistency review can mean not receiving a Performance account at all, or "the closure of your existing one, including the loss of accrued profits", and separately the firm "reserves the right to impose restrictions on trading activities, terminate the agreement, or withhold payouts."

### Risk, allocation, and account management

- **No hard per-trade risk cap**: "There are no hard limits on maximum risk per trade idea. We know that every trader has a different edge, and we respect that." Responsible risk management is still what the SimFi environment measures.
- **Allocation limits are per household, not per login**: "These allocation limits apply per household. Multiple users within the same residence/same IP must not exceed this collective maximum." During the Challenge stage "there are no limits on how many accounts you can purchase".
- **Accounts are personally managed**: "Every account must be managed individually by the account holder", and "All accounts must be traded solely by their respective owners." Sharing emails or accounts between users "may lead to the temporary or permanent suspension of your active accounts and user profile".

### Inactivity, in detail

- The 7-day Futures inactivity rule "will also affect newly purchased accounts without any trading history", so a freshly-bought account starts its own clock.
- Any trade counts: "There is no minimum lot size requirement to maintain your account. Even a micro-trade of 0.1 lots counts as a qualifying trade to prevent deactivation."
- Travel has an exception, but it must be arranged in advance: a trader who knows the account will be inactive must contact support before travelling.

### Payments and KYC

- **Third-party cards are prohibited**: "It is not possible to use someone else's card for the purchase", the registered name must match the card, the billing address on file must match the card’s billing address, and "Using someone else's card or card chargebacks can lead to the termination of your personal account and the closure of all of your active challenges and performance accounts, due to breaching our Terms and Conditions."
- **Failing KYC ends eligibility**: "If verification is not accepted by our KYC partners for any reason, you are unfortunately ineligible to use our services." Payouts have their own gate: "If you can't undergo WorkMarket and Riseworks KYC, we cannot provide you with a payout payment."
- **US traders using Aeropay at checkout** have an additional verification step stated in the verification article.
- **No fee-refund bonus**: "At this moment, do not provide bonuses by refunding the fee with the first payout share", so the evaluation fee is not returned with the first payout.
- **E8 may terminate for breach**: "E8 Markets has full authority to terminate contracts and deactivate your personal account if there's any breach of our Terms & Conditions. This could result in account deactivation, the forfeiture of any payouts, and possible bans from E8 Markets services."
- **A separate product-restriction country list exists**: beyond the accepted-countries list, some countries "can purchase only E8 Pro and E8 Signature accounts", which is a product restriction rather than a full exclusion.
- **A pending payout request can be cancelled and resubmitted once per day**: "As long as our team has not yet confirmed it or sent you an invitation to Rise/WorkMarket, you can cancel the request and resubmit with the correct amount and provider. This request is possible once per 24 hours on your account."

## Key Cross-Plan Differences

| Aspect                 | E8 Signature Futures                                                              | E8 Zero                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account Sizes          | $25K / $50K / $100K / $150K                                                       | $50K / $100K / $200K                                                                                                                                      |
| Eval Fee               | Unconfirmed                                                                       | Unconfirmed                                                                                                                                               |
| Profit Target          | $1,500 / $3,000 / $6,000 / $9,000                                                 | $3,000 / $6,500 / $13,500                                                                                                                                 |
| Eval Consistency       | None (Challenge stage)                                                            | 40% Best Day Rule (Challenge stage only)                                                                                                                  |
| Min Eval Days          | Unconfirmed                                                                       | None stated ("No minimum Trading days")                                                                                                                   |
| Funded Drawdown Type   | EOD Dynamic Drawdown, locks at Starting Balance on profit-trigger or first payout | EOD Dynamic Drawdown, same lock mechanic funded-side, but explicitly does **not** lock during the Challenge stage (a documented exception unique to Zero) |
| DLL (Funded)           | Daily Pause (soft): 2% of starting balance, fixed $ amount                        | None                                                                                                                                                      |
| Sim Payout Split       | 80% flat                                                                          | 80% or 100%, selected at purchase                                                                                                                         |
| Max Funded Accounts    | 5 per household                                                                   | 3 per household                                                                                                                                           |
| Inactivity Rule        | 7 days                                                                            | 7 days                                                                                                                                                    |
| Lifetime Sim Payouts   | 5 payouts, then free replacement Challenge                                        | 5 payouts, then free replacement Challenge                                                                                                                |
| Consistency on Payouts | 35% Best Day Rule + 5 profitable days between payouts (not first)                 | None                                                                                                                                                      |
| Live Transition        | None: SimFi Performance is the final stage                                        | None: SimFi Performance is the final stage                                                                                                                |

Every row traces back to the matching row in each plan's own file; where a plan file marks a figure Unconfirmed or computed, this table repeats that status rather than asserting a cleaner-looking number.

## Documentation Scope

- **E-mini Euro FX symbol: "7E" vs "E7"** — this table cites "Instrument list and trading hours" and "Tick size and profit per tick Calculation" for the symbol "7E". A separate article, "Stop Trading the Wrong Contract Month," lists the same instrument under the symbol "E7" in its own front-month table. Do not assume "7E" is the correct ticker to search on an external platform without checking which symbol convention that platform uses; the two E8 sources disagree.

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
