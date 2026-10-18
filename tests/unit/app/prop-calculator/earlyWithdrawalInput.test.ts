import { describe, expect, it } from 'vitest';

import {
    CalculatorActionType,
    calculatorReducer,
    defaultCalculatorState,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { simInputsCacheKey } from '~/app/(app)/prop-calculator/_components/simInputsCacheKey';
import {
    decodeState,
    encodeState,
} from '~/app/(app)/prop-calculator/_components/urlState';
import {
    FirmId,
    MffuVariant,
    type Plan,
    withOneTimeEarlyWithdrawalTaken,
} from '~/lib/prop-calculator';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

function mffPlan(variant: MffuVariant): Plan {
    const plan = mffu().findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant,
    });
    if (!plan) throw new Error(`MFF ${variant} 50K plan not found`);
    return plan;
}

function mffu() {
    const firm = ALL_FIRMS.find((candidate) => candidate.id === FirmId.Mffu);
    if (!firm) throw new Error('MFF firm not registered');
    return firm;
}

function proState() {
    return {
        ...defaultCalculatorState(),
        firm: mffu(),
        plan: mffPlan(MffuVariant.Pro),
    };
}

function takenOnPro() {
    return calculatorReducer(proState(), {
        isTaken: true,
        type: CalculatorActionType.SetTakesOneTimeEarlyWithdrawal,
    });
}

describe('web calculator input for the MFF Pro one-time early withdrawal (N-64, T30 opt-in)', () => {
    it('starts off and toggles through the reducer', () => {
        const state = proState();
        expect(state.takesOneTimeEarlyWithdrawal).toBe(false);

        const next = calculatorReducer(state, {
            isTaken: true,
            type: CalculatorActionType.SetTakesOneTimeEarlyWithdrawal,
        });

        expect(next.takesOneTimeEarlyWithdrawal).toBe(true);
        expect(next.plan).toBe(state.plan);
    });

    it('round-trips through the share URL and defaults to off when absent', () => {
        const state = { ...proState(), takesOneTimeEarlyWithdrawal: true };
        const encoded = encodeState(state);

        expect(encoded.get('ew')).toBe('1');
        expect(
            decodeState(encoded, ALL_FIRMS, defaultCalculatorState())
                .takesOneTimeEarlyWithdrawal,
        ).toBe(true);

        encoded.delete('ew');
        expect(
            decodeState(encoded, ALL_FIRMS, defaultCalculatorState())
                .takesOneTimeEarlyWithdrawal,
        ).toBe(false);
    });

    it('maps the toggle onto the plan only where the plan offers the rule', () => {
        const pro = mffPlan(MffuVariant.Pro);
        const rapid = mffPlan(MffuVariant.Rapid);

        expect(
            withOneTimeEarlyWithdrawalTaken(pro, true)
                .takesOneTimeEarlyWithdrawal,
        ).toBe(true);
        expect(withOneTimeEarlyWithdrawalTaken(pro, false)).toBe(pro);
        expect(withOneTimeEarlyWithdrawalTaken(rapid, true)).toBe(rapid);
    });

    it('keys cached simulations on the opt-in, so toggling it never reuses a stale result', () => {
        const pro = mffPlan(MffuVariant.Pro);
        const base = {
            fundedHorizonDays: 60,
            maxEvalDays: 60,
            rrRatio: 2,
            seed: 1,
            tradesPerDay: 1,
            trials: 10,
            winrate: 0.5,
        };

        expect(simInputsCacheKey({ ...base, plan: pro })).not.toBe(
            simInputsCacheKey({
                ...base,
                plan: withOneTimeEarlyWithdrawalTaken(pro, true),
            }),
        );
    });
});

describe('the early-withdrawal opt-in is only on while the active plan offers the rule, so its toggle is never hidden while a panel applies it (WP22b, WP18i re-review)', () => {
    it('turns off when switching to a plan without the rule, and stays off on the way back', () => {
        const onRapid = calculatorReducer(takenOnPro(), {
            plan: mffPlan(MffuVariant.Rapid),
            type: CalculatorActionType.SetPlan,
        });
        expect(onRapid.plan.oneTimeEarlyWithdrawal).toBeNull();
        expect(onRapid.takesOneTimeEarlyWithdrawal).toBe(false);

        const backOnPro = calculatorReducer(onRapid, {
            plan: mffPlan(MffuVariant.Pro),
            type: CalculatorActionType.SetPlan,
        });
        expect(backOnPro.takesOneTimeEarlyWithdrawal).toBe(false);
    });

    it('stays on when the selected plan still offers the rule', () => {
        const pro = mffPlan(MffuVariant.Pro);
        expect(pro.oneTimeEarlyWithdrawal).not.toBeNull();

        expect(
            calculatorReducer(takenOnPro(), {
                plan: pro,
                type: CalculatorActionType.SetPlan,
            }).takesOneTimeEarlyWithdrawal,
        ).toBe(true);
        expect(
            calculatorReducer(takenOnPro(), {
                type: CalculatorActionType.SetSeed,
                value: 7,
            }).takesOneTimeEarlyWithdrawal,
        ).toBe(true);
    });

    it('turns off when switching to a firm whose selected plan lacks the rule', () => {
        const apex = ALL_FIRMS.find((firm) => firm.id === FirmId.Apex);
        if (!apex) throw new Error('Apex firm not registered');

        const next = calculatorReducer(takenOnPro(), {
            firm: apex,
            type: CalculatorActionType.SetFirm,
        });
        expect(next.plan.oneTimeEarlyWithdrawal).toBeNull();
        expect(next.takesOneTimeEarlyWithdrawal).toBe(false);
    });

    it('ignores a shared link that carries ew=1 on a plan without the rule', () => {
        const apexState = {
            ...defaultCalculatorState(),
            takesOneTimeEarlyWithdrawal: true,
        };
        const decoded = decodeState(
            encodeState(apexState),
            ALL_FIRMS,
            defaultCalculatorState(),
        );
        expect(decoded.plan.id.firm).toBe(FirmId.Apex);
        expect(decoded.plan.oneTimeEarlyWithdrawal).toBeNull();

        expect(
            calculatorReducer(defaultCalculatorState(), {
                state: decoded,
                type: CalculatorActionType.ApplyState,
            }).takesOneTimeEarlyWithdrawal,
        ).toBe(false);
    });

    it('keeps a shared link that carries ew=1 on MFF Pro', () => {
        const decoded = decodeState(
            encodeState({ ...proState(), takesOneTimeEarlyWithdrawal: true }),
            ALL_FIRMS,
            defaultCalculatorState(),
        );
        expect(
            calculatorReducer(defaultCalculatorState(), {
                state: decoded,
                type: CalculatorActionType.ApplyState,
            }).takesOneTimeEarlyWithdrawal,
        ).toBe(true);
    });

    it('cannot be turned on for a plan without the rule', () => {
        const rapidState = {
            ...proState(),
            plan: mffPlan(MffuVariant.Rapid),
        };
        expect(
            calculatorReducer(rapidState, {
                isTaken: true,
                type: CalculatorActionType.SetTakesOneTimeEarlyWithdrawal,
            }).takesOneTimeEarlyWithdrawal,
        ).toBe(false);
    });
});
