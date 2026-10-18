import { describe, expect, it } from 'vitest';

import { describeLadderIgnoredInputs } from '~/app/(app)/prop-calculator/_components/ladderIgnoredInputs';
import {
    LADDER_IGNORED_INPUT_REASONS,
    LadderIgnoredInput,
    SIM_DEFAULTS,
} from '~/lib/prop-calculator';

describe('describeLadderIgnoredInputs (WP15 handoff: Ladder Lab says what it ignores)', () => {
    it('says nothing when every ignored input sits at its neutral value', () => {
        expect(
            describeLadderIgnoredInputs({
                idleDayProbability: 0,
                maxAttempts: 1,
                rebuyLagDays: 0,
            }),
        ).toBeNull();
        expect(describeLadderIgnoredInputs({})).toBeNull();
        expect(
            describeLadderIgnoredInputs({
                idleDayProbability: SIM_DEFAULTS.idleDayProbability,
                maxAttempts: SIM_DEFAULTS.maxAttempts,
                rebuyLagDays: SIM_DEFAULTS.rebuyLagDays,
            }),
        ).toBeNull();
    });

    it.each([
        [LadderIgnoredInput.IdleDays, { idleDayProbability: 0.1 }],
        [LadderIgnoredInput.MaxAttempts, { maxAttempts: 2 }],
        [LadderIgnoredInput.RebuyLag, { rebuyLagDays: 1 }],
    ])(
        'reads the %s reason from the shared prop-calculator table',
        (input, inputs) => {
            expect(describeLadderIgnoredInputs(inputs)).toContain(
                `: it ${LADDER_IGNORED_INPUT_REASONS[input]}.`,
            );
        },
    );

    it('names the idle-day probability it ignores', () => {
        expect(describeLadderIgnoredInputs({ idleDayProbability: 0.2 })).toBe(
            'Ladder Lab ignores the idle-day probability of 20%: it trades every day and does not model idle days. The main simulation still applies it.',
        );
    });

    it('names the max reset attempts it ignores', () => {
        expect(describeLadderIgnoredInputs({ maxAttempts: 3 })).toBe(
            'Ladder Lab ignores the max reset attempts of 3: it prices unlimited retries into the cost per funded account. The main simulation still applies it.',
        );
    });

    it('names a one-day rebuy lag in the singular', () => {
        expect(describeLadderIgnoredInputs({ rebuyLagDays: 1 })).toBe(
            'Ladder Lab ignores the rebuy lag of 1 day: it does not model the days an account slot sits empty between attempts. The main simulation still applies it.',
        );
    });

    it('lists every ignored input in one note', () => {
        expect(
            describeLadderIgnoredInputs({
                idleDayProbability: 0.05,
                maxAttempts: 2,
                rebuyLagDays: 2.5,
            }),
        ).toBe(
            'Ladder Lab ignores the idle-day probability of 5%, the max reset attempts of 2 and the rebuy lag of 2.5 days: it trades every day and does not model idle days, it prices unlimited retries into the cost per funded account and it does not model the days an account slot sits empty between attempts. The main simulation still applies them.',
        );
    });

    it('never contains an em dash', () => {
        expect(
            describeLadderIgnoredInputs({
                idleDayProbability: 0.5,
                maxAttempts: 4,
                rebuyLagDays: 3,
            }),
        ).not.toContain('\u{2014}');
    });
});
