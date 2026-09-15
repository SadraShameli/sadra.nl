import type { ArgsDef } from 'citty';

import { z } from 'zod';

import { ui } from '~/cli/ui';
import {
    ALL_FIRMS,
    type ContractLimitConfig,
    ContractLimitKind,
    type DailyLossLimitConfig,
    type DailyLossLimitDescriptor,
    DailyLossLimitShape,
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    describeDailyLossLimit,
    findFirm,
    FirmId,
    INSTRUMENTS,
    type InstrumentSpec,
    InstrumentSymbol,
    percent,
    type Plan,
    RungSizing,
    type SimInputs,
    type TradingFirm,
} from '~/lib/prop-calculator';

export interface TableColumn {
    align?: 'left' | 'right';
    label: string;
    width: number;
}

export interface TradingArguments extends PlanSelectorArguments {
    'activation-discount': string;
    'eval-days': string;
    'eval-discount': string;
    'funded-days': string;
    'funded-risk'?: string;
    'funded-rr'?: string;
    'funded-tpd'?: string;
    'idle-day-probability': string;
    instrument: InstrumentSymbol;
    ladder?: string;
    'max-attempts': string;
    'monthly-discount': string;
    'path-granularity'?: string;
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
    activationDiscountPercent: number;
    dayStop: DayStopRule;
    evalDiscountPercent: number;
    fundedHorizonDays: number;
    fundedRiskPerTrade: number | undefined;
    fundedRrRatio: number | undefined;
    fundedTradesPerDay: number | undefined;
    idleDayProbability: number;
    instrument: InstrumentSymbol | undefined;
    intradayPathStepsPerR: number[] | undefined;
    ladder: null | number[];
    maxAttempts: number;
    maxEvalDays: number;
    minRetainedCushion: number;
    monthlySubscriptionDiscountPercent: number;
    payoutRequestSize: number | undefined;
    riskPerTrade: number;
    rrRatio: number;
    rungSizing: RungSizing;
    seed: number;
    stopPoints: number | undefined;
    tradesPerDay: number;
    trials: number;
    winrate: number;
}

interface PlanSelectorArguments {
    firm?: FirmId;
    variant?: string;
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
            activationDiscountPercent: readNumber(
                arguments_['activation-discount'],
                'activation-discount',
            ),
            dayStop: readStopRule(arguments_.stop),
            evalDiscountPercent: readNumber(
                arguments_['eval-discount'],
                'eval-discount',
            ),
            fundedHorizonDays: readNumber(
                arguments_['funded-days'],
                'funded-days',
            ),
            fundedRiskPerTrade:
                fundedRisk === undefined
                    ? undefined
                    : readNumber(fundedRisk, 'funded-risk'),
            fundedRrRatio:
                fundedRr === undefined
                    ? undefined
                    : readNumber(fundedRr, 'funded-rr'),
            fundedTradesPerDay:
                fundedTpd === undefined
                    ? undefined
                    : readNumber(fundedTpd, 'funded-tpd'),
            idleDayProbability: readNumber(
                arguments_['idle-day-probability'],
                'idle-day-probability',
            ),
            instrument: arguments_.instrument,
            intradayPathStepsPerR: readGranularityList(
                arguments_['path-granularity'],
            ),
            ladder: readLadder(arguments_.ladder),
            maxAttempts: readNumber(arguments_['max-attempts'], 'max-attempts'),
            maxEvalDays: readNumber(arguments_['eval-days'], 'eval-days'),
            minRetainedCushion: readNumber(
                arguments_['retain-cushion'],
                'retain-cushion',
            ),
            monthlySubscriptionDiscountPercent: readNumber(
                arguments_['monthly-discount'],
                'monthly-discount',
            ),
            payoutRequestSize:
                requestSize === undefined
                    ? undefined
                    : readNumber(requestSize, 'request-size'),
            riskPerTrade: readNumber(arguments_.risk, 'risk'),
            rrRatio: readNumber(arguments_.rr, 'rr'),
            rungSizing: arguments_.unaffordable,
            seed: readNumber(arguments_.seed, 'seed'),
            stopPoints:
                stopPoints === undefined
                    ? undefined
                    : readNumber(stopPoints, 'stop-points'),
            tradesPerDay: readNumber(arguments_.tpd, 'tpd'),
            trials: readNumber(arguments_.trials, 'trials'),
            winrate: readNumber(arguments_.winrate, 'winrate'),
        });
    }

    readonly activationDiscountPercent: number;
    readonly dayStop: DayStopRule;
    readonly evalDiscountPercent: number;
    readonly fundedHorizonDays: number;
    readonly fundedRiskPerTrade: number | undefined;
    readonly fundedRrRatio: number | undefined;
    readonly fundedTradesPerDay: number | undefined;
    readonly idleDayProbability: number;
    readonly instrument: InstrumentSymbol | undefined;
    readonly intradayPathStepsPerR: number[] | undefined;
    readonly ladder: null | number[];
    readonly maxAttempts: number;
    readonly maxEvalDays: number;
    readonly minRetainedCushion: number;
    readonly monthlySubscriptionDiscountPercent: number;
    readonly payoutRequestSize: number | undefined;
    readonly riskPerTrade: number;
    readonly rrRatio: number;
    readonly rungSizing: RungSizing;
    readonly seed: number;
    readonly stopPoints: number | undefined;
    readonly tradesPerDay: number;
    readonly trials: number;
    readonly winrate: number;

    constructor(init: TradingInputsInit) {
        this.activationDiscountPercent = init.activationDiscountPercent;
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
        this.minRetainedCushion = init.minRetainedCushion;
        this.monthlySubscriptionDiscountPercent =
            init.monthlySubscriptionDiscountPercent;
        this.payoutRequestSize = init.payoutRequestSize;
        this.riskPerTrade = init.riskPerTrade;
        this.rrRatio = init.rrRatio;
        this.rungSizing = init.rungSizing;
        this.seed = init.seed;
        this.stopPoints = init.stopPoints;
        this.tradesPerDay = init.tradesPerDay;
        this.trials = init.trials;
        this.winrate = init.winrate;
    }

    toDayPolicy(): DayPolicy | undefined {
        if (!this.ladder) return undefined;
        return {
            ladder: this.ladder,
            maxLossesPerDay: null,
            stopRule: this.dayStop,
        };
    }

    toSimInputs(plan: Plan): SimInputs {
        return {
            dayStop: this.dayStop,
            discounts:
                this.activationDiscountPercent > 0 ||
                this.evalDiscountPercent > 0 ||
                this.monthlySubscriptionDiscountPercent > 0
                    ? {
                          activationPercent: percent(
                              this.activationDiscountPercent,
                          ),
                          evalPercent: percent(this.evalDiscountPercent),
                          monthlySubscriptionPercent: percent(
                              this.monthlySubscriptionDiscountPercent,
                          ),
                      }
                    : undefined,
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
            plan,
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

export const tradingArguments = {
    'activation-discount': {
        default: '0',
        description:
            'Coupon discount percent [0,100] off the one-time activation fee',
        type: 'string',
    },
    'eval-days': {
        default: '150',
        description: 'Maximum evaluation days before timeout',
        type: 'string',
    },
    'eval-discount': {
        default: '0',
        description:
            'Coupon discount percent [0,100] off the one-time evaluation fee',
        type: 'string',
    },
    'funded-days': {
        default: '252',
        description: 'Funded-phase horizon in trading days',
        type: 'string',
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
    'idle-day-probability': {
        default: '0',
        description:
            "Probability [0,1] a day has zero trades (models e.g. MFFU Rapid EOD's 7-consecutive-idle-day account closure)",
        type: 'string',
    },
    instrument: {
        default: InstrumentSymbol.NQ,
        description: `Instrument for contract-limit sizing, used with --stop-points (${Object.keys(INSTRUMENTS).join(', ')})`,
        options: Object.values(InstrumentSymbol),
        type: 'enum',
    },
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
    'monthly-discount': {
        default: '0',
        description:
            'Coupon discount percent [0,100] off the monthly subscription fee (e.g. a recurring firm promo)',
        type: 'string',
    },
    'path-granularity': {
        description:
            'Intraday path-walk resolution in steps per R for funded IntradayTrailingDrawdown trades, comma separated for a side-by-side comparison (e.g. 4,10,25); omit to resolve each trade with a single win/loss draw',
        type: 'string',
    },
    'request-size': {
        description: 'Withdraw this much per payout request (default: all)',
        type: 'string',
    },
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
    rr: { default: '2', description: 'Reward to risk ratio', type: 'string' },
    seed: { default: '42', description: 'RNG seed', type: 'string' },
    stop: {
        default: 'day-green',
        description:
            'Day stop rule: none, day-green, first-win, after-target:<$>, after-k-losses:<k>',
        type: 'string',
    },
    'stop-points': {
        description:
            'Stop distance in points - enables contract-limit enforcement (caps risk to what --instrument allows), omit to leave risk uncapped',
        type: 'string',
    },
    tpd: {
        default: '4',
        description: 'Trades per day when using flat risk',
        type: 'string',
    },
    trials: {
        default: '4000',
        description: 'Monte Carlo trials',
        type: 'string',
    },
    unaffordable: {
        default: RungSizing.CapToCushion,
        description: 'Unaffordable rung: capToCushion or skipIfUnaffordable',
        options: Object.values(RungSizing),
        type: 'enum',
    },
    winrate: { default: '0.4', description: 'Win rate (0-1)', type: 'string' },
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

export function describeDll(config: DailyLossLimitConfig): string {
    return describeDllShape(describeDailyLossLimit(config));
}

export function describeFundedMinis(
    config: ContractLimitConfig | null,
): string {
    if (config === null) return 'unpublished';
    if (config.kind === ContractLimitKind.Flat) {
        return `${config.maxContracts} mini`;
    }
    const topTier = config.tiers.at(-1);
    return `up to ${topTier?.maxContracts ?? '?'} mini (tiered)`;
}

export function describeShare(maxBestDayShare: number | undefined): string {
    return maxBestDayShare === undefined ? 'none' : `${maxBestDayShare * 100}%`;
}

export function planVariant(plan: Plan): string {
    return 'variant' in plan.id ? plan.id.variant : '';
}

export function readInstrument(symbol: InstrumentSymbol): InstrumentSpec {
    return INSTRUMENTS[symbol];
}

export function readNumber(raw: unknown, name: string): number {
    const parsed = z.coerce.number().safeParse(raw);
    if (!parsed.success) {
        throw new TypeError(`--${name} must be a number, got "${String(raw)}"`);
    }
    return parsed.data;
}

function describeDllShape(descriptor: DailyLossLimitDescriptor): string {
    switch (descriptor.kind) {
        case DailyLossLimitShape.Fixed: {
            return `$${descriptor.amount}`;
        }
        case DailyLossLimitShape.None: {
            return 'none';
        }
        case DailyLossLimitShape.Range: {
            return `$${descriptor.min}-$${descriptor.max}`;
        }
        case DailyLossLimitShape.ShareOfPeak: {
            return `${descriptor.share * 100}% peak`;
        }
        case DailyLossLimitShape.Staged: {
            return `${describeDllShape(descriptor.before)} -> ${describeDllShape(descriptor.after)}`;
        }
    }
}

const MAX_PATH_GRANULARITY = 200;

function readGranularityList(raw: string | undefined): number[] | undefined {
    if (raw === undefined || raw === '') return undefined;
    const parts = raw.split(',').map((part) => Number(part.trim()));
    if (
        parts.some(
            (part) =>
                !Number.isSafeInteger(part) ||
                part <= 0 ||
                part > MAX_PATH_GRANULARITY,
        )
    ) {
        throw new Error(
            `Invalid --path-granularity "${raw}": each value must be a positive integer up to ${MAX_PATH_GRANULARITY} (finer granularity makes path resolution time grow quadratically)`,
        );
    }
    return parts;
}

function readLadder(raw: string | undefined): null | number[] {
    if (raw === undefined || raw === '') return null;
    const parts = raw.split(',').map((part) => Number(part.trim()));
    if (parts.some((part) => !Number.isFinite(part) || part < 0)) {
        throw new Error(`Invalid --ladder "${raw}"`);
    }
    return parts;
}

function readStopRule(raw: string): DayStopRule {
    const [kind = 'none', argument] = raw.split(':', 2);
    switch (kind) {
        case 'after-k-losses': {
            return {
                k: Number(argument ?? 2),
                kind: DayStopRuleKind.AfterKLosses,
            };
        }
        case 'after-target': {
            return {
                dollars: Number(argument ?? 500),
                kind: DayStopRuleKind.AfterTarget,
            };
        }
        case 'day-green': {
            return { kind: DayStopRuleKind.DayGreen };
        }
        case 'first-win': {
            return { kind: DayStopRuleKind.FirstWin };
        }
        case 'none': {
            return { kind: DayStopRuleKind.None };
        }
        default: {
            throw new Error(`Unknown --stop rule "${raw}"`);
        }
    }
}
