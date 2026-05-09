export const kpiDescriptions = {
    passProbability:
        'Share of simulated trials where you reached the profit target without busting the drawdown, daily-loss limit, or running out of allowed eval days.',
    cleanPass:
        "Trials that passed AND respected the firm's consistency rule (single-day profit cap). Fixed-RR strategies that hit the target in one big day mechanically violate this.",
    avgDaysToPass:
        "Mean trading days needed to reach the target across passing trials. Doesn't include eval failures.",
    totalCost:
        'All-in fees paid per evaluation cycle, averaged across passes and busts. Includes resets when multi-attempt is on.',
    firstPayout:
        "Calendar day of the first eligible payout, counted from start of the eval. Requires the firm's minimum hold and safety buffer to be met.",
    monthlyNet:
        'Expected $ profit per month after all fees, averaged across passes and busts. = (avg gross payout − avg total cost) × 21 ÷ avg trial duration.',
    expectancy:
        'Expected profit per trade. Positive = your system has a statistical edge. = winrate × avgWin − lossRate × avgLoss.',
    profitFactor:
        'Total winnings divided by total losses across all trades. > 1.5 is healthy, < 1.0 is losing money.',
    maxLosingStreak:
        "Longest run of consecutive losing trades observed in simulations. P95 = worst-case streak you'll see in 1 of 20 evaluation attempts.",
    riskOfRuin:
        'Probability of busting the drawdown rule before hitting the profit target. Same number as bust% but framed as the risk you take on.',
    roiOnCost:
        'Net profit divided by total fees paid, expressed as a percentage. = (avg net ÷ avg total cost) × 100. The dollar return on your fee outlay.',
    expectedAttempts:
        'Mean number of evaluation cycles taken until you pass (or exhaust max attempts). Higher = more resets paid.',
    expectedSpend:
        "Mean total $ outlay across all attempts including resets. Budget the P90 number to be 90% confident you won't exceed it.",
    breakEven:
        "Funded-account profit needed to recoup all eval/activation/reset spending. Below this you're net negative.",
    risk5Losses:
        'Share of trials where your strategy produced at least one streak of 5 losing trades in a row. High % means streaks will happen — make sure your account size can survive them.',
    tradesPerPass:
        'Mean number of trades you take in trials that pass. Lower = faster pass, higher = slower grind.',
    maxDrawdown:
        'Worst peak-to-trough $ drop observed within a trial path. P95 = the drawdown you should expect to face in 1 of 20 attempts.',
    finalBalance:
        'Distribution of account balances at the end of each simulation. Most-likely range vs tail outcomes.',
} as const;

export const panelDescriptions = {
    equity: 'Each faint line is one Monte Carlo trial. The bold line is the day-by-day median across all sampled paths. The green dashed line marks the profit target; the red dashed line marks the drawdown threshold. Use it to see typical paths AND outliers in one view.',
    drawdown:
        "Each line shows how far below its rolling peak a trial fell at every step. The bold line is the median drawdown. The red dashed line marks the firm's bust limit. Useful for seeing how close paths typically come to busting.",
    'pass-rate':
        'Cumulative share of trials that have hit the profit target by each day. Steepens early when most passes happen quickly; flattens late when the eval is dragging on. The asymptote = total pass probability.',
    'final-balance-hist':
        'Distribution of final account balances across all trials. A bimodal shape (two humps) means many trials either bust or pass cleanly. Reference lines show starting balance and target.',
    'days-to-pass-hist':
        'Distribution of trading days needed to reach the profit target. Concentration near the median = consistent timing. A long right tail = some trials grind for many days before passing.',
    optimalRiskSweep:
        'Runs the simulator at 10 different risk-per-trade levels (0.25% to 5%) holding all your other inputs constant. The current risk row is highlighted, and the row with the best monthly net is marked with a star.',
    sensitivityPass:
        'Pass probability across a 7×7 grid of winrate × reward-to-risk values. Green = robust, red = unlikely. Your current cell is outlined. Use it to see how forgiving your edge is to estimation error.',
    sensitivityNet:
        "Expected monthly net dollars across the same winrate × reward-to-risk grid. Pairs with the pass% heatmap to spot the band that's both safe AND profitable.",
    firmComparison:
        'Runs the simulator across all 6 firms at the closest plan size to your current selection, using your current trading inputs. Sorted by monthly net. Active firm highlighted; ★ rating relative to best.',
} as const;
