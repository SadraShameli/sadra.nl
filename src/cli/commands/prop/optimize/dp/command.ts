import { type ArgsDef, defineCommand } from 'citty';

import {
    commonSimArguments,
    copyAccountsArgument,
    type CouponDiscountArguments,
    couponDiscountArguments,
    edgePlausibilityNote,
    payoutRequestPolicyArgument,
    planArguments,
    planResolver,
    printEdgePlausibilityNotes,
    readCouponDiscountPercents,
    readFraction,
    readInteger,
    readNonNegativeNumber,
    readPositiveInteger,
    readPositiveNumber,
    readRebuyLagDays,
    rebuyLagDaysArgument,
    toCouponDiscounts,
    type TradingArguments,
    tradingArguments,
} from '~/cli/commands/prop/shared';
import { ui } from '~/cli/ui';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    type AccountState,
    type CouponDiscounts,
    type DayPolicy,
    DEFAULT_ACTION_STEP_MULTIPLE,
    DEFAULT_CUSHION_STEP_MULTIPLE,
    DEFAULT_MAX_ACTION_MULTIPLE,
    DEFAULT_MAX_CUSHION_MULTIPLE,
    DEFAULT_MAX_TAIL_CUSHION_MULTIPLE,
    DEFAULT_TAIL_CUSHION_STEP_MULTIPLE,
    describeFundedResetTerms,
    type Dollars,
    dollars,
    effectivePayoutRequest,
    type Fraction0to1,
    fundedResetDpModelSentence,
    fundedResetsBeforeFirstPayout,
    type InstrumentSymbol,
    isEvalDpEligible,
    type PayoutRequestPolicy,
    type Plan,
    type PositionSizingConfig,
    RenewalCycleObjective,
    resolvePositionSizing,
    type SimInputs,
    type SimOutputs,
    simulate,
    TRADING_DAYS_PER_YEAR,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    type AverageRewardConfig,
    RateSearchStatus,
    solveAverageRewardPolicy,
} from '~/lib/prop-calculator/core/AverageRewardSolver';
import {
    type FundedDpModelGap,
    FundedDpModelGapKind,
    fundedDpModelGaps,
    fundedGridSaturationGap,
} from '~/lib/prop-calculator/core/FundedDpModelGaps';
import {
    type FundedStateValueResult,
    isFundedDpEligible,
    warmFirmsRegistryCache,
    withRegistryPlanOptIns,
} from '~/lib/prop-calculator/core/FundedStateValue';

export interface DpArguments
    extends
        CouponDiscountArguments,
        Pick<
            TradingArguments,
            | 'early-withdrawal'
            | 'funded-reset'
            | 'instrument'
            | 'request-size'
            | 'retain-cushion'
            | 'stop-points'
        > {
    'action-step-multiple'?: string;
    'copy-accounts': string;
    'cushion-step-multiple'?: string;
    'eval-days': string;
    'funded-days': string;
    iterations: string;
    'max-action-multiple'?: string;
    'max-cushion-multiple'?: string;
    'max-tail-cushion-multiple'?: string;
    'payout-policy': PayoutRequestPolicy;
    'rebuy-lag-days': string;
    rr: string;
    seed: string;
    'tail-cushion-step-multiple'?: string;
    trials: string;
    winrate: string;
}

export interface DpInputs {
    actionStepMultiple: number | undefined;
    copyAccounts: number;
    cushionStepMultiple: number | undefined;
    discounts: CouponDiscounts | undefined;
    fundedHorizonDays: number;
    instrument: InstrumentSymbol | undefined;
    maxActionMultiple: number | undefined;
    maxCushionMultiple: number | undefined;
    maxEvalDays: number;
    maxSolves: number;
    maxTailCushionMultiple: number | undefined;
    minRetainedCushion: number;
    payoutRequestPolicy: PayoutRequestPolicy;
    payoutRequestSize: Dollars | undefined;
    rebuyLagDays: number;
    rrRatio: number;
    seed: number;
    stopPoints: number | undefined;
    tailCushionStepMultiple: number | undefined;
    trials: number;
    winrate: Fraction0to1;
}

type ResolvedCushionGrid = FundedStateValueResult['cushionGrid'];

interface DpCushionGrid {
    cushionStepMultiple: number;
    hasTail: boolean;
    maxCushionMultiple: number;
    maxTailCushionMultiple: number;
    tailCushionStepMultiple: number;
}

export const EMPIRICAL_MAX_ATTEMPTS = 1000;

export interface DpPolicies {
    evalDayPolicy: DayPolicy;
    fundedDayPolicy: DayPolicy;
}

export interface FundedGridSaturationTally {
    fundedDayCount: number;
    saturatedDayCount: number;
}

export function bundleRenewalNote(
    objective: RenewalCycleObjective,
): null | string {
    const bundlePercent = objective.purchaseDiscounts?.bundlePercent ?? 0;
    return bundlePercent <= 0
        ? null
        : `${objective.plan.label}: with ${objective.copyAccounts} copy-traded accounts, this DP and its simulate() cross-check re-buy all of them together at every renewal and apply the ${formatPercent(bundlePercent / 100)} bundle discount to each renewal cycle's first eval fee and activation fee. The cash-flow timeline instead runs each account slot on its own and gives the bundle discount only to each slot's first purchase, so the two differ on repeat purchases. Which one matches the firm's checkout for a re-purchase is an open question.`;
}

export function dpGridSettingsLine(
    plan: Plan,
    inputs: DpInputs,
    resolved: ResolvedCushionGrid,
): string {
    const requested = resolveDpCushionGrid(inputs);
    const multipleWithDollars = (dollarsValue: number): string =>
        `${drawdownMultiple(plan, dollarsValue)}x (${formatCurrency(dollarsValue)})`;
    const fineStep = `${drawdownMultiple(plan, resolved.fineStepDollars)}x the drawdown (${formatCurrency(resolved.fineStepDollars)})`;
    const fineTop = drawdownMultiple(plan, resolved.fineTopDollars);
    const tailTop = drawdownMultiple(plan, resolved.tailTopDollars);
    const grid =
        tailTop > fineTop
            ? `fine steps of ${fineStep} up to ${multipleWithDollars(resolved.fineTopDollars)}, then coarse steps of ${multipleWithDollars(resolved.tailStepDollars)} up to ${multipleWithDollars(resolved.tailTopDollars)}`
            : `uniform steps of ${fineStep} up to ${multipleWithDollars(resolved.fineTopDollars)}`;
    const disclosures: string[] = [];
    if (fineTop > requested.maxCushionMultiple) {
        disclosures.push(
            `the fine range reaches ${fineTop}x instead of the ${requested.maxCushionMultiple}x that --max-cushion-multiple asks for, because it must cover the largest swing one trading day can make or the pre-lock offset range`,
        );
    }
    if (
        inputs.maxTailCushionMultiple !== undefined &&
        inputs.maxTailCushionMultiple !== tailTop
    ) {
        disclosures.push(
            `--max-tail-cushion-multiple asked for ${inputs.maxTailCushionMultiple}x`,
        );
    }
    return [`funded cushion grid: ${grid}`, ...disclosures].join('; ');
}

export function dpPayoutSettingsLine(plan: Plan, inputs: DpInputs): string {
    const resolvedRequestSize = resolvedPayoutRequestSize(inputs, plan);
    const request =
        resolvedRequestSize === undefined
            ? 'the whole withdrawable amount'
            : formatCurrency(resolvedRequestSize);
    return `payouts in the DP and the empirical run: retained cushion ${formatCurrency(plan.resolveRetainedCushion(inputs.minRetainedCushion))} (the larger of --retain-cushion ${formatCurrency(inputs.minRetainedCushion)} and the plan floor ${formatCurrency(plan.defaultRetainedCushion())}), payout request ${request}`;
}

export function dpSolverConfig(
    inputs: DpInputs,
    objective: RenewalCycleObjective,
): AverageRewardConfig {
    const positionSizing = resolvedPositionSizing(inputs);
    const evalDrawdownAmount =
        objective.plan.drawdownFor(TradingPhase.Eval).amount;
    const evalDollarsAt = (multiple: number | undefined): number | undefined =>
        multiple === undefined ? undefined : multiple * evalDrawdownAmount;
    return {
        evalGrid: {
            actionStepDollars: evalDollarsAt(inputs.actionStepMultiple),
            cushionStepDollars: evalDollarsAt(inputs.cushionStepMultiple),
            maxActionDollars: evalDollarsAt(inputs.maxActionMultiple),
            positionSizing,
        },
        fundedGrid: {
            actionStepMultiple: inputs.actionStepMultiple,
            cushionStepMultiple: inputs.cushionStepMultiple,
            maxActionMultiple: inputs.maxActionMultiple,
            maxCushionMultiple: inputs.maxCushionMultiple,
            maxTailCushionMultiple: inputs.maxTailCushionMultiple,
            minRetainedCushion: inputs.minRetainedCushion,
            payoutRequestPolicy: inputs.payoutRequestPolicy,
            payoutRequestSize: resolvedPayoutRequestSize(
                inputs,
                objective.plan,
            ),
            positionSizing,
            tailCushionStepMultiple: inputs.tailCushionStepMultiple,
        },
        maxSolves: inputs.maxSolves,
        objective,
        rrRatio: inputs.rrRatio,
        winrate: inputs.winrate,
    };
}

export function empiricalSimInputs(
    inputs: DpInputs,
    plan: Plan,
    policies: DpPolicies,
): SimInputs {
    return {
        copyAccounts: inputs.copyAccounts,
        discounts: inputs.discounts,
        evalDayPolicy: policies.evalDayPolicy,
        fundedDayPolicy: policies.fundedDayPolicy,
        fundedHorizonDays: inputs.fundedHorizonDays,
        instrument: inputs.instrument,
        maxAttempts: EMPIRICAL_MAX_ATTEMPTS,
        maxEvalDays: inputs.maxEvalDays,
        minRetainedCushion: inputs.minRetainedCushion,
        payoutRequestPolicy: inputs.payoutRequestPolicy,
        payoutRequestSize: resolvedPayoutRequestSize(inputs, plan),
        plan,
        rebuyLagDays: inputs.rebuyLagDays,
        riskPerTrade: 1,
        rrRatio: inputs.rrRatio,
        seed: inputs.seed,
        stopPoints: inputs.stopPoints,
        tradesPerDay: 1,
        trials: inputs.trials,
        winrate: inputs.winrate,
    };
}

export function empiricalSummaryLines(
    out: SimOutputs,
    predictedMonthlyRate: number,
    copyAccounts: number,
): string[] {
    const monthlyNetPerSlot = out.expectedMonthlyNet / copyAccounts;
    return [
        `eventual eval pass within the ${EMPIRICAL_MAX_ATTEMPTS}-attempt retry cap: ${formatPercent(out.evalPassProbability)}`,
        `funded survive: ${formatPercent(out.fundedSurvivalProbability)}`,
        `funded bust probability: ${formatPercent(out.fundedBustProbability)}`,
        `expected monthly net per account slot: ${formatCurrency(monthlyNetPerSlot)}`,
        `expected horizon credit per cycle: ${formatCurrency(out.expectedHorizonCredit / copyAccounts)}`,
        `gap vs DP-predicted monthly rate: ${formatCurrency(monthlyNetPerSlot - predictedMonthlyRate)}`,
    ];
}

export function fundedConsistencyGridNote(
    plan: Plan,
    resolved: ResolvedCushionGrid,
): null | string {
    const rule = plan.fundedConsistencyRule();
    if (rule === null) return null;
    const lockedTop = drawdownMultiple(plan, resolved.lockedTopDollars);
    const fineTop = drawdownMultiple(plan, resolved.fineTopDollars);
    const gridShape =
        lockedTop > fineTop
            ? `a fine grid up to ${fineTop}, then a coarse tail past it`
            : `a uniform grid up to ${lockedTop}`;
    return `${plan.label}: its funded best-day consistency rule (${rule.shareLabel()}) makes the account build up profit before each payout, but this DP's locked cushion grid stops at ${lockedTop} drawdowns (${gridShape}) and truncates any balance above that. The best day is tracked on the cushion grid and rounded up between grid steps, but a day that ends above the grid top is truncated like the balance, which shrinks both that day's P&L and the cycle profit the rule compares it with. In those states the DP can pay out less than the real account, and it can also allow a payout the real rule denies or deny one it allows: neither direction is guaranteed there, so trust the empirical run below over the DP-predicted rate. The best day is also capped at the largest swing one trading day can produce on this grid (trades per day times the largest position times the reward-to-risk ratio, at least 1, plus one cushion step per trade for grid rounding), and a day that rounds past that is clamped down to that cap, which understates the best day and so can let the DP allow a payout the real rule denies.`;
}

export function fundedCycleBaselineGapWarning(
    plan: Plan,
    result: Pick<FundedStateValueResult, 'cycleBaselineRounding'>,
): null | string {
    const rounding = result.cycleBaselineRounding;
    return rounding === null
        ? null
        : `${plan.label}: this DP tracks the balance left after each payout on a grid that turns coarse past its fine range (cycleBaselineFineRangeMultiple): from ${formatCurrency(rounding.coarseFromDollars)} above the locked payout floor it steps by ${formatCurrency(rounding.coarseStepDollars)} and rounds a post-payout balance up to the next step, up to the grid top at ${formatCurrency(rounding.topDollars)} above that floor. Within the grid, rounding up can only understate the profit the DP counts toward the next payout, never overstate it: a conservative bias toward smaller or later payouts. A post-payout balance above the grid top, which the cushion grid also truncates, is clamped down to the top level instead, so there the DP can overstate that profit. The empirical run below tracks the exact balance.`;
}

export function fundedDpModelGapWarning(plan: Plan): null | string {
    const gaps = fundedDpModelGaps(plan);
    if (gaps.length === 0) return null;
    const described = gaps.map(describeFundedDpModelGap).join('; ');
    return `${plan.label}: ${described}.`;
}

export function fundedGridSaturationLine(shareAtOrAboveTop: number): string {
    return `funded grid saturation: ${formatPercent(shareAtOrAboveTop)} of funded trial-days had a cushion or post-payout balance at or above this DP's grid top`;
}

export function fundedGridSaturationWarning(
    plan: Plan,
    shareAtOrAboveTop: number,
): null | string {
    const gap = fundedGridSaturationGap(shareAtOrAboveTop);
    return gap === null
        ? null
        : `${plan.label}: ${describeFundedDpModelGap(gap)}.`;
}

export function fundedIneligibilityMessage(plan: Plan): string {
    return `${plan.label}: funded phase is not DP-eligible (intraday-trailing drawdown, a funded daily loss limit that scales continuously with peak-day-close profit (PeakProfitShare), no drawdown lock / ReleaseFloor payout effect, or a payout cap keyed on cumulative qualifying days (QualifyingDaysMilestonePayoutCap)).`;
}

export function fundedResetModelNote(plan: Plan): null | string {
    const policy = plan.fundedReset;
    return policy === null || fundedResetsBeforeFirstPayout(plan) === 0
        ? null
        : `${plan.label}: takes the ${describeFundedResetTerms(policy)}. ${fundedResetDpModelSentence('This DP values every reset exactly')}`;
}

export function fundedValueIterationLine(
    result: Pick<FundedStateValueResult, 'sweepCount' | 'valueErrorBound'>,
): string {
    return `funded value iteration: ${result.sweepCount} sweeps, every funded state value within ${formatCurrency(result.valueErrorBound, 2)} of the DP's exact fixed point`;
}

export function instrumentFundedDayPolicyForSaturation(
    dayPolicy: DayPolicy,
    checkGridSaturation: FundedStateValueResult['isGridSaturated'],
    tally: FundedGridSaturationTally,
): DayPolicy {
    const { computeRisk } = dayPolicy;
    if (computeRisk === undefined) return dayPolicy;
    return {
        ...dayPolicy,
        computeRisk: (state, tradeIndexToday, fundedCycle) => {
            if (tradeIndexToday === 0) {
                tally.fundedDayCount += 1;
                if (checkGridSaturation(state, fundedCycle)) {
                    tally.saturatedDayCount += 1;
                }
            }
            return computeRisk(state, tradeIndexToday, fundedCycle);
        },
    };
}

export function readDpInputs(arguments_: DpArguments): DpInputs {
    const requestSize = arguments_['request-size'];
    const stopPoints = arguments_['stop-points'];
    const inputs: DpInputs = {
        actionStepMultiple: readOptionalPositiveNumber(
            arguments_['action-step-multiple'],
            'action-step-multiple',
        ),
        copyAccounts: readPositiveInteger(
            arguments_['copy-accounts'],
            'copy-accounts',
        ),
        cushionStepMultiple: readOptionalPositiveNumber(
            arguments_['cushion-step-multiple'],
            'cushion-step-multiple',
        ),
        discounts: toCouponDiscounts(readCouponDiscountPercents(arguments_)),
        fundedHorizonDays: readPositiveInteger(
            arguments_['funded-days'],
            'funded-days',
        ),
        instrument: arguments_.instrument,
        maxActionMultiple: readOptionalPositiveNumber(
            arguments_['max-action-multiple'],
            'max-action-multiple',
        ),
        maxCushionMultiple: readOptionalPositiveNumber(
            arguments_['max-cushion-multiple'],
            'max-cushion-multiple',
        ),
        maxEvalDays: readPositiveInteger(arguments_['eval-days'], 'eval-days'),
        maxSolves: readPositiveInteger(arguments_.iterations, 'iterations'),
        maxTailCushionMultiple: readOptionalPositiveNumber(
            arguments_['max-tail-cushion-multiple'],
            'max-tail-cushion-multiple',
        ),
        minRetainedCushion: readNonNegativeNumber(
            arguments_['retain-cushion'],
            'retain-cushion',
        ),
        payoutRequestPolicy: arguments_['payout-policy'],
        payoutRequestSize:
            requestSize === undefined
                ? undefined
                : dollars(readPositiveNumber(requestSize, 'request-size')),
        rebuyLagDays: readRebuyLagDays(arguments_['rebuy-lag-days']),
        rrRatio: readPositiveNumber(arguments_.rr, 'rr'),
        seed: readInteger(arguments_.seed, 'seed'),
        stopPoints:
            stopPoints === undefined
                ? undefined
                : readPositiveNumber(stopPoints, 'stop-points'),
        tailCushionStepMultiple: readOptionalPositiveNumber(
            arguments_['tail-cushion-step-multiple'],
            'tail-cushion-step-multiple',
        ),
        trials: readPositiveInteger(arguments_.trials, 'trials'),
        winrate: readFraction(arguments_.winrate, 'winrate'),
    };
    assertCushionGridFlagsConsistent(inputs);
    return inputs;
}

export function registryWarmUpFailureWarning(error: Error): string {
    return `the firm registry warm-up failed (${error.message}), so this solve falls back to one thread: the results are unchanged, it only runs slower`;
}

export function renewalObjective(
    inputs: DpInputs,
    plan: Plan,
): RenewalCycleObjective {
    return new RenewalCycleObjective({
        copyAccounts: inputs.copyAccounts,
        discounts: inputs.discounts,
        fundedHorizonDays: inputs.fundedHorizonDays,
        maxEvalDays: inputs.maxEvalDays,
        plan,
        rebuyLagDays: inputs.rebuyLagDays,
    });
}

export function resolveDpPlan(
    arguments_: Parameters<typeof planResolver.resolveOne>[0] &
        Pick<DpArguments, 'early-withdrawal' | 'funded-reset'>,
): Plan {
    return withRegistryPlanOptIns(planResolver.resolveOne(arguments_), {
        takesFundedReset: arguments_['funded-reset'] ?? false,
        takesOneTimeEarlyWithdrawal: arguments_['early-withdrawal'] ?? false,
    });
}

export function shareAtOrAboveGridTop(
    tally: FundedGridSaturationTally,
): number {
    return tally.fundedDayCount === 0
        ? 0
        : tally.saturatedDayCount / tally.fundedDayCount;
}

function assertCushionGridFlagsConsistent(
    inputs: Pick<
        DpInputs,
        | 'cushionStepMultiple'
        | 'maxCushionMultiple'
        | 'maxTailCushionMultiple'
        | 'tailCushionStepMultiple'
    >,
): void {
    const grid = resolveDpCushionGrid(inputs);
    if (
        grid.hasTail &&
        grid.tailCushionStepMultiple < grid.cushionStepMultiple
    ) {
        throw new Error(
            `--tail-cushion-step-multiple (${flagValueWithDefaultNote(grid.tailCushionStepMultiple, inputs.tailCushionStepMultiple === undefined)}) must be at least --cushion-step-multiple (${flagValueWithDefaultNote(grid.cushionStepMultiple, inputs.cushionStepMultiple === undefined)}): the day tree's search windows are sized from the fine step, so a finer tail step would under-cover the reachable range there`,
        );
    }
    if (
        inputs.maxTailCushionMultiple !== undefined &&
        inputs.maxTailCushionMultiple < grid.maxCushionMultiple
    ) {
        throw new Error(
            `--max-tail-cushion-multiple (${inputs.maxTailCushionMultiple}) must be at least --max-cushion-multiple (${flagValueWithDefaultNote(grid.maxCushionMultiple, inputs.maxCushionMultiple === undefined)}), since the tail starts where the fine grid ends`,
        );
    }
}

function describeFundedDpModelGap(gap: FundedDpModelGap): string {
    switch (gap.kind) {
        case FundedDpModelGapKind.CalendarWeekInactivityIgnored: {
            return gap.message;
        }
        case FundedDpModelGapKind.FundedGridSaturationHigh: {
            return `its funded replay reports ${formatPercent(gap.shareAtOrAboveTop)} of funded trial-days with a cushion or post-payout balance at or above this DP's grid top (N-86): those days are clamped to the top cell, which distorts both the predicted value and the policy there, so trust the empirical run below over the DP-predicted rate`;
        }
        case FundedDpModelGapKind.LifetimeDollarCapIgnored: {
            return `has a lifetime payout-dollar cap of ${formatCurrency(gap.maxLifetimePayoutDollars)} (maxLifetimePayoutDollars) that this DP ignores entirely: it never restores FundedCycleTracker.cumulativePayout from any state, so it is optimistic about payouts past that total`;
        }
        case FundedDpModelGapKind.PayoutCountTierBeyondRegimeCap: {
            return `has a payout-count-tiered payout cap tier starting at payout #${gap.fromPayoutIndex + 1}, beyond this DP's payout-count regime cap of ${gap.payoutRegimeCap}, and payout counts past the cap saturate at the cap bucket inside it, so that tier is not modeled exactly`;
        }
        case FundedDpModelGapKind.PayoutFloorReleaseUnvalidated: {
            return "resets its funded drawdown floor to breakeven on every payout (PayoutFloorEffect.ReleaseFloor), and at this DP's default grid its predicted rate overstated its own empirical replay on TopStep plans (audit N-89): trust the empirical replay line below over the predicted rate, and compare the result against the best flat row from optimize funded";
        }
        case FundedDpModelGapKind.PayoutTriggeredLockPreLockOffsetSaturates: {
            return `locks its funded drawdown only on the first payout (no profit trigger), so its floor can trail without bound before that payout while this DP's pre-lock offset grid stops at a fixed multiple of the drawdown. Offsets past it saturate at the top bucket, so the DP understates the balance (and the first payout) in those rare high-profit states before the first payout, making it slightly pessimistic`;
        }
    }
}

function drawdownMultiple(plan: Plan, dollarsValue: number): number {
    return Number((dollarsValue / plan.fundedDrawdown.amount).toFixed(6));
}

function flagValueWithDefaultNote(value: number, isDefault: boolean): string {
    return isDefault ? `${value}, the default` : String(value);
}

function readOptionalPositiveNumber(
    raw: string | undefined,
    name: string,
): number | undefined {
    return raw === undefined ? undefined : readPositiveNumber(raw, name);
}

function resolvedPayoutRequestSize(
    inputs: DpInputs,
    plan: Plan,
): Dollars | undefined {
    return inputs.payoutRequestSize === undefined
        ? undefined
        : effectivePayoutRequest(plan, inputs.payoutRequestSize);
}

function resolveDpCushionGrid(
    inputs: Pick<
        DpInputs,
        | 'cushionStepMultiple'
        | 'maxCushionMultiple'
        | 'maxTailCushionMultiple'
        | 'tailCushionStepMultiple'
    >,
): DpCushionGrid {
    const maxCushionMultiple =
        inputs.maxCushionMultiple ?? DEFAULT_MAX_CUSHION_MULTIPLE;
    const maxTailCushionMultiple = Math.max(
        maxCushionMultiple,
        inputs.maxTailCushionMultiple ?? DEFAULT_MAX_TAIL_CUSHION_MULTIPLE,
    );
    return {
        cushionStepMultiple:
            inputs.cushionStepMultiple ?? DEFAULT_CUSHION_STEP_MULTIPLE,
        hasTail: maxTailCushionMultiple > maxCushionMultiple,
        maxCushionMultiple,
        maxTailCushionMultiple,
        tailCushionStepMultiple:
            inputs.tailCushionStepMultiple ??
            DEFAULT_TAIL_CUSHION_STEP_MULTIPLE,
    };
}

function resolvedPositionSizing(inputs: DpInputs): null | PositionSizingConfig {
    return resolvePositionSizing(inputs.instrument, inputs.stopPoints);
}

function sampleRisks(dayPolicy: DayPolicy, state: AccountState): number[] {
    const slots = dayPolicy.ladder.length;
    return Array.from({ length: slots }, (_, index) =>
        Math.round(dayPolicy.computeRisk?.(state, index) ?? 0),
    );
}

export const dpArguments = {
    ...planArguments,
    ...couponDiscountArguments,
    ...copyAccountsArgument,
    'action-step-multiple': {
        description: `Funded and eval DP action-step grid size, as a multiple of the plan's own drawdown amount (default ${DEFAULT_ACTION_STEP_MULTIPLE}). Coarsen this with --max-action-multiple for a fast ablation solve (N-86): a full-precision TopStep-style solve can take well over an hour, a coarse one takes minutes.`,
        type: 'string',
    },
    'cushion-step-multiple': {
        description: `Funded and eval DP cushion-step grid size, as a multiple of the plan's own drawdown amount (default ${DEFAULT_CUSHION_STEP_MULTIPLE}). The funded DP interpolates between adjacent cushion cells at every day close, so coarsening this trades precision for solve time rather than introducing the old floor-rounding bias (N-86).`,
        type: 'string',
    },
    'early-withdrawal': tradingArguments['early-withdrawal'],
    'eval-days': {
        default: '40',
        description:
            'Maximum evaluation days before timeout. The DP’s eval state space grows directly with this (one full day-dimension per value tracked), so raising it well past how long the plan realistically takes to pass will make the solve dramatically slower: 150 (a normal --eval-days default elsewhere in this CLI) is impractically slow here even after the DP performance fix. Check cli prop ladder’s own expected-days-to-funded figure for this plan first and set this a bit above that.',
        type: 'string',
    },
    'funded-days': {
        default: String(TRADING_DAYS_PER_YEAR),
        description:
            'Funded-phase horizon for the empirical validation run. Also sets the DP’s mean horizon: the funded value function treats horizon end as a memoryless hazard of 1/this-many-days per funded day.',
        type: 'string',
    },
    'funded-reset': tradingArguments['funded-reset'],
    instrument: commonSimArguments.instrument,
    iterations: {
        default: '12',
        description:
            'Max rate-search solves (each is one eval plus one funded solve). Stops early once the average-reward rate converges.',
        type: 'string',
    },
    'max-action-multiple': {
        description: `Funded and eval DP max action size, as a multiple of the plan's own drawdown amount (default ${DEFAULT_MAX_ACTION_MULTIPLE}).`,
        type: 'string',
    },
    'max-cushion-multiple': {
        description: `Funded DP cushion grid fine-range top, as a multiple of the plan's own drawdown amount (default ${DEFAULT_MAX_CUSHION_MULTIPLE}). Past this point the grid continues as a coarser tail (N-86) up to ${DEFAULT_MAX_TAIL_CUSHION_MULTIPLE} drawdowns by default, so the DP's real cushion grid top is wider than this flag alone. The fine range is also widened past this flag when one trading day can swing further than it, and the grid line printed after the solve shows the range actually used.`,
        type: 'string',
    },
    'max-tail-cushion-multiple': {
        description: `Funded DP cushion grid top, as a multiple of the plan's own drawdown amount (default ${DEFAULT_MAX_TAIL_CUSHION_MULTIPLE}). Must be at least --max-cushion-multiple; equal to it turns the coarse tail off.`,
        type: 'string',
    },
    ...payoutRequestPolicyArgument,
    ...rebuyLagDaysArgument,
    'request-size': commonSimArguments['request-size'],
    'retain-cushion': tradingArguments['retain-cushion'],
    rr: {
        default: '2',
        description: 'Reward to risk ratio',
        type: 'string',
    },
    seed: {
        default: '42',
        description: 'RNG seed for the empirical validation run',
        type: 'string',
    },
    'stop-points': commonSimArguments['stop-points'],
    'tail-cushion-step-multiple': {
        description: `Funded DP cushion grid step in the coarse tail past --max-cushion-multiple, as a multiple of the plan's own drawdown amount (default ${DEFAULT_TAIL_CUSHION_STEP_MULTIPLE}). Must be at least --cushion-step-multiple.`,
        type: 'string',
    },
    trials: {
        default: '4000',
        description: 'Monte Carlo trials for the empirical validation run',
        type: 'string',
    },
    winrate: {
        default: '0.4',
        description: 'Win rate as a fraction 0-1 (e.g. 0.4)',
        type: 'string',
    },
} satisfies ArgsDef;

export default defineCommand({
    args: dpArguments,
    meta: {
        description:
            'Solve the average-reward eval+funded value-iteration DP for one plan (--firm, --variant): a state-dependent risk policy (risk depends on current balance/profit/day, not a fixed ladder) that maximizes expected net cash per month per account slot, replacement priced in via --rebuy-lag-days, cross-checked against a real simulate() run.',
        name: 'dp',
    },
    async run(context) {
        let spinner: ReturnType<typeof ui.spinner> | undefined;
        try {
            const warmUpFailure = await warmFirmsRegistryCache();
            if (warmUpFailure !== null) {
                ui.fail(registryWarmUpFailureWarning(warmUpFailure));
            }
            const plan = resolveDpPlan(context.args);
            if (plan.isInstantFunded) {
                ui.warn(
                    `${plan.label} is instant-funded, so there is no eval phase for the DP to solve. Use a fixed funded-phase policy sweep instead (cli prop optimize funded).`,
                );
                return;
            }
            if (!isEvalDpEligible(plan)) {
                ui.warn(
                    `${plan.label}: eval phase is not DP-eligible (intraday-trailing drawdown, an eval daily loss limit that scales continuously with peak-day-close profit (PeakProfitShare), or an eval tier keyed on the intraday peak (TierBasis.PeakIntradayProfit), which the eval DP does not track).`,
                );
                return;
            }
            if (!isFundedDpEligible(plan)) {
                ui.warn(fundedIneligibilityMessage(plan));
                return;
            }
            const modelGapWarning = fundedDpModelGapWarning(plan);
            if (modelGapWarning !== null) {
                ui.warn(modelGapWarning);
            }
            const resetNote = fundedResetModelNote(plan);
            if (resetNote !== null) {
                ui.muted(`${resetNote}\n`);
            }
            const inputs = readDpInputs(context.args);
            printEdgePlausibilityNotes([
                edgePlausibilityNote({
                    rrRatio: inputs.rrRatio,
                    winrate: inputs.winrate,
                }),
            ]);
            const { copyAccounts } = inputs;
            const objective = renewalObjective(inputs, plan);
            const bundleNote = bundleRenewalNote(objective);
            if (bundleNote !== null) {
                ui.muted(`${bundleNote}\n`);
            }
            ui.muted(`${dpPayoutSettingsLine(plan, inputs)}\n`);

            spinner = ui
                .spinner(`solving average-reward DP for ${plan.label}`)
                .start();
            const started = performance.now();
            const solution = solveAverageRewardPolicy(
                dpSolverConfig(inputs, objective),
            );
            const elapsed = (performance.now() - started) / 1000;
            const solvesUsed = solution.trace.length;
            const totalStates =
                solution.evalResult.reachedStateCount +
                solution.fundedResult.reachedStateCount;
            spinner.succeed(
                `solved ${plan.label} in ${elapsed.toFixed(1)}s (${solvesUsed} rate-search solves, ${totalStates} states)`,
            );

            const resolvedGrid = solution.fundedResult.cushionGrid;
            ui.muted(`${dpGridSettingsLine(plan, inputs, resolvedGrid)}\n`);
            const consistencyNote = fundedConsistencyGridNote(
                plan,
                resolvedGrid,
            );
            if (consistencyNote !== null) {
                ui.muted(`${consistencyNote}\n`);
            }

            const monthlyRate = objective.monthlyRate(solution.ratePerDay);

            ui.heading(plan.label);
            ui.muted(
                '  DP-predicted average reward (from the value-iteration solver itself; the geometric horizon hazard is an approximation, see empirical run below)\n',
            );
            ui.note(`  status: ${solution.status}`);
            ui.note(
                `  rate: ${formatCurrency(solution.ratePerDay, 2)}/day, ${formatCurrency(monthlyRate)}/month per account slot`,
            );
            ui.note(`  solves used: ${solvesUsed}`);
            ui.note(`  ${fundedValueIterationLine(solution.fundedResult)}`);
            const cycleBaselineGapWarning = fundedCycleBaselineGapWarning(
                plan,
                solution.fundedResult,
            );
            if (cycleBaselineGapWarning !== null) {
                ui.warn(cycleBaselineGapWarning);
            }
            ui.muted(
                '  rate-search trace (rate per day tried -> cycle value h at that rate):\n',
            );
            for (const point of solution.trace) {
                ui.note(
                    `    ${formatCurrency(point.ratePerDay, 2)}/day -> h = ${formatCurrency(point.cycleValue)}`,
                );
            }

            const gridSaturationTally: FundedGridSaturationTally = {
                fundedDayCount: 0,
                saturatedDayCount: 0,
            };
            const out = simulate(
                empiricalSimInputs(inputs, plan, {
                    evalDayPolicy: solution.evalResult.dayPolicy,
                    fundedDayPolicy: instrumentFundedDayPolicyForSaturation(
                        solution.fundedResult.dayPolicy,
                        solution.fundedResult.isGridSaturated,
                        gridSaturationTally,
                    ),
                }),
            );

            ui.muted(
                `\n  empirical (real simulate() run driven end-to-end by the DP’s own policy, failed evals retried up to ${EMPIRICAL_MAX_ATTEMPTS} times at the retry fee like the DP, same coupons and copy count; trust this over the predicted values above)\n`,
            );
            for (const line of empiricalSummaryLines(
                out,
                monthlyRate,
                copyAccounts,
            )) {
                ui.note(`  ${line}`);
            }
            const gridSaturationShare = shareAtOrAboveGridTop(
                gridSaturationTally,
            );
            ui.note(`  ${fundedGridSaturationLine(gridSaturationShare)}`);
            const gridSaturationWarning = fundedGridSaturationWarning(
                plan,
                gridSaturationShare,
            );
            if (gridSaturationWarning !== null) {
                ui.warn(gridSaturationWarning);
            }

            const evalSampleState = plan.initialState();
            const fundedSampleState = plan.initialState();
            plan.beginFundedPhase(fundedSampleState);

            ui.muted(
                '\n  sample risk at the very first day (this is NOT a fixed ladder: it is one snapshot of a function that changes with balance/profit/day; re-run this command’s dashboard mentally as your account moves)\n',
            );
            ui.note(
                `  eval, day 1, trade 1-${solution.evalResult.dayPolicy.ladder.length}: ${sampleRisks(
                    solution.evalResult.dayPolicy,
                    evalSampleState,
                )
                    .map((r) => `$${r}`)
                    .join(' / ')}`,
            );
            ui.note(
                `  funded, day 1, trade 1-${solution.fundedResult.dayPolicy.ladder.length}: ${sampleRisks(
                    solution.fundedResult.dayPolicy,
                    fundedSampleState,
                )
                    .map((r) => `$${r}`)
                    .join(' / ')}`,
            );

            if (
                solution.status !== RateSearchStatus.Converged ||
                solution.fundedResult.unconvergedLevelCount > 0
            ) {
                ui.warn(
                    `${plan.label}: rate search did not converge (status=${solution.status}, unconverged funded levels=${solution.fundedResult.unconvergedLevelCount}), so treat the numbers above as unreliable; consider raising --iterations.`,
                );
                process.exitCode = 1;
            }
        } catch (error) {
            spinner?.fail();
            ui.fail(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
});
