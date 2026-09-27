import { TRADING_DAYS_PER_MONTH } from '~/lib/prop-calculator';

export const kpiDescriptions = {
    avgDaysToPass:
        "Mean trading days needed to reach the target across passing trials. Doesn't include eval failures.",
    breakEven:
        "Funded-account profit needed to recoup all eval/activation/reset spending. Below this you're net negative.",
    breakevenPassRate:
        'Attempt cost divided by funded value: the pass rate at which an attempt breaks even. Below it EV per attempt is negative, above it positive.',
    bustBeforePassing:
        'Probability of busting the drawdown rule before hitting the profit target. Same number as bust% but framed as the risk you take on.',
    daysToPass:
        'Distribution of trading days needed to hit the profit target across passing trials. Tighter = consistent timing, wider = some trials grind for many days.',
    evalPass:
        'Share of simulated trials that reached the profit target and passed the evaluation without busting the drawdown or daily-loss limit or running out of allowed eval days, whether or not the funded account later busted.',
    evPerAttempt:
        'Expected value of one attempt: pass probability × funded value over the funded horizon, minus attempt cost (all fees per attempt, activation on pass included). Credit-free net per trial divided by attempts per trial. Ignores how long an attempt takes, so it is not the ranking objective; expected monthly net is.',
    expectancy:
        'Expected profit per trade. Positive = your system has a statistical edge. = winrate × avgWin − lossRate × avgLoss.',
    expectedAttempts:
        'Mean number of evaluation cycles taken until you pass (or exhaust max attempts). Higher = more resets paid.',
    expectedSpend:
        "Mean total $ outlay across all attempts including resets. Budget the P90 number to be 90% confident you won't exceed it.",
    finalBalance:
        'Distribution of account balances at the end of each simulation. Most-likely range vs tail outcomes.',
    firstPayout:
        "Calendar day of the first eligible payout, counted from the start of the first eval attempt and averaged over every trial that received a payout, including accounts that later busted. Requires the firm's minimum hold and safety buffer to be met.",
    fundedSurvival:
        'Share of trials that passed the evaluation and never busted the funded account within the funded horizon. A breach repaired by an opted-in funded reset does not count as a bust. Equals eval pass minus the funded-bust rate: the two differ most for firms whose funded rules are stricter than their eval rules.',
    maxDrawdown:
        'Worst peak-to-trough $ drop observed within a trial path. P95 = the drawdown you should expect to face in 1 of 20 attempts.',
    maxLosingStreak:
        "Longest run of consecutive losing trades observed in simulations. P95 = worst-case streak you'll see in 1 of 20 evaluation attempts.",
    monthlyNet: `Expected $ profit per month after all fees, averaged across every trial, whether it passed, busted or timed out, plus a horizon credit: one more payout request for each account still open at the funded horizon end, net of the split and the payout method fee, and capped like a real request by the payout ladder step, request size, profit share and request caps, and by the plan's payout profit pool (the profit made since funding, a funded reset or the last payout, or the whole account profit on plans that pay from account profit) only on plans with no payout ladder and no profit share. The credit is $0 when those caps leave nothing to request (for example an emptied payout profit pool, or, on a plan whose ladder denies an unaffordable step, a step above what the account could withdraw: its withdrawable balance, or its profit share if lower), once a lifetime payout cap is reached or once the payout ladder is exhausted; the payout day, qualifying-day, consistency, minimum profit and minimum request gates are not applied to the credit, since continued trading would clear them. = (avg net + avg horizon credit) per account × ${TRADING_DAYS_PER_MONTH} ÷ avg trial duration in trading days, from the first eval day to the trial's end, times the number of copy-traded accounts when the form sets more than one.`,
    payoutProbabilityGivenFunded:
        'Share of funded accounts in the run that receive at least one payout, conditional on having reached funded. Differs from funded survive: an account can survive the funded horizon without ever qualifying for a payout.',
    payoutsPerFundedAccount:
        'Mean number of payouts per funded account over the funded horizon, counting accounts that never paid as zero. Divided by P(payout | funded) gives payouts per paid funded account: how many times a paying account gets paid.',
    profitFactor:
        'Total winnings divided by total losses across all trades. > 1.5 is healthy, < 1.0 is losing money.',
    rewardToRisk:
        'Reward-to-risk ratio per trade: the dollars won on an average winning trade divided by the dollars lost on an average losing trade. Alongside win rate, sets expectancy per trade in R-multiples.',
    risk5Losses:
        'Share of trials where your strategy produced at least one streak of 5 losing trades in a row. High % means streaks will happen, so make sure your account size can survive them.',
    roiOnCost:
        'Net profit divided by total fees paid, expressed as a percentage. = (avg net ÷ avg total cost) × 100. The dollar return on your fee outlay. Shows n/a when the total cost is $0, since a return on no outlay has no ratio.',
    totalCost:
        'All-in fees paid per evaluation cycle, averaged across every trial, whether it passed, busted or timed out. When multi-attempt is on, includes a retry fee for each failed attempt, bust or timeout, that is followed by another attempt: a re-buy on plans where every retry is a re-buy, otherwise the cheaper of a reset and a re-buy.',
    tradesPerPass:
        'Mean number of eval trades you take in trials that pass the evaluation, including accounts that later busted funded. Lower = faster pass, higher = slower grind.',
} as const;

export const inputHints = {
    maxEvalDays:
        'An attempt that hits this limit is a failed attempt: it is retried while attempts remain, and a trial counts as a timeout only if its last attempt times out',
} as const;

export const panelDescriptions = {
    cashFlow:
        "Projects your realistic, rules-aware cash flow: buy an eval and retry each failed attempt, bust or timeout, at the cheaper of a reset (after your reset discount) and a fresh re-buy (after your eval discount), or at the re-buy when the plan has no reset or every retry on it is a re-buy, for as long as the timeline has days left; each retry fee is booked on the day its failed attempt ends, while the first eval fee, the subscription months and the activation are spread evenly over the card's eval days; the bundle discount applies only to each account slot's first card, on its first eval purchase and its activation, unlike the CLI's optimize dp, which re-buys copy-traded accounts together and applies the bundle to every renewal. Once funded, cycle through the payout ladder with qualifying days, the safety net, and the consistency rule all enforced, repeating for every new card bought after an account closes or busts. It never holds more funded accounts at once than the firm allows on this plan. The shaded band shows the P10–P90 spread of cumulative net (payouts − spend) across simulated trials; the bold line is the median.",
    'days-to-pass-hist':
        'Distribution of trading days needed to reach the profit target. Concentration near the median = consistent timing. A long right tail = some trials grind for many days before passing.',
    drawdown:
        "Each line shows how far below its rolling peak a trial fell at every step. The bold line is the median drawdown. The red dashed line marks the firm's bust limit. Useful for seeing how close paths typically come to busting.",
    equity: 'Each faint line is one Monte Carlo trial. The bold line is the day-by-day median across all sampled paths. The green dashed line marks the profit target; the red dashed line marks the drawdown threshold. Use it to see typical paths AND outliers in one view.',
    'final-balance-hist':
        'Distribution of final account balances across all trials. A bimodal shape (two humps) means many trials either bust or pass cleanly. Reference lines show starting balance and target.',
    firmComparison:
        'Runs the simulator across all firms at the closest plan size to your current selection, using your current trading inputs. Sorted by monthly net. Active firm highlighted; ★ rating relative to best. P(no payout) = share of trials that reached funded and took no payout within the funded horizon.',
    optimalRiskSweep:
        'Runs the simulator at 10 different risk-per-trade levels (0.25% to 5%) holding all your other inputs constant. The current risk row is highlighted, and the row with the best monthly net is marked with a star.',
    'pass-rate':
        'Cumulative share of trials that have hit the profit target by each day. Steepens early when most passes happen quickly; flattens late when the eval is dragging on. The asymptote = total eval pass probability.',
    planComparison:
        'Compares every plan offered by the selected firm at your current trading inputs. PT:DD is the profit-target-to-drawdown ratio: a lower value means you need less profit relative to your downside risk to pass the evaluation. Green ≤ 1.0×, amber 1.5–2.0×, red > 2.0×. Exp. spend is the total expected outlay across all eval attempts (including resets) until you get funded. P(no payout) = share of trials that reached funded and took no payout within the funded horizon. Use the table to find the account size with the most favourable challenge structure for your edge.',
    portfolio:
        "Build a basket of accounts across any mix of firms and plans. Each row simulates your current trading inputs against that firm's rules. Combined totals show your aggregate expected monthly income, total eval spend, and portfolio ROI: the same view as copy-trading but across different firms.",
    resilience:
        'How many consecutive losses can your account absorb before the drawdown rule ends the trade? Loss tolerance = ⌊drawdown amount / risk per trade⌋. Buffer = tolerance − P95 worst simulated streak. Positive means you have headroom, negative means a realistic bad run could bust you. The table shows the probability of encountering each streak length during an expected eval campaign, what damage it does, and whether you survive. The footer tells you the maximum risk per trade that keeps you safe against your P95 streak.',
    returnsBreakdown:
        'Decomposes the expected return into yearly, monthly, weekly, and per-trade rates so you can compare the strategy to other capital uses. Trade counts, sum of R-multiples per pass, and average trade size show what a typical funded month looks like in concrete terms. Balance range is min and max final balance across all simulated trials, including bust outcomes: the tail you should size around.',
    riskReturn:
        'Risk-adjusted performance metrics used by hedge funds to evaluate strategies independently of raw returns. Sharpe (annualized): mean monthly return / std dev of monthly return × √12, computed from the full distribution of trial outcomes. Calmar: annualized return / median max drawdown; higher is more capital-efficient. Recovery factor: period net profit / median max drawdown: how many drawdown events does your profit cover? Omega: ratio of probability-weighted gains to losses across all outcomes. Profit factor: gross wins / gross losses per trade.',
    sensitivityFundedSurvival:
        'Funded survive probability (passed the evaluation and never busted the funded account within the funded horizon) across the same winrate × reward-to-risk grid. Compare it with the eval pass heatmap to see where the funded rules, not the eval, are the binding risk.',
    sensitivityNet:
        "Expected monthly net dollars across the same winrate × reward-to-risk grid. Pairs with the eval pass heatmap to spot the band that's both safe AND profitable.",
    sensitivityPass:
        'Eval pass probability across a 7×7 grid of winrate × reward-to-risk values. Green = robust, red = unlikely. Your current cell is outlined. Use it to see how forgiving your edge is to estimation error.',
    strategyAnalysis:
        'Three quantitative views of your strategy in one place. Edge: how much you make per trade and how confident the simulation is that the edge is statistically real. Risk-adjusted returns: hedge-fund-grade ratios that compare profit to volatility (Sharpe), drawdown (Calmar), and downside (Omega). Returns breakdown: the same expected return decomposed across timeframes plus per-pass trade activity.',
    strategyDNA:
        'Edge: expectancy per trade in R-multiples and dollars, break-even win rate (the minimum WR to be profitable at your RR), and edge margin (how far above break-even you are). Kelly sizing: the mathematically optimal bet size for long-run growth and the half-Kelly fraction most professionals use. Kelly index < 0.25 = under-betting, 0.25–0.75 = optimal zone, > 1.0 = over-betting (negative expected log-growth). Edge confidence: Z-score of your edge over one eval, and the minimum number of trades needed to confirm your edge at 95% statistical confidence.',
} as const;
