import { describe, expect, it } from 'vitest';

import {
    type CalculatorAction,
    CalculatorActionType,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    createCalculatorActions,
    isObjectiveInSearch,
    signedInDefaultObjective,
} from '~/app/(app)/prop-calculator/_components/useCalculator';
import {
    type BankrollParameters,
    DEFAULT_RULEBOOK,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';

const SWITCH_CENTS = 500_000;

const BANKROLL: BankrollParameters = {
    ...DEFAULT_RULEBOOK.bankroll,
    objectiveSwitchCents: SWITCH_CENTS,
};

function defaultFor(
    overrides: Partial<Parameters<typeof signedInDefaultObjective>[0]> = {},
) {
    return signedInDefaultObjective({
        availableCents: 100_000,
        bankroll: BANKROLL,
        hasLinkObjective: false,
        isObjectiveChanged: false,
        ...overrides,
    });
}

describe('setObjective (PT-63b, F-V15)', () => {
    it('dispatches SetObjective with the chosen objective', () => {
        const dispatched: CalculatorAction[] = [];
        createCalculatorActions((action) => {
            dispatched.push(action);
        }).setObjective(SizingObjective.CycleCash);
        expect(dispatched).toStrictEqual([
            {
                objective: SizingObjective.CycleCash,
                type: CalculatorActionType.SetObjective,
            },
        ]);
    });
});

describe('isObjectiveInSearch', () => {
    it('is true only when the link carries the obj key', () => {
        expect(isObjectiveInSearch('firm=topstep&obj=cycle-cash')).toBe(true);
        expect(isObjectiveInSearch('obj=garbage')).toBe(true);
        expect(isObjectiveInSearch('firm=topstep')).toBe(false);
        expect(isObjectiveInSearch('')).toBe(false);
    });
});

describe('signedInDefaultObjective (QV-5, F-V15)', () => {
    it('picks RuinFirst for a signed-in user below the bankroll threshold on a link without obj', () => {
        expect(defaultFor()).toBe(SizingObjective.RuinFirst);
    });

    it('picks nothing at or above the threshold, because MonthlyNet is already the default', () => {
        expect(defaultFor({ availableCents: SWITCH_CENTS })).toBeNull();
        expect(defaultFor({ availableCents: SWITCH_CENTS + 1 })).toBeNull();
    });

    it('picks nothing when the user set no threshold', () => {
        expect(
            defaultFor({
                bankroll: { ...BANKROLL, objectiveSwitchCents: null },
            }),
        ).toBeNull();
    });

    it('picks nothing when the bankroll is not known', () => {
        expect(defaultFor({ availableCents: null })).toBeNull();
    });

    it('never overrides an objective the link carries', () => {
        expect(defaultFor({ hasLinkObjective: true })).toBeNull();
    });

    it('never overrides an objective the user already changed on the page', () => {
        expect(defaultFor({ isObjectiveChanged: true })).toBeNull();
    });
});
