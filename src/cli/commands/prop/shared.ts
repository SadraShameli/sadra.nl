import type { ArgsDef } from 'citty';

import { z } from 'zod';

import { ui } from '~/cli/ui';
import { formatCurrency, NOT_APPLICABLE } from '~/lib/format';
import {
    ALL_FIRMS,
    type CouponDiscounts,
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    describeFundedResetTerms,
    findFirm,
    FirmId,
    fraction,
    type Fraction0to1,
    fractionSchema,
    FUNDED_RESET_MECHANICS,
    INSTRUMENTS,
    type InstrumentSpec,
    InstrumentSymbol,
    ladderRungSchema,
    ladderRungsSchema,
    type Percent0to100,
    percentSchema,
    type Plan,
    PLAN_AVAILABILITY_LABEL,
    PlanAvailability,
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
            throw new Error(
                `--firm/--variant matched only ${PLAN_AVAILABILITY_LABEL[PlanAvailability.CallUpOnly]} plans (${excluded.map((plan) => plan.label).join(', ')}); pass --include-callup to rank them`,
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
    static parse(arguments_: TradingArguments): TradingInputs {
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
            'Number of identical accounts run together (multiplies per-account fees and P&L)',
        type: 'string',
    },
} satisfies ArgsDef;

export const purchaseArguments = {
    ...couponDiscountArguments,
    ...commissionArgument,
    ...copyAccountsArgument,
} satisfies ArgsDef;

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
            "Minimum cushion to leave in the account on payout. Floored at the plan's own full funded-drawdown amount (no real trader drains cushion to the edge on every withdrawal) -- a lower value, including the default, is clamped up to that floor; pass a higher value to model even more conservative withdrawal behavior",
        type: 'string',
    },
    risk: {
        default: '250',
        description: 'Flat risk per trade in account currency',
        type: 'string',
    },
} satisfies ArgsDef;

export const includeCallUpArgument = {
    'include-callup': {
        default: false,
        description:
            'Also rank call-up-only plans that cannot be purchased (e.g. TopStep Pro Account, LucidMaxx)',
        type: 'boolean',
    },
} satisfies ArgsDef;

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

export function formatDaysToPass(
    out: Pick<SimOutputs, 'evalPassProbability'>,
    days: number,
    fractionDigits: number,
): string {
    return hasEvalPass(out) ? days.toFixed(fractionDigits) : NOT_APPLICABLE;
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

export function planVariant(plan: Plan): string {
    return 'variant' in plan.id ? plan.id.variant : '';
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

export const MAX_PATH_GRANULARITY = 200;

const numericFlagSchema = z.union([
    z.number(),
    z.string().trim().min(1).pipe(z.coerce.number()),
]);

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
