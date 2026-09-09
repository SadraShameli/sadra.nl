import type { ArgsDef } from 'citty';

import { z } from 'zod';

import { ui } from '~/cli/ui';
import {
    ALL_FIRMS,
    type DailyLossLimitConfig,
    DailyLossLimitKind,
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    findFirm,
    FirmId,
    INSTRUMENTS,
    type InstrumentSpec,
    InstrumentSymbol,
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
    'eval-days': string;
    'funded-days': string;
    instrument: InstrumentSymbol;
    ladder?: string;
    'max-attempts': string;
    'request-size'?: string;
    'retain-cushion': string;
    risk: string;
    rr: string;
    seed: string;
    stop: string;
    tpd: string;
    trials: string;
    unaffordable: RungSizing;
    winrate: string;
}

export interface TradingInputsInit {
    dayStop: DayStopRule;
    fundedHorizonDays: number;
    ladder: null | number[];
    maxAttempts: number;
    maxEvalDays: number;
    minRetainedCushion: number;
    payoutRequestSize: number | undefined;
    riskPerTrade: number;
    rrRatio: number;
    rungSizing: RungSizing;
    seed: number;
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
        return new TradingInputs({
            dayStop: readStopRule(arguments_.stop),
            fundedHorizonDays: readNumber(
                arguments_['funded-days'],
                'funded-days',
            ),
            ladder: readLadder(arguments_.ladder),
            maxAttempts: readNumber(arguments_['max-attempts'], 'max-attempts'),
            maxEvalDays: readNumber(arguments_['eval-days'], 'eval-days'),
            minRetainedCushion: readNumber(
                arguments_['retain-cushion'],
                'retain-cushion',
            ),
            payoutRequestSize:
                requestSize === undefined
                    ? undefined
                    : readNumber(requestSize, 'request-size'),
            riskPerTrade: readNumber(arguments_.risk, 'risk'),
            rrRatio: readNumber(arguments_.rr, 'rr'),
            rungSizing: arguments_.unaffordable,
            seed: readNumber(arguments_.seed, 'seed'),
            tradesPerDay: readNumber(arguments_.tpd, 'tpd'),
            trials: readNumber(arguments_.trials, 'trials'),
            winrate: readNumber(arguments_.winrate, 'winrate'),
        });
    }

    readonly dayStop: DayStopRule;
    readonly fundedHorizonDays: number;
    readonly ladder: null | number[];
    readonly maxAttempts: number;
    readonly maxEvalDays: number;
    readonly minRetainedCushion: number;
    readonly payoutRequestSize: number | undefined;
    readonly riskPerTrade: number;
    readonly rrRatio: number;
    readonly rungSizing: RungSizing;
    readonly seed: number;
    readonly tradesPerDay: number;
    readonly trials: number;
    readonly winrate: number;

    constructor(init: TradingInputsInit) {
        this.dayStop = init.dayStop;
        this.fundedHorizonDays = init.fundedHorizonDays;
        this.ladder = init.ladder;
        this.maxAttempts = init.maxAttempts;
        this.maxEvalDays = init.maxEvalDays;
        this.minRetainedCushion = init.minRetainedCushion;
        this.payoutRequestSize = init.payoutRequestSize;
        this.riskPerTrade = init.riskPerTrade;
        this.rrRatio = init.rrRatio;
        this.rungSizing = init.rungSizing;
        this.seed = init.seed;
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
            evalDayPolicy: this.toDayPolicy(),
            fundedHorizonDays: this.fundedHorizonDays,
            maxAttempts: this.maxAttempts,
            maxEvalDays: this.maxEvalDays,
            minRetainedCushion: this.minRetainedCushion,
            payoutRequestSize: this.payoutRequestSize,
            plan,
            riskPerTrade: this.riskPerTrade,
            rrRatio: this.rrRatio,
            rungSizing: this.rungSizing,
            seed: this.seed,
            tradesPerDay: this.tradesPerDay,
            trials: this.trials,
            winrate: this.winrate,
        };
    }
}

export const planResolver = new PlanResolver();

export const tradingArguments = {
    'eval-days': {
        default: '150',
        description: 'Maximum evaluation days before timeout',
        type: 'string',
    },
    'funded-days': {
        default: '252',
        description: 'Funded-phase horizon in trading days',
        type: 'string',
    },
    instrument: {
        default: InstrumentSymbol.NQ,
        description: `Instrument for stop-distance maths (${Object.keys(INSTRUMENTS).join(', ')})`,
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
    'request-size': {
        description: 'Withdraw this much per payout request (default: all)',
        type: 'string',
    },
    'retain-cushion': {
        default: '0',
        description: 'Minimum cushion to leave in the account on payout',
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

export function describeDll(kind: DailyLossLimitConfig['kind']): string {
    return kind === DailyLossLimitKind.None ? 'none' : kind;
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
