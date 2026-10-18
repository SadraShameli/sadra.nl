import { describe, expect, it } from 'vitest';

import { chooseObjective } from '~/lib/prop-calculator/advisor/actions/ChooseObjective';
import {
    type BankrollParameters,
    DEFAULT_RULEBOOK,
} from '~/lib/prop-calculator/advisor/Rulebook';
import { SizingObjective } from '~/lib/prop-calculator/advisor/SizingObjective';

function bankrollWith(
    overrides: Partial<BankrollParameters>,
): BankrollParameters {
    return { ...DEFAULT_RULEBOOK.bankroll, ...overrides };
}

describe('chooseObjective (F-V15, QV-5)', () => {
    it('gives MonthlyNet when the available cents is null, whatever the threshold', () => {
        expect(
            chooseObjective(
                null,
                bankrollWith({ objectiveSwitchCents: 100_000 }),
            ),
        ).toBe(SizingObjective.MonthlyNet);
    });

    it('gives MonthlyNet when no threshold is set, whatever the balance', () => {
        expect(
            chooseObjective(1, bankrollWith({ objectiveSwitchCents: null })),
        ).toBe(SizingObjective.MonthlyNet);
    });

    it('gives RuinFirst when the available cents is below the threshold', () => {
        expect(
            chooseObjective(
                50_000,
                bankrollWith({ objectiveSwitchCents: 100_000 }),
            ),
        ).toBe(SizingObjective.RuinFirst);
    });

    it('gives MonthlyNet when the available cents equals the threshold', () => {
        expect(
            chooseObjective(
                100_000,
                bankrollWith({ objectiveSwitchCents: 100_000 }),
            ),
        ).toBe(SizingObjective.MonthlyNet);
    });

    it('gives MonthlyNet when the available cents is above the threshold', () => {
        expect(
            chooseObjective(
                150_000,
                bankrollWith({ objectiveSwitchCents: 100_000 }),
            ),
        ).toBe(SizingObjective.MonthlyNet);
    });
});
