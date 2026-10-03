import { formatCurrency } from '~/lib/format';
import {
    CENTS_PER_DOLLAR,
    contracts,
    contractsAtStop,
    type Dollars,
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
    type BankrollRiskOutputs,
    type BatchLossPricing,
    priceBatchLoss,
    rankRuinFirst,
} from '~/lib/prop-calculator/economics';

import {
    rulebookOwnerText,
    type RulebookSource,
} from './bankroll/rulebookSource';

export {
    RUIN_FIRST_NEEDS_BANKROLL_NOTE,
    RUIN_FIRST_NO_ATTEMPT_NOTE,
    RUIN_FIRST_NO_POSITIVE_EV_NOTE,
    RUIN_FIRST_UNPRICED_NOTE,
} from '~/lib/prop-calculator/economics';

export interface ComparisonRankFigures {
    readonly out: Pick<
        SimOutputs,
        'expectedMonthlyNet' | 'expectedNet' | 'expectedNetPerAttempt'
    >;
}

export interface ComparisonRankRequest<Row> {
    readonly bankrollCents: null | number;
    readonly batchLoss: (row: Row, bankroll: Dollars) => BatchLossPricing;
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

export class BatchLossCache {
    private readonly entries = new WeakMap<
        BankrollRiskOutputs,
        { readonly key: string; readonly pricing: BatchLossPricing }
    >();

    pricing(
        out: BankrollRiskOutputs,
        bankroll: Dollars,
        seed: number,
    ): BatchLossPricing {
        const key = `${bankroll}:${seed}`;
        const cached = this.entries.get(out);
        if (cached?.key === key) return cached.pricing;
        const pricing = priceBatchLoss(out, bankroll, seed);
        this.entries.set(out, { key, pricing });
        return pricing;
    }
}

export const ENGINE_OPTIMUM_NOTE =
    'The starred row is the engine optimum for this sweep, not the documented sizing: it assumes no daily profit cap in the eval and one risk per trade for both the eval and funded phases. Ruin first and cycle cash do not change documented sizing.';

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

export function rankComparison<Row extends ComparisonRankFigures>(
    rows: readonly Row[],
    request: ComparisonRankRequest<Row>,
): RankedComparison<Row> {
    switch (request.objective) {
        case SizingObjective.CycleCash: {
            return rankedBy(rows, SizingObjective.CycleCash, byCycleNet);
        }
        case SizingObjective.MonthlyNet: {
            return rankedBy(rows, SizingObjective.MonthlyNet, byMonthlyNet);
        }
        case SizingObjective.RuinFirst: {
            const ranking = rankRuinFirst(rows, {
                bankroll:
                    request.bankrollCents === null
                        ? null
                        : dollars(request.bankrollCents / CENTS_PER_DOLLAR),
                batchLoss: request.batchLoss,
            });
            return ranking.fallback === null
                ? rankedAs(SizingObjective.RuinFirst, null, ranking.rows)
                : rankedAs(
                      SizingObjective.MonthlyNet,
                      ranking.note,
                      ranking.rows,
                  );
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

function byCycleNet(
    a: ComparisonRankFigures,
    b: ComparisonRankFigures,
): number {
    return b.out.expectedNet - a.out.expectedNet;
}

function byMonthlyNet(
    a: ComparisonRankFigures,
    b: ComparisonRankFigures,
): number {
    return b.out.expectedMonthlyNet - a.out.expectedMonthlyNet;
}

function rankedAs<Row>(
    effective: SizingObjective,
    note: null | string,
    rows: Row[],
): RankedComparison<Row> {
    return {
        effective,
        label: SIZING_OBJECTIVE_LABEL[effective],
        note,
        rows,
    };
}

function rankedBy<Row>(
    rows: readonly Row[],
    effective: SizingObjective,
    compare: (a: Row, b: Row) => number,
): RankedComparison<Row> {
    return rankedAs(effective, null, rows.toSorted(compare));
}
