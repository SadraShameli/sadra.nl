import {
    ConsistencyRule,
    ConsistencyScope,
    ContractLimitKind,
    type ContractLimits,
    contracts,
    DailyLossLimitBreachEffect,
    type DailyLossLimitConfig,
    DailyLossLimitKind,
    type Dollars,
    dollars,
    EodTrailingDrawdown,
    FirmId,
    fraction,
    type Fraction0to1,
    FtmoFuturesVariant,
    type PlanInit,
    profitShareMultiplier,
    TradingFirm,
} from '~/lib/prop-calculator/core';

import { lockThresholdAt, planLabel } from '../shared';

const ACCOUNT_SIZE = 50_000;
const PROFIT_TARGET = dollars(3000);
const MIN_TRADING_DAYS = 0;
const MAX_FUNDED_ACCOUNTS = 3;
const TRADER_SHARE = fraction(0.9);
const MIN_PAYOUT_REQUEST = dollars(20);
const MIN_NEW_PROFIT_SHARE_OF_REQUEST = profitShareMultiplier(2);
const DAILY_LOSS_LIMIT = dollars(1000);
const SIM_FUNDED_INACTIVITY_CLOSURE_DAYS = 30;
const RETAINED_PAYOUT_CUSHION = dollars(2000);

const FLAT_DAILY_LOSS_LIMIT: DailyLossLimitConfig = {
    amount: DAILY_LOSS_LIMIT,
    kind: DailyLossLimitKind.Flat,
};

const CONTRACT_LIMITS: ContractLimits = {
    evalMicros: contracts(50),
    evalMinis: contracts(5),
    fundedMicros: {
        isEffectiveNextSession: true,
        kind: ContractLimitKind.Tiered,
        tiers: [
            { maxContracts: contracts(20), minBalance: dollars(0) },
            { maxContracts: contracts(30), minBalance: dollars(1000) },
            { maxContracts: contracts(50), minBalance: dollars(2000) },
        ],
    },
    fundedMinis: {
        isEffectiveNextSession: true,
        kind: ContractLimitKind.Tiered,
        tiers: [
            { maxContracts: contracts(2), minBalance: dollars(0) },
            { maxContracts: contracts(3), minBalance: dollars(1000) },
            { maxContracts: contracts(5), minBalance: dollars(2000) },
        ],
    },
};

interface FtmoFuturesProduct {
    readonly dailyLossLimitBreach: DailyLossLimitBreachEffect;
    readonly evalConsistency: Fraction0to1;
    readonly evalDailyLossLimit: DailyLossLimitConfig;
    readonly fundedDailyLossLimit: DailyLossLimitConfig;
    readonly label: string;
    readonly maxDrawdown: Dollars;
    readonly minQualifyingDayProfit: Dollars;
    readonly monthlySubscription: Dollars;
    readonly payoutRequestCap: Dollars;
    readonly qualifyingDaysPerCycle: number;
    readonly reset: Dollars;
    readonly withdrawableProfitShare: Fraction0to1;
}

const PRODUCTS: Record<FtmoFuturesVariant, FtmoFuturesProduct> = {
    [FtmoFuturesVariant.Growth]: {
        dailyLossLimitBreach: DailyLossLimitBreachEffect.Lockout,
        evalConsistency: fraction(0.4),
        evalDailyLossLimit: { kind: DailyLossLimitKind.None },
        fundedDailyLossLimit: FLAT_DAILY_LOSS_LIMIT,
        label: 'Growth',
        maxDrawdown: dollars(2000),
        minQualifyingDayProfit: dollars(150),
        monthlySubscription: dollars(119),
        payoutRequestCap: dollars(2500),
        qualifyingDaysPerCycle: 4,
        reset: dollars(109),
        withdrawableProfitShare: fraction(0.5),
    },
    [FtmoFuturesVariant.Pro]: {
        dailyLossLimitBreach: DailyLossLimitBreachEffect.Terminate,
        evalConsistency: fraction(0.5),
        evalDailyLossLimit: FLAT_DAILY_LOSS_LIMIT,
        fundedDailyLossLimit: FLAT_DAILY_LOSS_LIMIT,
        label: 'Pro',
        maxDrawdown: dollars(3000),
        minQualifyingDayProfit: dollars(200),
        monthlySubscription: dollars(139),
        payoutRequestCap: dollars(5000),
        qualifyingDaysPerCycle: 5,
        reset: dollars(129),
        withdrawableProfitShare: fraction(1),
    },
};

export class FtmoFutures extends TradingFirm {
    readonly displayName = 'FTMO Futures';
    readonly id = FirmId.FtmoFutures;
    readonly notes = [
        "Modeled 2026-09-21 from FTMO's own Futures Trading Objectives & Rules page (ftmo.com/en/futures/trading-objectives-and-rules, Growth and Pro at 50K; user-pasted and verified identical to a live fetch the same day, HTML article:modified_time 2026-09-14), cross-checked against the Comparison Table, How It Works, the Forbidden Trading Practices page, the firm-wide Futures FAQ, and the FTMO Futures Evaluation Terms and Conditions (Global) v5 dated 31 August 2026. Full doc tree with every quote: .claude/prop-firms/ftmo-futures/. Only the $50K size is modeled, by explicit instruction; Growth and Pro also exist at $100K and $150K with their own distinct Profit Target, Max Drawdown, Daily Loss Limit, fees, Payout Cap and Payout Eligibility figures, none of which are carried into this file.",
        "The Evaluation is a recurring monthly subscription with no activation fee and no one-time purchase ($119/month Growth, $139/month Pro), so fees.monthlySubscription carries the whole eval cost and oneTimeEval/activation are $0. A breached Evaluation is replaced free on the next billing date ('you will receive a new account on the Trading Platform on the next billing date'), or immediately for the Reset Fee ($109 Growth, $129 Pro; 'You may pay the Reset Fee any number of times', T&C cl. 5.13; 'applying a Reset does not alter your monthly billing cycle'). The engine's eval retry loop (evalPhase.ts's runEvalWithRetries) charges fees.reset on every bust except the terminal one, so an N-bust run pays N-1 resets: it models the impatient trader who always resets rather than waiting for the free replacement. The comparison is not one-directional, though, because the free replacement is not free of time ('you will receive a new account on the Trading Platform on the next billing date'): the waiting trader forfeits the rest of the current month and pays the next one, days this model never adds, since trial.ts counts only simulated trading days.",
        "Maximum Drawdown is End-of-Day Trailing at both stages: the limit is 'the highest account balance recorded at the close of any preceding trading day (or the Initial Simulated Capital if higher)' minus the Maximum Drawdown Amount ($2,000 Growth, $3,000 Pro), 'can only increase, never decrease', and 'Once the Maximum Drawdown Limit reaches the Initial Simulated Capital, it locks permanently at that figure' in the Evaluation and 'for the remaining life of the account' on the Sim-Funded Account. Modeled as one EodTrailingDrawdown shared by both phases (fundedDrawdown falls back to drawdown) with lock.atProfit equal to the drawdown amount and lockedThreshold at +$0, because the limit reaches the Initial Simulated Capital exactly when an EOD close sits the full drawdown amount above it. The page's own examples confirm this: Growth locks at $50,000 after a $52,500 close ($52,500 - $2,000 = $50,500 exceeds the Initial Simulated Capital), Pro after $54,000.",
        "Daily Loss Limit differs by product and is the main Growth-vs-Pro split, in both amount and consequence. Growth has none in the Evaluation and a soft $1,000 limit on the Sim-Funded Account ('all open positions are automatically closed and trading is suspended for the remainder of that trading day. The account is not terminated'); Pro applies a hard $1,000 limit in both phases ('If the limit is breached, the Evaluation is unsuccessful' / 'the account is immediately and permanently terminated'). Both are 'the account balance at the start of that trading day' minus $1,000, i.e. a flat todayPnL floor, so both are DailyLossLimitKind.Flat. The consequence is modeled separately from the amount, via this session's new DailyLossLimitBreachEffect on PlanInit: Pro sets Terminate on both phases and Plan.isBust now reports a terminating plan as dead the moment isDayLockedOut is true, while Growth stays on the engine-wide Lockout default, which is exactly FTMO's own soft-violation wording. Every other firm in this repo keeps Lockout, so none of their modeled behaviour moved. Three gaps remain and must not be read as fixed. (1) FTMO's limit is on equity including open-position P&L, while this engine marks to market only at trade close for an EodTrailingDrawdown plan (day.ts builds an intraday path only for IntradayTrailingDrawdown), so the real mechanism that kills hard-limit accounts, an open position excursing through the limit before the stop, is invisible here. (2) Per-trade risk is capped at the limit less the day's P&L so far, which caps the gross risk only: commission is charged on top (day.ts's pnl = tradeGross - commission), so a full-loss day closes one round-trip commission past the limit rather than exactly on it. Both land the account in the same terminated state on Pro, so the overshoot changes no outcome here, but it is still the reason the modeled breach point is not literally $1,000. (3) Because the engine sizes the last trade of a losing day down to the remaining headroom, a Pro account busts precisely when the configured risk-per-trade times trades-per-day sums past $1,000, and never otherwise: that cliff is real economics rather than an artifact, since a daily plan that exceeds a hard daily limit genuinely is fatal, but it does mean Pro's modeled bust rate is a property of the user's own ladder as much as of FTMO's rule. Sizing below the limit leaves Pro strictly easier than Growth on the drawdown ($3,000 vs $2,000) and consistency (50% vs 40%) axes, which is the genuine trade-off the two products offer.",

        "Consistency Rule applies to the Evaluation only (40% Growth, 50% Pro: the Best Day may not exceed that share of total closed profit) and 'is not treated as a rule breach. However, you must continue trading to accumulate additional profit'. That is exactly Plan.isPassed's default ConsistencyViolationEffect.Fail semantics (not passed yet, keep trading), so no DoubleTarget effect is needed. 'There is no Profit Target or Consistency Rule on the Sim-Funded Account', so fundedConsistencyRule() is null. minTradingDays is 0 ('No Min Trading Days', Comparison Table); the FAQ's '3 trading days for Growth Evaluation' / '2 trading days for Pro Evaluation' are the fastest passes the consistency math allows, which the rule already produces on its own, not a separate day-count gate.",
        "Max Contracts: 5 minis/standard or 50 micros in the Evaluation ('Ten Micro contracts count as one Standard / Mini contract'), identical for Growth and Pro at 50K. The Sim-Funded Scaling Plan starts at 2 minis / 20 micros and steps on end-of-day Profit above the Initial Simulated Capital: 3/30 from $1,000 and 5/50 from $2,000 (the $3,000-$4,499 and $4,500+ rungs also say 5/50, so the ceiling is reached at $2,000). 'Starting from the next trading day, your Max Contracts limit automatically increases', and drops back the next trading day after an EOD retreat, hence isEffectiveNextSession: true on both tiered configs (the same flag TopStep's Scaling Plan uses). ContractLimitTier.minBalance is compared against account profit at session start by PositionSizing.resolveContractLimit, so these tiers are keyed on profit, matching the page's 'Profit above the Initial Simulated Capital' ranges.",
        "Payouts are gated by Payout Eligibility, a per-cycle Qualifying Days count with a per-day closed-P&L floor: Growth '4 days @ $150+', Pro '5 days @ $200+', 'reviewed at the end of the trading day', with the page's own example counting a $120 day as not qualifying and requiring 'all 4 days within a payout cycle'. Modeled as minDaysAfterPassForPayout (4/5) plus minQualifyingDayProfit ($150/$200); FundedCycleTracker measures qualifying days since the last payout and falls back to minDaysAfterPassForPayout for later cycles when minDaysAfterPassForPayoutPerCycle is unset, which is the per-cycle reset the rule describes. The Comparison Table / How It Works cadence ('Every 4 days' Growth, 'Every 5 days' Pro) is modeled only through this gate; no source equates the two wordings, and this engine assumes the gate is the binding constraint because 4/5 Qualifying Days already require at least that many trading days. No separate cadence field is set.",
        "Three stacked payout-size rules, all stated per product on the rules page: (1) Withdrawable Amount, 'up to 50% of your Profit above the Initial Simulated Capital' on Growth and 'up to 100%' on Pro, is payoutBalanceShareCap (0.5 / 1.0), a fraction of total account profit; Pro's is set to 1.0 explicitly rather than left null because FundedCycleTracker's cushionRoom (balance minus threshold minus cushion) exceeds account profit before the drawdown locks, and the 100% is a cap on profit, not on balance. (2) Payout Cap, '$2,500 per request' Growth / '$5,000 per request' Pro, is payoutRequestCap. (3) Min New Profit for Request, 'at least 50% of the requested amount must represent new profit generated during the current payout cycle', is payoutProfitShare = 2x cycle profit, the same mechanism Tradeify Select Daily uses for its 2x-fresh-profit rule; the page's own example (kept $2,000 + new $400 = max request $800) reproduces exactly. Payout Ratio 90/10 is a single payoutTiers rung at 90% and minPayoutRequest is the stated $20 minimum. The Growth page contradicts itself on which of (1) and (2) binds: its Withdrawable Amount example gives '$4,000 of profit -> up to $2,000' while its Payout Cap example gives '$4,000 of profit -> up to $2,500'. The engine applies both and takes the lower, following the page's own 'the final amount of your payout is further influenced by the payout cap and payout ratio', so a Growth trader at $4,000 of profit is modeled at $2,000, not $2,500, and the $2,500 cap only binds from $5,000 of profit upward. Pro's own $8,000 -> $5,000 example is internally consistent.",
        "No dollar buffer is stated for the Sim-Funded Account (both growth.md and pro.md flag Buffer Requirement as not stated and warn against deriving one from the Qualifying Days gate), so nothing here is an FTMO figure. minRetainedCushionOverride is nevertheless set to $2,000 on both products, at the user's own instruction, as a payout-discipline default: a simulated payout always leaves $2,000 above the drawdown floor. Two reasons it is not $0. First, FTMO's own FAQ warns to 'prevent violating the Maximum Drawdown on a Pro Sim-Funded Account by requesting a full withdrawal', because once the limit has locked at the Initial Simulated Capital a 100% withdrawal leaves the balance exactly on the limit, which the rules page defines as a violation ('cannot hit at any point'). FTMO states no arithmetic or timing for a payout-triggered breach, so that outcome is this engine's deduction from three quoted rules (the limit locks at the Initial Simulated Capital, equity cannot hit it, and 100% of profit is withdrawable) rather than a stated mechanic: with DrawdownStrategy.isBreached being balance <= threshold, a cushion-free full withdrawal after the lock busts the account on the next simulated day. Measured at $0 cushion, a default Pro Sim-Funded run busted ~99.9% of the time against Growth's ~47%, because Growth's 50% Withdrawable Amount always leaves half the profit above the floor while Pro's 100% does not. Second, $2,000 is what the engine-wide default would already have given Growth (its own drawdown amount), so this override only really moves Pro, from $3,000 down to $2,000. The cost of the choice, stated plainly: it delays the first modeled payout until profit clears $2,000, which suppresses the small early payouts FTMO's own 4-or-5-Qualifying-Days gate would allow (Growth is eligible at $600 of profit), so modeled payout counts are conservative. It remains a per-simulation input, so any run can lower it. fullWithdrawalHardBreach is deliberately not set, since before the lock the limit sits below the Initial Simulated Capital and a full withdrawal is not a violation under FTMO's stated mechanics.",
        "Inactivity: the Forbidden Trading Practices page states 'Sim-Funded Accounts require ongoing trading activity' and then, as its own sentence, 'Accounts on which no trading activity has been recorded for 30 consecutive calendar days will be closed', so maxConsecutiveIdleDays is 30 for the funded phase; the engine counts simulated days, not calendar days, so this is the same approximation TopStep's 30-day rule already uses. No Evaluation-phase inactivity rule is stated anywhere in the cited sources, so evalMaxConsecutiveIdleDays is null (no rule modeled), following TakeProfitTrader's precedent for an unstated eval rule; this is not a confirmation that none exists. day.ts's idle-day generation is independent of that flag (isIdleToday no longer requires maxConsecutiveIdleDays !== null, fixed 2026-09-21 for every firm whose eval has no closure rule, not only FTMO), so a caller-supplied idleDayProbability still produces real idle days here even though none of them can ever close the account: an idle day simply elapses with no trade, elapsedDays still advances, and the 30-day funded-phase rule remains the only closure this plan ever enforces. This is what lets a trader who models sitting out some days be billed the extra subscription months that costs, instead of being silently forced to trade every simulated day.",
        "Not modeled, because no source states it: any lifetime payout cap (maxLifetimePayouts and maxLifetimePayoutDollars are left unset, which is not an assertion that none exists), and a payout method fee (payoutMethodFee $0; the FAQ's 'Available payout methods are: Wise, Revolut bank wire, and instant withdrawal via Visa Direct and Mastercard Send (Mastercard Send is not available for US clients)' states no fee for any of them). 'You may hold a maximum of 3 concurrent Sim-Funded Accounts at any one time, across all account sizes and product types' is maxFundedAccounts 3 on both plans; the engine's per-plan cap cannot express that the 3 are shared between Growth and Pro. Evaluations are unlimited and have no time limit, so maxEvalTradingDays is unset.",
        "No live-account model: the FTMO Futures Live Funded Account is invitation-only at FTMO Trading's sole discretion ('Not automatic: the Live Funded Account is offered by invitation only, after FTMO validates your Sim-Funded trading'), and no source states its size, drawdown, daily loss limit, one-time buffer amount or market data fee amount (How It Works does state that a fee applies: 'A market data fee applies for access to live market data - we cover one exchange for you'), so there is no LivePlan builder and FirmId.FtmoFutures is absent from LIVE_PLAN_BUILDERS, like E8 Futures. The account model terminates at the Sim-Funded, payout-eligible stage.",
    ];
    readonly plans = Object.values(FtmoFuturesVariant).map((variant) =>
        this.buildPlan(buildFtmoFuturesPlan(variant)),
    );
    readonly website = 'https://ftmo.com/en/futures/';
}

function buildFtmoFuturesPlan(variant: FtmoFuturesVariant): PlanInit {
    const product = PRODUCTS[variant];
    return {
        accountSize: dollars(ACCOUNT_SIZE),
        consistency: new ConsistencyRule(
            ConsistencyScope.Eval,
            product.evalConsistency,
        ),
        contractLimits: CONTRACT_LIMITS,
        drawdown: new EodTrailingDrawdown({
            amount: product.maxDrawdown,
            lock: {
                atProfit: product.maxDrawdown,
                lockedThreshold: lockThresholdAt(0),
            },
        }),
        evalDailyLossLimit: product.evalDailyLossLimit,
        evalDailyLossLimitBreach:
            product.evalDailyLossLimit.kind === DailyLossLimitKind.None
                ? DailyLossLimitBreachEffect.Lockout
                : product.dailyLossLimitBreach,
        evalMaxConsecutiveIdleDays: null,
        fees: {
            activation: dollars(0),
            monthlySubscription: product.monthlySubscription,
            oneTimeEval: dollars(0),
            reset: product.reset,
        },
        fundedDailyLossLimit: product.fundedDailyLossLimit,
        fundedDailyLossLimitBreach: product.dailyLossLimitBreach,
        id: {
            accountSize: ACCOUNT_SIZE,
            firm: FirmId.FtmoFutures,
            variant,
        },
        label: planLabel(ACCOUNT_SIZE, product.label),
        maxConsecutiveIdleDays: SIM_FUNDED_INACTIVITY_CLOSURE_DAYS,
        maxFundedAccounts: MAX_FUNDED_ACCOUNTS,
        minDaysAfterPassForPayout: product.qualifyingDaysPerCycle,
        minPayoutRequest: MIN_PAYOUT_REQUEST,
        minQualifyingDayProfit: product.minQualifyingDayProfit,
        minRetainedCushionOverride: RETAINED_PAYOUT_CUSHION,
        minTradingDays: MIN_TRADING_DAYS,
        payoutBalanceShareCap: product.withdrawableProfitShare,
        payoutProfitShare: MIN_NEW_PROFIT_SHARE_OF_REQUEST,
        payoutRequestCap: product.payoutRequestCap,
        payoutTiers: [
            { thresholdProfit: dollars(0), traderShare: TRADER_SHARE },
        ],
        profitTarget: PROFIT_TARGET,
    };
}
