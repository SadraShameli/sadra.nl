import {
    contracts,
    contractsAtStop,
    type LadderScore,
    type LadderSearchResult,
    type PositionSizingConfig,
    type SimOutputs,
} from '~/lib/prop-calculator';
import { SizingObjective } from '~/lib/prop-calculator/advisor';
import {
    objectiveApplicability,
    RankingSurface,
} from '~/lib/prop-calculator/advisor/actions';
import { SIZING_OBJECTIVE_LABEL } from '~/lib/prop-calculator/advisor/policy';

export interface LadderRungPlacement {
    readonly contracts: number;
    readonly placedRisk: number;
    readonly rung: number;
}

export interface ObjectiveOption {
    readonly label: string;
    readonly objective: SizingObjective;
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

export const RUIN_FIRST_RISK_TABLE_NOTE =
    'RuinFirst ranks plans to buy; risk sizing stays on monthly net (Hard Rule 3)';

export const OBJECTIVE_OPTIONS: readonly ObjectiveOption[] = Object.values(
    SizingObjective,
).map((objective) => ({
    label: SIZING_OBJECTIVE_LABEL[objective],
    objective,
}));

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
