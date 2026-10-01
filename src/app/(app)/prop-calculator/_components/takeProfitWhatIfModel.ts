import {
    type BankrollPlanVariantInputs,
    type TakeProfitRowsToolsRequest,
    type TakeProfitRowSummary,
    ToolsRequestKind,
} from '~/app/(app)/prop-calculator/_workers/toolsWorkerMessages';

export const YOUR_DOCUMENTED_RR_LABEL = 'your documented rr';

export const DEFAULT_TAKE_PROFIT_RR_CANDIDATES: readonly number[] = [1, 1.5, 2, 3];

export interface TakeProfitWhatIfCardInputs {
    readonly anchorRrRatio: number;
    readonly rrCandidates: readonly number[];
}

export interface TakeProfitWhatIfRowView {
    readonly attemptPassProbability: number;
    readonly daysToPassP50: number;
    readonly expectedMonthlyNet: number;
    readonly expectedNet: number;
    readonly isAnchor: boolean;
    readonly label: string;
    readonly rrRatio: number;
    readonly winrate: number;
}

export function defaultTakeProfitWhatIfInputs(
    calculatorRrRatio: number,
): TakeProfitWhatIfCardInputs {
    return {
        anchorRrRatio: calculatorRrRatio,
        rrCandidates: takeProfitCandidatesAround(calculatorRrRatio),
    };
}

export function takeProfitWhatIfNonAnchorLabel(anchorRrRatio: number): string {
    return `what-if: win rate derived from your stated point, differs from your documented 1:${anchorRrRatio.toFixed(2)}`;
}

export function takeProfitWhatIfRequest(
    variant: BankrollPlanVariantInputs,
    inputs: TakeProfitWhatIfCardInputs,
    runId: number,
): TakeProfitRowsToolsRequest {
    return {
        anchorRrRatio: inputs.anchorRrRatio,
        kind: ToolsRequestKind.TakeProfitRows,
        rrCandidates: inputs.rrCandidates,
        runId,
        variant,
    };
}

export function takeProfitWhatIfRowViews(
    rows: readonly TakeProfitRowSummary[],
    anchorRrRatio: number,
): readonly TakeProfitWhatIfRowView[] {
    return rows
        .map(
            (row): TakeProfitWhatIfRowView => ({
                attemptPassProbability: row.attemptPassProbability,
                daysToPassP50: row.daysToPassP50,
                expectedMonthlyNet: row.expectedMonthlyNet,
                expectedNet: row.expectedNet,
                isAnchor: row.rrRatio === anchorRrRatio,
                label:
                    row.rrRatio === anchorRrRatio
                        ? YOUR_DOCUMENTED_RR_LABEL
                        : takeProfitWhatIfNonAnchorLabel(anchorRrRatio),
                rrRatio: row.rrRatio,
                winrate: row.winrate,
            }),
        )
        .toSorted(
            (a, b) => b.expectedMonthlyNet - a.expectedMonthlyNet || a.rrRatio - b.rrRatio,
        );
}

function takeProfitCandidatesAround(anchorRrRatio: number): readonly number[] {
    const candidates = new Set<number>([...DEFAULT_TAKE_PROFIT_RR_CANDIDATES, anchorRrRatio]);
    return Array.from(candidates).toSorted((a, b) => a - b);
}
