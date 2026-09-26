import { type SimInputs, type SimOutputs, simulate } from '../simulator';
import { type FundedCandidate } from './FundedCandidate';

export enum FundedSortKey {
    Cycle = 'cycle',
    Monthly = 'monthly',
}

export interface FundedSweepRow {
    candidate: FundedCandidate;
    out: SimOutputs;
}

export const FUNDED_SORT_KEYS: readonly FundedSortKey[] = [
    FundedSortKey.Monthly,
    FundedSortKey.Cycle,
];

export function runFundedCandidateSweep(
    base: SimInputs,
    candidates: readonly FundedCandidate[],
    sort: FundedSortKey,
): FundedSweepRow[] {
    return sortFundedResults(
        candidates.map((candidate) => ({
            candidate,
            out: simulate({ ...base, ...candidate.overrides }),
        })),
        sort,
    );
}

export function sortFundedResults<
    Row extends {
        out: Pick<SimOutputs, 'expectedMonthlyNet' | 'expectedNet'>;
    },
>(rows: readonly Row[], sort: FundedSortKey): Row[] {
    return rows.toSorted((a, b) => {
        switch (sort) {
            case FundedSortKey.Cycle: {
                return b.out.expectedNet - a.out.expectedNet;
            }
            case FundedSortKey.Monthly: {
                return b.out.expectedMonthlyNet - a.out.expectedMonthlyNet;
            }
        }
    });
}

export function survivorCount(
    out: Pick<SimOutputs, 'fundedSurvivalProbability'>,
    trials: number,
): number {
    return Math.round(out.fundedSurvivalProbability * trials);
}
