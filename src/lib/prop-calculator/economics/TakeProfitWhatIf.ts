import {
    type EdgeModel,
    fraction,
    type Fraction0to1,
} from '~/lib/prop-calculator/core';
import {
    type SimInputs,
    type SimOutputs,
} from '~/lib/prop-calculator/simulator';

export const TAKE_PROFIT_WHAT_IF_LABEL =
    'what-if: win rate derived from your stated point, differs from your fixed 1:2';

export interface TakeProfitWhatIfRow {
    readonly label: string;
    readonly out: SimOutputs;
    readonly rrRatio: number;
    readonly winrate: Fraction0to1;
}

export function takeProfitCandidateInputs(
    base: SimInputs,
    edge: EdgeModel,
    rrCandidates: readonly number[],
): SimInputs[] {
    return rrCandidates.map((rrRatio) => ({
        ...base,
        fundedRrRatio: rrRatio,
        rrRatio,
        winrate: edge.winProbability(rrRatio),
    }));
}

export function takeProfitRows(
    candidateInputs: readonly SimInputs[],
    outputs: readonly SimOutputs[],
): TakeProfitWhatIfRow[] {
    return candidateInputs.map((inputs, index) => {
        const out = outputs[index];
        if (out === undefined) {
            throw new Error(
                'takeProfitRows: outputs must have exactly one entry per candidate input',
            );
        }
        return {
            label: TAKE_PROFIT_WHAT_IF_LABEL,
            out,
            rrRatio: inputs.rrRatio,
            winrate: fraction(inputs.winrate),
        };
    });
}
