import { describe, expect, it } from 'vitest';

import { describeUnscorableLadderRun } from '~/app/(app)/prop-calculator/_components/ladderUnscorable';
import { formatPercent } from '~/lib/format';
import { LADDER_EVAL_PASS_FLOOR } from '~/lib/prop-calculator';

describe('describeUnscorableLadderRun (Ladder Lab explains empty or thinned rankings)', () => {
    const floor = formatPercent(LADDER_EVAL_PASS_FLOOR, 0);

    it('says nothing when every ladder was scorable', () => {
        expect(
            describeUnscorableLadderRun({
                laddersScored: 12,
                unscorableCount: 0,
            }),
        ).toBeNull();
    });

    it('explains an empty ranking when no ladder reached the eval pass floor, naming web controls only', () => {
        const note = describeUnscorableLadderRun({
            laddersScored: 12,
            unscorableCount: 12,
        });
        expect(note).toBe(
            `All 12 ladders passed the eval in under ${floor} of trials, below the eval pass floor the search needs to rank a ladder, so there is nothing to rank. Check the win rate, the R:R, the stop and the rung range.`,
        );
        expect(note).not.toContain('--');
    });

    it('counts the ladders left out when only some fell below the floor', () => {
        expect(
            describeUnscorableLadderRun({
                laddersScored: 12,
                unscorableCount: 5,
            }),
        ).toBe(
            `5 of 12 ladders passed the eval in under ${floor} of trials and are left out of every ranking.`,
        );
    });
});
