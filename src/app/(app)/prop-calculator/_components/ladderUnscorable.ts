import { formatPercent } from '~/lib/format';
import { LADDER_EVAL_PASS_FLOOR } from '~/lib/prop-calculator';

import { type LadderSearchRun } from './ladderSearchTypes';

export function describeUnscorableLadderRun(
    run: Pick<LadderSearchRun, 'laddersScored' | 'unscorableCount'>,
): null | string {
    const { laddersScored, unscorableCount } = run;
    if (unscorableCount === 0) return null;
    const floor = formatPercent(LADDER_EVAL_PASS_FLOOR, 0);
    return unscorableCount >= laddersScored
        ? `All ${laddersScored} ladders passed the eval in under ${floor} of trials, below the eval pass floor the search needs to rank a ladder, so there is nothing to rank. Check the win rate, the R:R, the stop and the rung range.`
        : `${unscorableCount} of ${laddersScored} ladders passed the eval in under ${floor} of trials and are left out of every ranking.`;
}
