import type { ArgsDef } from 'citty';

import { z } from 'zod';

import { ui } from '~/cli/ui';
import { formatCurrency, formatPercent, NOT_APPLICABLE } from '~/lib/format';
import {
    ALL_FIRMS,
    type CouponDiscounts,
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    DEFAULT_PAYOUT_REQUEST_POLICY,
    describeFundedResetTerms,
    type Dollars,
    dollars,
    EdgeModelKind,
    type EdgeModelSpec,
    findFirm,
    FirmId,
    formatWholeCentDollars,
    fraction,
    type Fraction0to1,
    fractionSchema,
    FUNDED_RESET_MECHANICS,
    FUNDED_START_TIER_CONTRACT_LIMIT,
    INSTRUMENTS,
    type InstrumentSpec,
    InstrumentSymbol,
    ladderRungSchema,
    ladderRungsSchema,
    type LiveTransferContinuationKind,
    PayoutRequestPolicy,
    type Percent0to100,
    percentSchema,
    placedFundedRisk,
    type Plan,
    PLAN_AVAILABILITY_LABEL,
    type PlanOptIns,
    PolicySizing,
    rankablePlans,
    RungSizing,
    type SimInputs,
    type SimOutputs,
    stopLossCountSchema,
    stopTargetDollarsSchema,
    TRADING_DAYS_PER_YEAR,
    type TradingFirm,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import {
    assumptionText,
    DEFAULT_RULEBOOK,
    rulebookSchema,
    SIZING_OBJECTIVE_LABEL,
    SizingObjective,
    sizingObjectiveText,
    verifiedCumulativeTriggerOf,
} from '~/lib/prop-calculator/advisor';
import {
    objectiveApplicability,
    ObjectiveApplicabilityVerdict,
    type RankingSurface,
} from '~/lib/prop-calculator/advisor/actions';
import {
    MAX_INTRADAY_PATH_STEPS_PER_R,
    pricedCumulativeTriggerAssumptionOf,
} from '~/lib/prop-calculator/advisor/policy';
import {
    edgePlausibilityNoteText,
    type PlausibilityThresholds,
} from '~/lib/prop-calculator/economics';
import { liveTransferDisclosureLines } from '~/lib/prop-calculator/simulator';

export enum ObjectiveFlag {
    CycleCash = 'cycle',
    MonthlyNet = 'monthly',
    RuinFirst = 'ruin-first',
}

export interface BankrollArguments {
    bankroll?: string;
    'loss-threshold'?: string;
}

export interface BankrollInputs {
    readonly bankroll: Dollars | null;
    readonly lossThreshold: Fraction0to1 | null;
}

export interface CouponDiscountArguments {
    'activation-discount': string;
    'eval-discount': string;
    'monthly-discount': string;
}

export interface CouponDiscountPercents {
    readonly activationDiscountPercent: Percent0to100;
    readonly evalDiscountPercent: Percent0to100;
    readonly monthlySubscriptionDiscountPercent: Percent0to100;
}

export interface EdgeInputs {
    readonly compoundStartDollars?: number;
    readonly rrRatio: number;
    readonly tradesPerDay?: number;
    readonly winrate: Fraction0to1;
}

export interface EdgeModelArguments {
    'edge-anchor-rr'?: string;
    'edge-model': string;
}

export interface LiveTransferHazardArguments {
    'live-transfer-hazard'?: string;
}

export interface ObjectiveArguments {
    bankroll?: string;
    objective?: string;
}

export interface ScreenTime {
    readonly accountsPerSession: number;
    readonly sessionHoursPerDay: number;
}

export interface ScreenTimeArguments {
    'accounts-per-session'?: string;
    'hours-per-day'?: string;
}

export interface TableColumn {
    align?: 'left' | 'right';
    label: string;
    width: number;
}

export interface TradingArguments
    extends CouponDiscountArguments, PlanSelectorArguments {
    commission: string;
    'copy-accounts': string;
    'early-withdrawal'?: boolean;
    'eval-days': string;
    'funded-days': string;
    'funded-reset'?: boolean;
    'funded-risk'?: string;
    'funded-rr'?: string;
    'funded-tpd'?: string;
    'idle-day-probability': string;
    instrument: InstrumentSymbol;
    ladder?: string;
    'max-attempts': string;
    'max-lifetime-payouts'?: string;
    'path-granularity'?: string;
    'rebuy-lag-days': string;
    'request-size'?: string;
    'retain-cushion': string;
    risk: string;
    rr: string;
    seed: string;
    stop: string;
    'stop-points'?: string;
    tpd: string;
    trials: string;
    unaffordable: RungSizing;
    winrate: string;
}

export interface TradingEdgeNoteInputs extends EdgeInputs {
    readonly fundedRrRatio: number | undefined;
    readonly fundedTradesPerDay?: number | undefined;
}

export interface TradingInputsInit {
    activationDiscountPercent: Percent0to100;
    commissionPerRoundTrip: number;
    copyAccounts: number;
    dayStop: DayStopRule;
    evalDiscountPercent: Percent0to100;
    fundedHorizonDays: number;
    fundedRiskPerTrade: number | undefined;
    fundedRrRatio: number | undefined;
    fundedTradesPerDay: number | undefined;
    idleDayProbability: Fraction0to1;
    instrument: InstrumentSymbol | undefined;
    intradayPathStepsPerR: number[] | undefined;
    ladder: null | number[];
    liveTransferHazard: Fraction0to1 | undefined;
    maxAttempts: number;
    maxEvalDays: number;
    maxLifetimePayoutsOverride: null | number | undefined;
    minRetainedCushion: number;
    monthlySubscriptionDiscountPercent: Percent0to100;
    payoutRequestSize: number | undefined;
    rebuyLagDays: number;
    riskPerTrade: number;
    rrRatio: number;
    rungSizing: RungSizing;
    seed: number;
    stopPoints: number | undefined;
    takesFundedReset: boolean;
    takesOneTimeEarlyWithdrawal: boolean;
    tradesPerDay: number;
    trials: number;
    winrate: Fraction0to1;
}

interface PlanSelectorArguments {
    firm?: FirmId;
    variant?: string;
}

interface RankablePlans {
    readonly excluded: readonly Plan[];
    readonly plans: readonly Plan[];
}

class PlanResolver {
    constructor(private readonly firms: readonly TradingFirm[] = ALL_FIRMS) {}

    private requireFirm(firmId: FirmId): TradingFirm {
        const firm = findFirm(firmId);
        if (!firm) throw new Error(`Firm "${firmId}" is not registered.`);
        return firm;
    }

    resolveMany(selector: PlanSelectorArguments): Plan[] {
        const scoped = selector.firm
            ? [this.requireFirm(selector.firm)]
            : this.firms;
        const plans = scoped.flatMap((firm) => [...firm.plans]);

        const variant = selector.variant;
        if (variant === undefined || variant === '') {
            return plans;
        }

        const wanted = variant.toLowerCase();
        const matches = plans.filter((plan) => planVariant(plan) === wanted);
        if (matches.length === 0) {
            throw new Error(
                `Unknown --variant "${variant}". Available: ${plans.map((plan) => planVariant(plan)).join(', ')}`,
            );
        }
        return matches;
    }

    resolveRankable(
        selector: PlanSelectorArguments,
        shouldIncludeCallUp: boolean,
    ): RankablePlans {
        const matched = this.resolveMany(selector);
        const plans = rankablePlans(matched, shouldIncludeCallUp);
        const excluded = matched.filter((plan) => !plans.includes(plan));
        if (plans.length === 0 && excluded.length > 0) {
            const labels: string[] = [];
            for (const label of groupByAvailabilityLabel(excluded).keys()) {
                labels.push(label);
            }
            throw new Error(
                `--firm/--variant matched only ${labels.join(', ')} plans (${excluded.map((plan) => plan.label).join(', ')}); pass --include-callup to rank them`,
            );
        }
        return { excluded, plans };
    }

    resolveOne(selector: PlanSelectorArguments): Plan {
        const plans = this.resolveMany(selector);
        const first = plans[0];
        if (first !== undefined && plans.length === 1) return first;
        if (plans.length === 0) throw new Error('No plan matched.');
        throw new Error(
            `--firm/--variant matched ${plans.length} plans. Add --variant one of: ${plans.map((plan) => planVariant(plan)).join(', ')}`,
        );
    }
}

export class ObjectiveNotApplicable extends Error {}

export class RuinFirstNeedsBankroll extends Error {}

export class SortObjectiveConflict extends Error {}

export const RUIN_FIRST_NOT_APPLICABLE_MESSAGE =
    'RuinFirst only ranks which plan to buy; eval rungs and funded risk stay on Hard Rules 3 and 5';

export class TablePrinter {
    constructor(private readonly columns: readonly TableColumn[]) {}

    private formatRow(cells: readonly string[]): string {
        return cells
            .map((cell, index) => {
                const column = this.columns[index];
                if (!column) return cell;
                return column.align === 'left'
                    ? cell.padEnd(column.width)
                    : cell.padStart(column.width);
            })
            .join(' ');
    }

    printHeader(): void {
        ui.muted(`  ${this.formatRow(this.columns.map((c) => c.label))}`);
    }

    printRow(cells: readonly string[]): void {
        ui.note(this.formatRow(cells));
    }
}

export class TradingInputs {
    static parse(
        arguments_: LiveTransferHazardArguments & TradingArguments,
    ): TradingInputs {
        const requestSize = arguments_['request-size'];
        const stopPoints = arguments_['stop-points'];
        const fundedRisk = arguments_['funded-risk'];
        const fundedRr = arguments_['funded-rr'];
        const fundedTpd = arguments_['funded-tpd'];
        return new TradingInputs({
            ...readCouponDiscountPercents(arguments_),
            commissionPerRoundTrip: readNonNegativeNumber(
                arguments_.commission,
                'commission',
            ),
            copyAccounts: readPositiveInteger(
                arguments_['copy-accounts'],
                'copy-accounts',
            ),
            dayStop: readStopRule(arguments_.stop),
            fundedHorizonDays: readNonNegativeInteger(
                arguments_['funded-days'],
                'funded-days',
            ),
            fundedRiskPerTrade:
                fundedRisk === undefined
                    ? undefined
                    : readPositiveNumber(fundedRisk, 'funded-risk'),
            fundedRrRatio:
                fundedRr === undefined
                    ? undefined
                    : readPositiveNumber(fundedRr, 'funded-rr'),
            fundedTradesPerDay:
                fundedTpd === undefined
                    ? undefined
                    : readPositiveInteger(fundedTpd, 'funded-tpd'),
            idleDayProbability: readFraction(
                arguments_['idle-day-probability'],
                'idle-day-probability',
            ),
            instrument: arguments_.instrument,
            intradayPathStepsPerR: readGranularityList(
                arguments_['path-granularity'],
            ),
            ladder: readLadder(arguments_.ladder),
            liveTransferHazard: readLiveTransferHazard(
                arguments_['live-transfer-hazard'],
            ),
            maxAttempts: readPositiveInteger(
                arguments_['max-attempts'],
                'max-attempts',
            ),
            maxEvalDays: readPositiveInteger(
                arguments_['eval-days'],
                'eval-days',
            ),
            maxLifetimePayoutsOverride: readMaxLifetimePayouts(
                arguments_['max-lifetime-payouts'],
            ),
            minRetainedCushion: readNonNegativeNumber(
                arguments_['retain-cushion'],
                'retain-cushion',
            ),
            payoutRequestSize:
                requestSize === undefined
                    ? undefined
                    : readPositiveNumber(requestSize, 'request-size'),
            rebuyLagDays: readRebuyLagDays(arguments_['rebuy-lag-days']),
            riskPerTrade: readPositiveNumber(arguments_.risk, 'risk'),
            rrRatio: readPositiveNumber(arguments_.rr, 'rr'),
            rungSizing: arguments_.unaffordable,
            seed: readInteger(arguments_.seed, 'seed'),
            stopPoints:
                stopPoints === undefined
                    ? undefined
                    : readPositiveNumber(stopPoints, 'stop-points'),
            takesFundedReset: arguments_['funded-reset'] ?? false,
            takesOneTimeEarlyWithdrawal:
                arguments_['early-withdrawal'] ?? false,
            tradesPerDay: readPositiveInteger(arguments_.tpd, 'tpd'),
            trials: readPositiveInteger(arguments_.trials, 'trials'),
            winrate: readFraction(arguments_.winrate, 'winrate'),
        });
    }

    readonly activationDiscountPercent: Percent0to100;
    readonly commissionPerRoundTrip: number;
    readonly copyAccounts: number;
    readonly dayStop: DayStopRule;
    readonly evalDiscountPercent: Percent0to100;
    readonly fundedHorizonDays: number;
    readonly fundedRiskPerTrade: number | undefined;
    readonly fundedRrRatio: number | undefined;
    readonly fundedTradesPerDay: number | undefined;
    readonly idleDayProbability: Fraction0to1;
    readonly instrument: InstrumentSymbol | undefined;
    readonly intradayPathStepsPerR: number[] | undefined;
    readonly ladder: null | number[];
    readonly liveTransferHazard: Fraction0to1 | undefined;
    readonly maxAttempts: number;
    readonly maxEvalDays: number;
    readonly maxLifetimePayoutsOverride: null | number | undefined;
    readonly minRetainedCushion: number;
    readonly monthlySubscriptionDiscountPercent: Percent0to100;
    readonly payoutRequestSize: number | undefined;
    readonly rebuyLagDays: number;
    readonly riskPerTrade: number;
    readonly rrRatio: number;
    readonly rungSizing: RungSizing;
    readonly seed: number;
    readonly stopPoints: number | undefined;
    readonly takesFundedReset: boolean;
    readonly takesOneTimeEarlyWithdrawal: boolean;
    readonly tradesPerDay: number;
    readonly trials: number;
    readonly winrate: Fraction0to1;

    constructor(init: TradingInputsInit) {
        this.activationDiscountPercent = init.activationDiscountPercent;
        this.commissionPerRoundTrip = init.commissionPerRoundTrip;
        this.copyAccounts = init.copyAccounts;
        this.dayStop = init.dayStop;
        this.evalDiscountPercent = init.evalDiscountPercent;
        this.fundedHorizonDays = init.fundedHorizonDays;
        this.fundedRiskPerTrade = init.fundedRiskPerTrade;
        this.fundedRrRatio = init.fundedRrRatio;
        this.fundedTradesPerDay = init.fundedTradesPerDay;
        this.idleDayProbability = init.idleDayProbability;
        this.instrument = init.instrument;
        this.intradayPathStepsPerR = init.intradayPathStepsPerR;
        this.ladder = init.ladder;
        this.liveTransferHazard = init.liveTransferHazard;
        this.maxAttempts = init.maxAttempts;
        this.maxEvalDays = init.maxEvalDays;
        this.maxLifetimePayoutsOverride = init.maxLifetimePayoutsOverride;
        this.minRetainedCushion = init.minRetainedCushion;
        this.monthlySubscriptionDiscountPercent =
            init.monthlySubscriptionDiscountPercent;
        this.payoutRequestSize = init.payoutRequestSize;
        this.rebuyLagDays = init.rebuyLagDays;
        this.riskPerTrade = init.riskPerTrade;
        this.rrRatio = init.rrRatio;
        this.rungSizing = init.rungSizing;
        this.seed = init.seed;
        this.stopPoints = init.stopPoints;
        this.takesFundedReset = init.takesFundedReset;
        this.takesOneTimeEarlyWithdrawal = init.takesOneTimeEarlyWithdrawal;
        this.tradesPerDay = init.tradesPerDay;
        this.trials = init.trials;
        this.winrate = init.winrate;
    }

    toCouponDiscounts(): CouponDiscounts | undefined {
        return toCouponDiscounts(this);
    }

    toDayPolicy(): DayPolicy | undefined {
        return this.ladder
            ? {
                  ladder: this.ladder,
                  maxLossesPerDay: null,
                  sizing: PolicySizing.ContractCapped,
                  stopRule: this.dayStop,
              }
            : undefined;
    }

    toPlanOptIns(): PlanOptIns {
        return {
            takesFundedReset: this.takesFundedReset,
            takesOneTimeEarlyWithdrawal: this.takesOneTimeEarlyWithdrawal,
        };
    }

    toSimInputs(plan: Plan): SimInputs {
        const cappedPlan =
            this.maxLifetimePayoutsOverride === undefined
                ? plan
                : plan.withMaxLifetimePayouts(this.maxLifetimePayoutsOverride);
        const resolvedPlan = withPlanOptIns(cappedPlan, this.toPlanOptIns());
        return {
            commissionPerRoundTrip: this.commissionPerRoundTrip,
            copyAccounts: this.copyAccounts,
            dayStop: this.dayStop,
            discounts: this.toCouponDiscounts(),
            evalDayPolicy: this.toDayPolicy(),
            fundedHorizonDays: this.fundedHorizonDays,
            fundedRiskPerTrade: this.fundedRiskPerTrade,
            fundedRrRatio: this.fundedRrRatio,
            fundedTradesPerDay: this.fundedTradesPerDay,
            idleDayProbability: this.idleDayProbability,
            instrument: this.instrument,
            intradayPathStepsPerR: this.intradayPathStepsPerR?.[0],
            liveTransferHazard: this.liveTransferHazard,
            maxAttempts: this.maxAttempts,
            maxEvalDays: this.maxEvalDays,
            minRetainedCushion: this.minRetainedCushion,
            payoutRequestSize: this.payoutRequestSize,
            plan: resolvedPlan,
            rebuyLagDays: this.rebuyLagDays,
            riskPerTrade: this.riskPerTrade,
            rrRatio: this.rrRatio,
            rungSizing: this.rungSizing,
            seed: this.seed,
            stopPoints: this.stopPoints,
            tradesPerDay: this.tradesPerDay,
            trials: this.trials,
            verifiedCumulativePayoutTrigger: verifiedPayoutTriggerOf(plan),
            winrate: this.winrate,
        };
    }
}

export const planResolver = new PlanResolver();

export const monteCarloArguments = {
    instrument: {
        default: InstrumentSymbol.NQ,
        description: `Instrument for contract-limit sizing, used with --stop-points (${Object.keys(INSTRUMENTS).join(', ')})`,
        options: Object.values(InstrumentSymbol),
        type: 'enum',
    },
    rr: { default: '2', description: 'Reward to risk ratio', type: 'string' },
    seed: { default: '42', description: 'RNG seed', type: 'string' },
    'stop-points': {
        description:
            'Stop distance in points. Enables contract-limit sizing at --instrument: eval risk is capped at the eval contract limit, and funded flat risk, funded ladder rungs and funded or live percent of cushion are placed in whole contracts, at most the contract limit. Funded flat risk and funded ladder rungs are rounded down, and a funded flat risk or ladder rung below one contract is refused; percent risk takes at least one contract. When the room left for a whole-contract trade is below one contract, the trade is skipped and the day ends if a daily loss limit that only locks the day is the tighter limit (its room is below the drawdown cushion); otherwise one contract is still taken and its loss, capped at the room, busts the account, unless unaffordable funded trades are set to be skipped (a live trade always takes the one contract). When no room is left at all, no trade is placed and the day ends. Omit to leave risk uncapped',
        type: 'string',
    },
    trials: {
        default: '4000',
        description: 'Monte Carlo trials',
        type: 'string',
    },
    winrate: {
        default: '0.4',
        description: 'Win rate as a fraction 0-1 (e.g. 0.4)',
        type: 'string',
    },
} satisfies ArgsDef;

export const commonSimArguments = {
    ...monteCarloArguments,
    'request-size': {
        description: 'Withdraw this much per payout request (default: all)',
        type: 'string',
    },
    tpd: {
        default: '4',
        description: 'Trades per day when using flat risk',
        type: 'string',
    },
} satisfies ArgsDef;

export const rebuyLagDaysArgument = {
    'rebuy-lag-days': {
        default: '0',
        description:
            'days an account slot sits empty for every eval attempt, the first included: rebuy, credential delivery, activation review',
        type: 'string',
    },
} satisfies ArgsDef;

export const commissionArgument = {
    commission: {
        default: '0',
        description: 'Commission per round trip in account currency',
        type: 'string',
    },
} satisfies ArgsDef;

export const payoutRequestPolicyArgument = {
    'payout-policy': {
        default: DEFAULT_PAYOUT_REQUEST_POLICY,
        description: `How a payout request is settled once every firm gate passes: ${PayoutRequestPolicy.UpToRequest} pays min(--request-size, withdrawable), down to the plan minimum; ${PayoutRequestPolicy.FullRequestOnly} pays only the requested amount in full (or a firm cap that makes the full amount impossible, such as a payout ladder step), waiting otherwise. Needs --request-size when set to ${PayoutRequestPolicy.FullRequestOnly}`,
        options: Object.values(PayoutRequestPolicy),
        type: 'enum',
    },
} satisfies ArgsDef;

export const idleDayProbabilityArgument = {
    'idle-day-probability': {
        default: '0',
        description:
            "Probability [0,1] a day has zero trades (models e.g. MFFU Rapid EOD's 7-consecutive-idle-day account closure)",
        type: 'string',
    },
} satisfies ArgsDef;

const PATH_GRANULARITY_SCOPE =
    'Intraday path-walk resolution in steps per R for every trade taken under an IntradayTrailingDrawdown, in the eval and the funded phase alike (e.g. Apex intraday trails the intraday peak in both)';

const PATH_GRANULARITY_OMITTED =
    'omit to resolve each trade with a single win/loss draw';

export const singlePathGranularityArgument = {
    'path-granularity': {
        description: `${PATH_GRANULARITY_SCOPE}. A comma list is accepted, but only the first value is used here (prop sim compares a list side by side); ${PATH_GRANULARITY_OMITTED}`,
        type: 'string',
    },
} satisfies ArgsDef;

export const pathGranularityComparisonArgument = {
    'path-granularity': {
        description: `${PATH_GRANULARITY_SCOPE}, comma separated for a side-by-side comparison (e.g. 4,10,25); ${PATH_GRANULARITY_OMITTED}`,
        type: 'string',
    },
} satisfies ArgsDef;

export const couponDiscountArguments = {
    'activation-discount': {
        default: '0',
        description:
            'Coupon discount percent [0,100] off the one-time activation fee',
        type: 'string',
    },
    'eval-discount': {
        default: '0',
        description:
            'Coupon discount percent [0,100] off the evaluation fee. It prices the first purchase and every re-buy after a failed attempt alike, so a code whose repeat purchase costs more than its first purchase (e.g. FundedNext RAPID) under-prices each retry; prop plans prints the firm notes',
        type: 'string',
    },
    'monthly-discount': {
        default: '0',
        description:
            'Coupon discount percent [0,100] off the monthly subscription fee (e.g. a recurring firm promo)',
        type: 'string',
    },
} satisfies ArgsDef;

export const copyAccountsArgument = {
    'copy-accounts': {
        default: '1',
        description:
            'Number of identical accounts run together (multiplies per-account fees and P&L); together they are one correlated outcome and count once as pass-rate evidence',
        type: 'string',
    },
} satisfies ArgsDef;

export const purchaseArguments = {
    ...couponDiscountArguments,
    ...commissionArgument,
    ...copyAccountsArgument,
} satisfies ArgsDef;

export function groupByAvailabilityLabel(
    plans: readonly Plan[],
): ReadonlyMap<string, Plan[]> {
    const groups = new Map<string, Plan[]>();
    for (const plan of plans) {
        const label = PLAN_AVAILABILITY_LABEL[plan.availability];
        const group = groups.get(label);
        if (group === undefined) {
            groups.set(label, [plan]);
        } else {
            group.push(plan);
        }
    }
    return groups;
}

export function readCouponDiscountPercents(
    arguments_: CouponDiscountArguments,
): CouponDiscountPercents {
    return {
        activationDiscountPercent: readPercent(
            arguments_['activation-discount'],
            'activation-discount',
        ),
        evalDiscountPercent: readPercent(
            arguments_['eval-discount'],
            'eval-discount',
        ),
        monthlySubscriptionDiscountPercent: readPercent(
            arguments_['monthly-discount'],
            'monthly-discount',
        ),
    };
}

export function toCouponDiscounts(
    percents: CouponDiscountPercents,
): CouponDiscounts | undefined {
    return percents.activationDiscountPercent > 0 ||
        percents.evalDiscountPercent > 0 ||
        percents.monthlySubscriptionDiscountPercent > 0
        ? {
              activationPercent: percents.activationDiscountPercent,
              evalPercent: percents.evalDiscountPercent,
              monthlySubscriptionPercent:
                  percents.monthlySubscriptionDiscountPercent,
          }
        : undefined;
}

export const edgeModelArguments = {
    'edge-anchor-rr': {
        description:
            'Reward-to-risk ratio the drift edge model is fitted to (default: --rr). The win rate it derives there always equals --winrate; only --edge-model drift uses this',
        type: 'string',
    },
    'edge-model': {
        default: EdgeModelKind.Fixed,
        description: `How the win rate used to rank --rr-candidates is derived: ${EdgeModelKind.Fixed} (default) keeps --winrate fixed at every rr and cannot rank take-profit multiples; ${EdgeModelKind.Drift} fits a Brownian-motion-with-drift model to --winrate at --edge-anchor-rr and derives a different win rate at each candidate rr, labelled a what-if that differs from your fixed 1:2 -- never used by the headline, the rulebook or advice`,
        options: Object.values(EdgeModelKind),
        type: 'enum',
    },
} satisfies ArgsDef;

export const evalPolicyArguments = {
    'eval-days': {
        default: '150',
        description: 'Maximum evaluation days before timeout',
        type: 'string',
    },
    stop: {
        default: 'day-green',
        description:
            "Day stop rule: none, day-green, first-win, after-target:<dollars> (e.g. after-target:500 or 'after-target:$500', default 500), after-k-losses:<k> (default 2)",
        type: 'string',
    },
    unaffordable: {
        default: RungSizing.CapToCushion,
        description: `How a trade whose placed risk exceeds the room left (the lower of the drawdown cushion and the daily loss room) is handled: ${RungSizing.CapToCushion} cuts it to the room (a whole-contract trade keeps the whole contracts that fit; --stop-points says when one contract is still taken if none fits); ${RungSizing.SkipIfUnaffordable} skips the trade and ends the day, so a whole-contract trade whose one contract does not fit the room is skipped too`,
        options: Object.values(RungSizing),
        type: 'enum',
    },
} satisfies ArgsDef;

export const tradingArguments = {
    ...commonSimArguments,
    ...purchaseArguments,
    ...evalPolicyArguments,
    'early-withdrawal': {
        default: false,
        description:
            'Take the one-time early withdrawal on plans that offer it (MFF Pro): once, after the payout day gate and before the buffer clears, withdraw up to 60% of the profit (at least $1,000) while the other 40% stays. Modeled as the first payout, so the MLL moves to start + $100 and locks, which leaves a thin cushion. Off by default; plans without the rule ignore it',
        type: 'boolean',
    },
    'funded-days': {
        default: String(TRADING_DAYS_PER_YEAR),
        description: 'Funded-phase horizon in trading days',
        type: 'string',
    },
    'funded-reset': {
        default: false,
        description: fundedResetFlagDescription(
            ALL_FIRMS.flatMap((firm) => firm.plans),
        ),
        type: 'boolean',
    },
    'funded-risk': {
        description:
            'Flat risk per trade in the funded phase (default: mirrors --risk)',
        type: 'string',
    },
    'funded-rr': {
        description:
            'Reward to risk ratio in the funded phase (default: mirrors --rr)',
        type: 'string',
    },
    'funded-tpd': {
        description:
            'Trades per day in the funded phase (default: mirrors --tpd)',
        type: 'string',
    },
    ...idleDayProbabilityArgument,
    ladder: {
        description:
            'Eval risk ladder, comma separated (e.g. 400,600,800,200). Omit for flat risk.',
        type: 'string',
    },
    'max-attempts': {
        default: '1',
        description: 'Evaluation attempts per trial',
        type: 'string',
    },
    'max-lifetime-payouts': {
        description:
            "Override the plan's lifetime payout cap for this run -- a number, or 'unlimited'/'none' to remove it entirely (also neutralizes an unflagged payout-ladder exhaustion, a second, independent cap some plans carry alongside maxLifetimePayouts). Omit to use the plan's own real cap.",
        type: 'string',
    },
    ...rebuyLagDaysArgument,
    'retain-cushion': {
        default: '0',
        description:
            "Minimum cushion to leave in the account on payout. Floored at the plan's own retained-cushion floor (plan.defaultRetainedCushion(), usually its full funded-drawdown amount, but overridden per plan, for example $0 on TopStep and $2,000 on FTMO): no real trader drains cushion to the edge on every withdrawal, so a lower value, including the default, is clamped up to that floor; pass a higher value to model even more conservative withdrawal behavior",
        type: 'string',
    },
    risk: {
        default: '250',
        description: 'Flat risk per trade in account currency',
        type: 'string',
    },
} satisfies ArgsDef;

export const liveTransferHazardArgument = {
    'live-transfer-hazard': {
        description:
            'Probability [0,1] per paid payout that the firm sends the account live, which ends its simulated payouts (your assumption, not a firm rule; empty means unpriced, as before). Where the plan has a modeled live plan and --stop-points is set, the account continues through it; otherwise its remaining value is counted as $0. One extra draw per paid payout from a separate seeded stream, so the trade draws are unchanged; copy-traded accounts share one draw per group',
        type: 'string',
    },
} satisfies ArgsDef;

export const includeCallUpArgument = {
    'include-callup': {
        default: false,
        description:
            'Also rank plans the firm will not sell you today: call-up-only (e.g. TopStep Pro Account, LucidMaxx) or no longer sold (e.g. FundedNext FNL:003)',
        type: 'boolean',
    },
} satisfies ArgsDef;

export const bankrollArguments = {
    bankroll: {
        description:
            'Bankroll in account currency. Prints attempts affordable and P(batch net < 0) over that many attempts (also enables the P(no payout) row); omit to skip these lines',
        type: 'string',
    },
    'loss-threshold': {
        description:
            'Loss-probability threshold (0, 0.5] for the minimum-budget line; absent means not set',
        type: 'string',
    },
} satisfies ArgsDef;

export const compoundStartArgument = {
    'compound-start': {
        description:
            'Starting bankroll in account currency for the edge plausibility note: shows what it would become at full Kelly over a month of trades (information, not sizing); omit to skip',
        type: 'string',
    },
} satisfies ArgsDef;

export const objectiveArgument = {
    objective: {
        description:
            'Ranking objective: monthly (default, expected monthly net), cycle (expected cash per eval-to-funded cycle) or ruin-first (ranks which plan to buy only, never eval rungs or funded risk)',
        options: Object.values(ObjectiveFlag),
        type: 'enum',
    },
} satisfies ArgsDef;

export const screenTimeArguments = {
    'accounts-per-session': {
        description:
            'Accounts traded in one session, used with --hours-per-day for $/screen hour; a copy group counts as one account',
        type: 'string',
    },
    'hours-per-day': {
        description:
            'Hours of screen time per trading day, used with --accounts-per-session for $/screen hour',
        type: 'string',
    },
} satisfies ArgsDef;

export function edgePlausibilityNote(
    inputs: EdgeInputs,
    thresholds: PlausibilityThresholds = DEFAULT_RULEBOOK.plausibility,
): null | string {
    return edgePlausibilityNoteText(inputs, thresholds);
}

export function liveTransferRunLines(
    hazard: number | undefined,
    out: Pick<
        SimOutputs,
        'liveTransferContinuation' | 'liveTransferProbability'
    >,
    notes: readonly string[],
): readonly string[] {
    if (hazard === undefined || hazard <= 0) return [];
    return liveTransferDisclosureLines({
        continuation: out.liveTransferContinuation,
        hazard,
        notes,
        sentLiveShare: out.liveTransferProbability,
    });
}

export function liveTransferSweepLines(
    hazard: number | undefined,
    continuation: LiveTransferContinuationKind,
    notes: readonly string[],
): readonly string[] {
    if (hazard === undefined || hazard <= 0) return [];
    return liveTransferDisclosureLines({
        continuation,
        hazard,
        notes,
        sentLiveShare: null,
    });
}

export function objectiveHeadingLine(objective: SizingObjective): string {
    return `objective: ${SIZING_OBJECTIVE_LABEL[objective]}. ${sizingObjectiveText(objective)}`;
}

export function printEdgePlausibilityNotes(
    notes: readonly (null | string)[],
): void {
    for (const note of notes) {
        if (note !== null) ui.warn(note);
    }
}

export function readAccountsPerSession(raw: string | undefined): null | number {
    return raw === undefined || raw === ''
        ? null
        : parseFlag(
              numericFlagSchema.pipe(bankrollAccountsPerSessionSchema),
              raw,
              'accounts-per-session',
              'a whole number from 1 to 200',
          );
}

export function readBankroll(raw: string | undefined): Dollars | null {
    return raw === undefined || raw === ''
        ? null
        : dollars(
              parseFlag(
                  bankrollDollarSchema,
                  raw,
                  'bankroll',
                  'a dollar amount > 0',
              ),
          );
}

export function readBankrollInputs(
    arguments_: BankrollArguments,
): BankrollInputs {
    return {
        bankroll: readBankroll(arguments_.bankroll),
        lossThreshold: readLossThreshold(arguments_['loss-threshold']),
    };
}

export function readCompoundStart(raw: string | undefined): number | undefined {
    return raw === undefined || raw === ''
        ? undefined
        : parseFlag(
              bankrollDollarSchema,
              raw,
              'compound-start',
              'a dollar amount > 0',
          );
}

export function readEdgeModelSpec(
    arguments_: EdgeModelArguments,
    inputs: EdgeInputs,
): EdgeModelSpec {
    const kind = z.enum(EdgeModelKind).parse(arguments_['edge-model']);
    switch (kind) {
        case EdgeModelKind.Drift: {
            const anchorRr = arguments_['edge-anchor-rr'];
            return {
                anchorRrRatio:
                    anchorRr === undefined
                        ? inputs.rrRatio
                        : readPositiveNumber(anchorRr, 'edge-anchor-rr'),
                anchorWinrate: inputs.winrate,
                kind: EdgeModelKind.Drift,
            };
        }
        case EdgeModelKind.Fixed: {
            return { kind: EdgeModelKind.Fixed, winrate: inputs.winrate };
        }
    }
}

export function readHoursPerDay(raw: string | undefined): null | number {
    return raw === undefined || raw === ''
        ? null
        : parseFlag(
              numericFlagSchema.pipe(bankrollSessionHoursPerDaySchema),
              raw,
              'hours-per-day',
              'a number of hours above 0 and at most 16',
          );
}

export function readLiveTransferHazard(
    raw: string | undefined,
): Fraction0to1 | undefined {
    return raw === undefined || raw === ''
        ? undefined
        : readFraction(raw, 'live-transfer-hazard');
}

export function readLossThreshold(
    raw: string | undefined,
): Fraction0to1 | null {
    return raw === undefined || raw === ''
        ? null
        : fraction(
              parseFlag(
                  numericFlagSchema.pipe(bankrollLossRiskThresholdSchema),
                  raw,
                  'loss-threshold',
                  'a fraction above 0 and at most 0.5',
              ),
          );
}

export function readObjective(
    arguments_: ObjectiveArguments,
    surface: RankingSurface,
): SizingObjective {
    const flag = arguments_.objective;
    if (flag === undefined) return SizingObjective.MonthlyNet;
    const parsed = z.enum(ObjectiveFlag).safeParse(flag);
    if (!parsed.success) {
        throw new TypeError(
            `Invalid --objective "${flag}": expected ${Object.values(ObjectiveFlag).join(', ')}`,
        );
    }
    switch (parsed.data) {
        case ObjectiveFlag.CycleCash: {
            return SizingObjective.CycleCash;
        }
        case ObjectiveFlag.MonthlyNet: {
            return SizingObjective.MonthlyNet;
        }
        case ObjectiveFlag.RuinFirst: {
            const applicability = objectiveApplicability(
                SizingObjective.RuinFirst,
                surface,
            );
            if (
                applicability.verdict ===
                ObjectiveApplicabilityVerdict.NotApplicable
            ) {
                throw new ObjectiveNotApplicable(
                    RUIN_FIRST_NOT_APPLICABLE_MESSAGE,
                );
            }
            if (readBankroll(arguments_.bankroll) === null) {
                throw new RuinFirstNeedsBankroll(
                    '--objective ruin-first ranks by P(batch net < 0) at your bankroll, so it needs --bankroll',
                );
            }
            return SizingObjective.RuinFirst;
        }
    }
}

export function readScreenTime(
    arguments_: ScreenTimeArguments,
): null | ScreenTime {
    const sessionHoursPerDay = readHoursPerDay(arguments_['hours-per-day']);
    const accountsPerSession = readAccountsPerSession(
        arguments_['accounts-per-session'],
    );
    if (sessionHoursPerDay === null && accountsPerSession === null) {
        return null;
    }
    if (sessionHoursPerDay === null || accountsPerSession === null) {
        throw new TypeError(
            '--hours-per-day and --accounts-per-session go together: pass both or neither',
        );
    }
    return { accountsPerSession, sessionHoursPerDay };
}

export function tradingEdgeNotes(inputs: TradingEdgeNoteInputs): string[] {
    const notes: string[] = [];
    const { compoundStartDollars } = inputs;
    const evalNote = edgePlausibilityNote({
        compoundStartDollars,
        rrRatio: inputs.rrRatio,
        tradesPerDay: inputs.tradesPerDay,
        winrate: inputs.winrate,
    });
    if (evalNote !== null) notes.push(evalNote);
    if (
        inputs.fundedRrRatio !== undefined &&
        inputs.fundedRrRatio !== inputs.rrRatio
    ) {
        const fundedNote = edgePlausibilityNote({
            compoundStartDollars,
            rrRatio: inputs.fundedRrRatio,
            tradesPerDay: inputs.fundedTradesPerDay ?? inputs.tradesPerDay,
            winrate: inputs.winrate,
        });
        if (fundedNote !== null) notes.push(fundedNote);
    }
    return notes;
}

export const planArguments = {
    firm: {
        description: `Firm: ${Object.values(FirmId).join(', ')}`,
        options: Object.values(FirmId),
        type: 'enum',
    },
    variant: {
        description: 'Plan variant within the firm (see: cli prop plans)',
        type: 'string',
    },
} satisfies ArgsDef;

export function formatCurrencyWithSe(value: number, se: null | number): string {
    return se === null
        ? formatCurrency(value)
        : `${formatCurrency(value)} (SE ${formatCurrency(se)})`;
}

export function formatDaysToPass(
    out: Pick<SimOutputs, 'evalPassProbability'>,
    days: number,
    fractionDigits: number,
): string {
    return hasEvalPass(out) ? days.toFixed(fractionDigits) : NOT_APPLICABLE;
}

export function formatNumberWithSe(
    value: number,
    se: null | number,
    digits = 2,
): string {
    return se === null
        ? value.toFixed(digits)
        : `${value.toFixed(digits)} (SE ${se.toFixed(digits)})`;
}

export function formatPercentWithSe(value: number, se: null | number): string {
    return se === null
        ? formatPercent(value)
        : `${formatPercent(value)} (SE ${formatPercent(se)})`;
}

export function fundedResetFlagDescription(plans: readonly Plan[]): string {
    const offers = plans.flatMap((plan) =>
        plan.fundedReset === null
            ? []
            : [
                  `--firm ${plan.id.firm} --variant ${planVariant(plan)} at ${formatCurrency(plan.accountSize)} (${describeFundedResetTerms(plan.fundedReset)})`,
              ],
    );
    return `Buy the funded reset on plans that offer it: ${offers.join('; ')}. ${FUNDED_RESET_MECHANICS} Off by default; plans without it ignore it`;
}

export function hasEvalPass(
    out: Pick<SimOutputs, 'evalPassProbability'>,
): boolean {
    return out.evalPassProbability > 0;
}

export function placedCapNote(
    plan: Plan | undefined,
    isCapped: boolean,
): string {
    if (plan === undefined) return ', before any contract limit';
    return isCapped ? `, capped at ${FUNDED_START_TIER_CONTRACT_LIMIT}` : '';
}

export function placedFundedRiskNote(
    inputs: TradingInputs,
    plan: Plan | undefined,
): string {
    const placed = placedFundedRisk(inputs, plan);
    if (placed === null) return '';
    const { instrument, stopPoints } = placed.positionSizing;
    return ` (placed ${formatWholeCentDollars(placed.risk)}: ${placed.contracts} ${instrument.symbol} at ${stopPoints} pt${placedCapNote(plan, placed.isCapped)})`;
}

export function planVariant(plan: Plan): string {
    return 'variant' in plan.id ? plan.id.variant : '';
}

export function pricedTriggerLines(
    inputs: SimInputs,
    label?: string,
): readonly string[] {
    const assumption = pricedCumulativeTriggerAssumptionOf(inputs);
    if (assumption === undefined) return [];
    const text = assumptionText(assumption);
    return [label === undefined ? `  ${text}` : `  ${label}: ${text}`];
}

export function readFraction(raw: unknown, name: string): Fraction0to1 {
    return parseFlag(
        numericFlagSchema.pipe(fractionSchema),
        raw,
        name,
        'a fraction in [0, 1] (e.g. 0.4 for 40%)',
    );
}

export function readInstrument(symbol: InstrumentSymbol): InstrumentSpec {
    return INSTRUMENTS[symbol];
}

export function readInteger(raw: unknown, name: string): number {
    return parseFlag(
        numericFlagSchema.pipe(z.number().int()),
        raw,
        name,
        'a whole number',
    );
}

export function readNonNegativeInteger(raw: unknown, name: string): number {
    return parseFlag(
        numericFlagSchema.pipe(z.number().int().nonnegative()),
        raw,
        name,
        'a whole number >= 0',
    );
}

export function readNonNegativeNumber(raw: unknown, name: string): number {
    return parseFlag(
        numericFlagSchema.pipe(z.number().nonnegative()),
        raw,
        name,
        'a number >= 0',
    );
}

export function readNumberList<T>(
    raw: string,
    name: string,
    itemSchema: z.ZodType<T, number>,
    expectation: string,
): T[] {
    const entrySchema = z
        .string()
        .trim()
        .min(1)
        .pipe(z.coerce.number())
        .pipe(itemSchema);
    return raw.split(',').map((part, index) => {
        const parsed = entrySchema.safeParse(part);
        if (!parsed.success) {
            const problem =
                part.trim() === '' ? 'is empty' : `must be ${expectation}`;
            throw new TypeError(
                `Invalid --${name} "${raw}": entry ${index + 1} ${problem}`,
            );
        }
        return parsed.data;
    });
}

export function readPercent(raw: unknown, name: string): Percent0to100 {
    return parseFlag(
        numericFlagSchema.pipe(percentSchema),
        raw,
        name,
        'a percent in [0, 100]',
    );
}

export function readPercentAsFraction(
    raw: unknown,
    name: string,
): Fraction0to1 {
    return fraction(readPercent(raw, name) / 100);
}

export function readPositiveInteger(raw: unknown, name: string): number {
    return parseFlag(
        numericFlagSchema.pipe(z.number().int().positive()),
        raw,
        name,
        'a whole number >= 1',
    );
}

export function readPositiveNumber(raw: unknown, name: string): number {
    return parseFlag(
        numericFlagSchema.pipe(z.number().positive()),
        raw,
        name,
        'a number > 0',
    );
}

export function readRebuyLagDays(raw: unknown): number {
    return readNonNegativeNumber(raw, 'rebuy-lag-days');
}

export function unrestatedLines(
    lines: readonly string[],
    stated: readonly string[],
): readonly string[] {
    return lines.filter((line) => stated.every((text) => !text.includes(line)));
}

export const MAX_PATH_GRANULARITY = MAX_INTRADAY_PATH_STEPS_PER_R;

const numericFlagSchema = z.union([
    z.number(),
    z.string().trim().min(1).pipe(z.coerce.number()),
]);

const bankrollDollarSchema = numericFlagSchema.pipe(z.number().positive());

const bankrollAccountsPerSessionSchema =
    rulebookSchema.shape.bankroll.shape.accountsPerSession.unwrap();
const bankrollLossRiskThresholdSchema =
    rulebookSchema.shape.bankroll.shape.lossRiskThreshold.unwrap();
const bankrollSessionHoursPerDaySchema =
    rulebookSchema.shape.bankroll.shape.sessionHoursPerDay.unwrap();

const stopLossCountFlagSchema = z
    .string()
    .trim()
    .min(1)
    .pipe(z.coerce.number())
    .pipe(stopLossCountSchema);

const stopTargetFlagSchema = z
    .string()
    .trim()
    .transform((text) => (text.startsWith('$') ? text.slice(1) : text))
    .pipe(z.string().min(1))
    .pipe(z.coerce.number())
    .pipe(stopTargetDollarsSchema);

const DEFAULT_STOP_LOSS_COUNT = 2;
const DEFAULT_STOP_TARGET_DOLLARS = 500;

export function describeStopRule(rule: DayStopRule): string {
    switch (rule.kind) {
        case DayStopRuleKind.AfterKLosses: {
            return `${rule.kind}:${rule.k}`;
        }
        case DayStopRuleKind.AfterTarget: {
            return `${rule.kind}:$${rule.dollars}`;
        }
        case DayStopRuleKind.DayGreen:
        case DayStopRuleKind.FirstWin:
        case DayStopRuleKind.None: {
            return rule.kind;
        }
    }
}

export function readGranularityList(
    raw: string | undefined,
): number[] | undefined {
    return raw === undefined || raw === ''
        ? undefined
        : readNumberList(
              raw,
              'path-granularity',
              z.number().int().positive().max(MAX_PATH_GRANULARITY),
              `a whole number from 1 to ${MAX_PATH_GRANULARITY} (finer granularity makes path resolution time grow quadratically)`,
          );
}

export function readLadder(
    raw: string | undefined,
    name = 'ladder',
): null | number[] {
    if (raw === undefined || raw === '') return null;
    const rungs = readNumberList(
        raw,
        name,
        ladderRungSchema,
        'a dollar amount >= 0',
    );
    const checked = ladderRungsSchema.safeParse(rungs);
    if (!checked.success) {
        throw new Error(
            `Invalid --${name} "${raw}": ${checked.error.issues.map((issue) => issue.message).join('; ')}`,
        );
    }
    return checked.data;
}

export function readMaxLifetimePayouts(
    raw: string | undefined,
): null | number | undefined {
    if (raw === undefined || raw === '') return undefined;
    const sentinel = raw.trim().toLowerCase();
    return sentinel === 'unlimited' || sentinel === 'none'
        ? null
        : readPositiveInteger(raw, 'max-lifetime-payouts');
}

export function readStopRule(raw: string): DayStopRule {
    const separator = raw.indexOf(':');
    const kindText = separator === -1 ? raw : raw.slice(0, separator);
    const argument = separator === -1 ? undefined : raw.slice(separator + 1);
    const kind = z.enum(DayStopRuleKind).safeParse(kindText);
    if (!kind.success) {
        throw new Error(
            `Unknown --stop rule "${raw}". Use one of: none, day-green, first-win, after-target:<dollars>, after-k-losses:<k>`,
        );
    }
    switch (kind.data) {
        case DayStopRuleKind.AfterKLosses: {
            if (argument === undefined) {
                return { k: DEFAULT_STOP_LOSS_COUNT, kind: kind.data };
            }
            const k = stopLossCountFlagSchema.safeParse(argument);
            if (!k.success) {
                throw new Error(
                    `Invalid --stop "${raw}": k must be a whole number of losses >= 1, e.g. after-k-losses:2`,
                );
            }
            return { k: k.data, kind: kind.data };
        }
        case DayStopRuleKind.AfterTarget: {
            if (argument === undefined) {
                return {
                    dollars: DEFAULT_STOP_TARGET_DOLLARS,
                    kind: kind.data,
                };
            }
            const dollars = stopTargetFlagSchema.safeParse(argument);
            if (!dollars.success) {
                throw new Error(
                    `Invalid --stop "${raw}": the target must be a dollar amount > 0, e.g. after-target:500 or 'after-target:$500' (single-quote a $: inside double quotes the shell expands $5, which turns "after-target:$500" into after-target:00)`,
                );
            }
            return { dollars: dollars.data, kind: kind.data };
        }
        case DayStopRuleKind.DayGreen:
        case DayStopRuleKind.FirstWin:
        case DayStopRuleKind.None: {
            if (argument !== undefined) {
                throw new Error(
                    `--stop ${kind.data} takes no argument, got "${raw}"`,
                );
            }
            return { kind: kind.data };
        }
    }
}

function parseFlag<T>(
    schema: z.ZodType<T>,
    raw: unknown,
    name: string,
    expectation: string,
): T {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
        throw new TypeError(
            `--${name} must be ${expectation}, got "${String(raw)}"`,
        );
    }
    return parsed.data;
}

function verifiedPayoutTriggerOf(plan: Plan): number | undefined {
    return (
        verifiedCumulativeTriggerOf(findFirm(plan.id.firm)?.accountPolicy, plan)
            ?.amount ?? undefined
    );
}
