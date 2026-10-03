import { formatCurrency } from '~/lib/format';
import {
    CENTS_PER_DOLLAR,
    contracts,
    contractsAtStop,
    dollars,
    type LadderScore,
    type LadderSearchResult,
    type PositionSizingConfig,
    type SimOutputs,
} from '~/lib/prop-calculator';
import {
    EvalSizingMode,
    type RulebookParameters,
    SIZING_OBJECTIVE_LABEL,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';
import {
    objectiveApplicability,
    RankingSurface,
} from '~/lib/prop-calculator/advisor/actions';
import {
    bankrollAttempts,
    bankrollCohortRisk,
    type BankrollRiskOutputs,
    LOSS_RISK_DRAWS,
} from '~/lib/prop-calculator/economics';

import {
    rulebookOwnerText,
    type RulebookSource,
} from './bankroll/rulebookSource';

export enum BatchLossStatus {
    NoAttempt = 'no-attempt',
    Priced = 'priced',
    Unpriced = 'unpriced',
}

export type BatchLossPricing =
    | { readonly probability: number; readonly status: BatchLossStatus.Priced }
    | {
          readonly status:
              | BatchLossStatus.NoAttempt
              | BatchLossStatus.Unpriced;
      };

export interface ComparisonRankFigures {
    readonly out: Pick<
        SimOutputs,
        'expectedMonthlyNet' | 'expectedNet' | 'expectedNetPerAttempt'
    >;
}

export interface ComparisonRankRequest<Row> {
    readonly bankrollCents: null | number;
    readonly batchLoss: (row: Row, bankrollCents: number) => BatchLossPricing;
    readonly objective: SizingObjective;
}

export interface LadderRungPlacement {
    readonly contracts: number;
    readonly placedRisk: number;
    readonly rung: number;
}

export interface ObjectiveOption {
    readonly label: string;
    readonly objective: SizingObjective;
}

export interface PricedComparisonRow extends ComparisonRankFigures {
    readonly out: BankrollRiskOutputs & ComparisonRankFigures['out'];
}

export interface RankedComparison<Row> {
    readonly effective: SizingObjective;
    readonly label: string;
    readonly note: null | string;
    readonly rows: Row[];
}

export interface RiskRowFigures {
    readonly cycleNet: number;
    readonly monthlyNet: number;
}

export interface RiskTableObjective {
    readonly effective: SizingObjective;
    readonly label: string;
    readonly note: null | string;
    readonly requested: SizingObjective;
}

const MAX_PRICING_SAMPLES = 2_000_000;
const MIN_PRICING_DRAWS = 500;

export const ENGINE_OPTIMUM_NOTE =
    'The starred row is the engine optimum for this sweep, not the documented sizing: it assumes no daily profit cap in the eval and one risk per trade for both the eval and funded phases. Ruin first and cycle cash do not change documented sizing.';

export const RUIN_FIRST_NEEDS_BANKROLL_NOTE =
    'Ruin first needs a known bankroll to price the chance a batch of attempts ends below zero, so this table ranks by monthly net until one is set';

export const RUIN_FIRST_NO_ATTEMPT_NOTE =
    'Your bankroll affords no attempt of any plan in this table, so ruin first fell back to monthly net';

export const RUIN_FIRST_NO_POSITIVE_EV_NOTE =
    'No plan in this table has EV per attempt above zero, so ruin first ranks none and the rows stay on monthly net';

export const RUIN_FIRST_UNPRICED_NOTE =
    'Your bankroll affords more attempts than a batch can be simulated for, so ruin first could not price the chance a batch ends below zero and fell back to monthly net';

export const RUIN_FIRST_RISK_TABLE_NOTE =
    'RuinFirst ranks plans to buy; risk sizing stays on monthly net (Hard Rule 3)';

export const OBJECTIVE_OPTIONS: readonly ObjectiveOption[] = Object.values(
    SizingObjective,
).map((objective) => ({
    label: SIZING_OBJECTIVE_LABEL[objective],
    objective,
}));

export function documentedSizingHeadline(
    rulebook: Pick<RulebookParameters, 'eval' | 'funded'>,
    source: RulebookSource,
): string {
    const owner = rulebookOwnerText(source);
    const funded = `funded risk is a fixed ${formatCurrency(rulebook.funded.riskCents / CENTS_PER_DOLLAR)} per trade`;
    switch (rulebook.eval.mode) {
        case EvalSizingMode.Ladder: {
            return `Documented sizing: eval risk follows ${owner} ladder rungs; ${funded}.`;
        }
        case EvalSizingMode.MaxRisk: {
            return `Documented sizing: eval risk is the maximum the constraints allow in ${owner}, with a daily profit cap of ${rulebook.eval.maxRiskDailyCapMultiple}x that risk; ${funded}.`;
        }
    }
}

export function ladderObjectiveStar(
    result: Pick<LadderSearchResult, 'byCost' | 'bySpeed'>,
    objective: SizingObjective,
): LadderScore | null {
    const effective = riskTableObjective(
        objective,
        RankingSurface.Ladder,
    ).effective;
    switch (effective) {
        case SizingObjective.CycleCash: {
            return result.byCost[0] ?? null;
        }
        case SizingObjective.MonthlyNet:
        case SizingObjective.RuinFirst: {
            return result.bySpeed[0] ?? null;
        }
    }
}

export function ladderRungPlacements(
    ladder: readonly number[],
    positionSizing: null | PositionSizingConfig,
    contractCap: null | number,
): LadderRungPlacement[] | null {
    if (positionSizing === null) return null;
    const cap = contractCap === null ? null : contracts(contractCap);
    return ladder.map((rung) => {
        const placed = contractsAtStop(rung, positionSizing, cap);
        return {
            contracts: placed.contracts,
            placedRisk: placed.placedRisk,
            rung,
        };
    });
}

export function priceBatchLoss(
    out: BankrollRiskOutputs,
    bankrollCents: number,
    seed: number,
): BatchLossPricing {
    const attempts = bankrollAttempts(
        out,
        dollars(bankrollCents / CENTS_PER_DOLLAR),
    );
    if (attempts === null || attempts < 1) {
        return { status: BatchLossStatus.NoAttempt };
    }
    const draws = Math.min(
        LOSS_RISK_DRAWS,
        Math.floor(MAX_PRICING_SAMPLES / attempts),
    );
    if (draws < MIN_PRICING_DRAWS) return { status: BatchLossStatus.Unpriced };
    const probability = bankrollCohortRisk(
        out.netValues,
        attempts,
        draws,
        seed,
    ).value?.lossProbability.value;
    return probability === undefined
        ? { status: BatchLossStatus.Unpriced }
        : { probability, status: BatchLossStatus.Priced };
}

export function rankComparison<Row extends ComparisonRankFigures>(
    rows: readonly Row[],
    request: ComparisonRankRequest<Row>,
): RankedComparison<Row> {
    switch (request.objective) {
        case SizingObjective.CycleCash: {
            return rankedBy(rows, SizingObjective.CycleCash, null, byCycleNet);
        }
        case SizingObjective.MonthlyNet: {
            return rankedBy(rows, SizingObjective.MonthlyNet, null, byMonthlyNet);
        }
        case SizingObjective.RuinFirst: {
            return rankRuinFirst(rows, request);
        }
    }
}

export function riskRowFigures(
    out: Pick<SimOutputs, 'expectedMonthlyNet' | 'expectedNet'>,
): RiskRowFigures {
    return {
        cycleNet: out.expectedNet,
        monthlyNet: out.expectedMonthlyNet,
    };
}

export function riskTableObjective(
    requested: SizingObjective,
    surface: RankingSurface = RankingSurface.DocumentedRules,
): RiskTableObjective {
    const applicability = objectiveApplicability(requested, surface);
    return {
        effective: applicability.effectiveObjective,
        label: SIZING_OBJECTIVE_LABEL[requested],
        note: applicability.reason === null ? null : RUIN_FIRST_RISK_TABLE_NOTE,
        requested,
    };
}

export function starredRows<Row>(
    rows: readonly Row[],
    objective: SizingObjective,
    figures: (row: Row) => RiskRowFigures,
): ReadonlySet<Row> {
    const effective = riskTableObjective(objective).effective;
    const score = (row: Row): number => {
        const { cycleNet, monthlyNet } = figures(row);
        return effective === SizingObjective.CycleCash ? cycleNet : monthlyNet;
    };
    let best = -Infinity;
    for (const row of rows) best = Math.max(best, score(row));
    return new Set(rows.filter((row) => score(row) === best));
}

function byCycleNet(a: ComparisonRankFigures, b: ComparisonRankFigures): number {
    return b.out.expectedNet - a.out.expectedNet;
}

function byMonthlyNet(
    a: ComparisonRankFigures,
    b: ComparisonRankFigures,
): number {
    return b.out.expectedMonthlyNet - a.out.expectedMonthlyNet;
}

function hasPositiveEv(row: ComparisonRankFigures): boolean {
    return row.out.expectedNetPerAttempt > 0;
}

function rankedBy<Row>(
    rows: readonly Row[],
    effective: SizingObjective,
    note: null | string,
    compare: (a: Row, b: Row) => number,
): RankedComparison<Row> {
    return {
        effective,
        label: SIZING_OBJECTIVE_LABEL[effective],
        note,
        rows: rows.toSorted(compare),
    };
}

function rankRuinFirst<Row extends ComparisonRankFigures>(
    rows: readonly Row[],
    request: ComparisonRankRequest<Row>,
): RankedComparison<Row> {
    const { bankrollCents, batchLoss } = request;
    if (bankrollCents === null || bankrollCents <= 0) {
        return rankedBy(
            rows,
            SizingObjective.MonthlyNet,
            RUIN_FIRST_NEEDS_BANKROLL_NOTE,
            byMonthlyNet,
        );
    }
    const positive = rows.filter(hasPositiveEv);
    if (positive.length === 0) {
        return rankedBy(
            rows,
            SizingObjective.MonthlyNet,
            RUIN_FIRST_NO_POSITIVE_EV_NOTE,
            byMonthlyNet,
        );
    }
    const pricings = new Map(
        positive.map((row) => [row, batchLoss(row, bankrollCents)]),
    );
    const priced = (row: Row): null | number => {
        const pricing = pricings.get(row);
        return pricing?.status === BatchLossStatus.Priced
            ? pricing.probability
            : null;
    };
    if (positive.every((row) => priced(row) === null)) {
        const isUnpriced = pricings
            .values()
            .some((pricing) => pricing.status === BatchLossStatus.Unpriced);
        return rankedBy(
            rows,
            SizingObjective.MonthlyNet,
            isUnpriced
                ? RUIN_FIRST_UNPRICED_NOTE
                : RUIN_FIRST_NO_ATTEMPT_NOTE,
            byMonthlyNet,
        );
    }
    return rankedBy(rows, SizingObjective.RuinFirst, null, (a, b) => {
        const positivity = Number(!hasPositiveEv(a)) - Number(!hasPositiveEv(b));
        if (positivity !== 0) return positivity;
        const lossA = priced(a);
        const lossB = priced(b);
        if (lossA === null || lossB === null) {
            if (lossA !== lossB) return lossA === null ? 1 : -1;
        } else if (lossA !== lossB) {
            return lossA - lossB;
        }
        return byMonthlyNet(a, b);
    });
}
