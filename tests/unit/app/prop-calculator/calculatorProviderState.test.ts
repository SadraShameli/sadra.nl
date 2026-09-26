import { describe, expect, it } from 'vitest';

import {
    type CalculatorAction,
    CalculatorActionType,
    calculatorReducer,
    defaultCalculatorState,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { simInputsCacheKey } from '~/app/(app)/prop-calculator/_components/simInputsCacheKey';
import { tradingInputBounds } from '~/app/(app)/prop-calculator/_components/tradingInputBounds';
import {
    type CalculatorState,
    SizingMode,
} from '~/app/(app)/prop-calculator/_components/types';
import {
    decodeState,
    encodeState,
} from '~/app/(app)/prop-calculator/_components/urlState';
import {
    baseSimulationKey,
    shouldRunBaseSimulation,
} from '~/app/(app)/prop-calculator/_components/useBaseSimulation';
import {
    buildSimInputs,
    createCalculatorActions,
    initialStateFromSearch,
    pinScenario,
} from '~/app/(app)/prop-calculator/_components/useCalculator';
import {
    ALL_FIRMS,
    FirmId,
    simulate,
    withPlanOptIns,
} from '~/lib/prop-calculator';
import { CALCULATOR_SCALAR_BOUNDS } from '~/lib/schemas/url';

const FUNDED_HORIZON_UI_MAX_DAYS = tradingInputBounds().fundedHorizonDays.max;

function dispatchedHorizon(days: number): unknown {
    const dispatched: CalculatorAction[] = [];
    createCalculatorActions((action) => {
        dispatched.push(action);
    }).setFundedHorizonDays(days);
    const [action] = dispatched;
    if (action?.type !== CalculatorActionType.SetFundedHorizonDays) {
        throw new Error('expected a funded horizon action');
    }
    return action.value;
}

function sharedState(): CalculatorState {
    const firm = ALL_FIRMS.find((f) => f.id === FirmId.TopStep);
    if (!firm) throw new Error('TopStep firm not registered');
    let state = calculatorReducer(defaultCalculatorState(), {
        firm,
        type: CalculatorActionType.SetFirm,
    });
    state = calculatorReducer(state, {
        type: CalculatorActionType.SetWinrate,
        value: 0.47,
    });
    return calculatorReducer(state, {
        type: CalculatorActionType.SetRrRatio,
        value: 2.5,
    });
}

function withoutLabIds(state: CalculatorState) {
    return {
        ...state,
        labScenarios: state.labScenarios.map(({ id: _id, ...rest }) => rest),
    };
}

describe('initialStateFromSearch', () => {
    it('equals decodeState of a shared query, with or without the question mark', () => {
        const search = encodeState(sharedState()).toString();
        const decoded = decodeState(
            new URLSearchParams(search),
            ALL_FIRMS,
            defaultCalculatorState(),
        );
        expect(withoutLabIds(initialStateFromSearch(`?${search}`))).toEqual(
            withoutLabIds(decoded),
        );
        expect(withoutLabIds(initialStateFromSearch(search))).toEqual(
            withoutLabIds(decoded),
        );
        expect(initialStateFromSearch(search).firm.id).toBe(FirmId.TopStep);
        expect(initialStateFromSearch(search).winrate).toBe(0.47);
    });

    it('keeps the lab scenario ids of a shared query', () => {
        const shared = sharedState();
        const search = encodeState(shared).toString();
        expect(
            initialStateFromSearch(search).labScenarios.map((s) => s.id),
        ).toEqual(shared.labScenarios.map((s) => s.id));
    });

    it('gives the defaults for an empty search or a search without a firm', () => {
        const defaults = withoutLabIds(defaultCalculatorState());
        expect(withoutLabIds(initialStateFromSearch(''))).toEqual(defaults);
        expect(withoutLabIds(initialStateFromSearch('?'))).toEqual(defaults);
        expect(withoutLabIds(initialStateFromSearch('?wr=0.9'))).toEqual(
            defaults,
        );
    });

    it('falls back to the defaults for an unknown firm', () => {
        const state = initialStateFromSearch('?firm=nope&wr=0.5');
        expect(state.firm.id).toBe(defaultCalculatorState().firm.id);
    });
});

describe('buildSimInputs', () => {
    it('builds the simulation inputs of a state', () => {
        const state = sharedState();
        const inputs = buildSimInputs(state);
        expect(inputs.winrate).toBe(0.47);
        expect(inputs.rrRatio).toBe(2.5);
        expect(inputs.riskPerTrade).toBe(state.riskDollars);
        expect(inputs.plan.id).toEqual(state.plan.id);
        expect(inputs.fundedHorizonDays).toBe(state.fundedHorizonDays);
        expect(inputs.trials).toBe(state.trials);
    });

    it('converts percent risk to dollars on the plan size', () => {
        const state: CalculatorState = {
            ...sharedState(),
            riskPercent: 0.8,
            sizingMode: SizingMode.Percent,
        };
        expect(buildSimInputs(state).riskPerTrade).toBe(
            (state.plan.accountSize * 0.8) / 100,
        );
    });

    it('applies the opt-ins to the plan', () => {
        const state = sharedState();
        expect(buildSimInputs(state).plan).toEqual(
            withPlanOptIns(state.plan, {
                takesFundedReset: state.takesFundedReset,
                takesOneTimeEarlyWithdrawal: state.takesOneTimeEarlyWithdrawal,
            }),
        );
    });
});

describe('pinScenario', () => {
    it('stores exactly the result it is given', () => {
        const result = simulate({
            ...buildSimInputs(sharedState()),
            trials: 100,
        });
        expect(pinScenario(result).result).toBe(result);
    });
});

describe('base simulation', () => {
    it('keys the base result by the debounced inputs key', () => {
        const inputs = buildSimInputs(sharedState());
        expect(baseSimulationKey(inputs)).toBe(simInputsCacheKey(inputs));
    });

    it('computes its first key from the lazily initialized state, never from the defaults', () => {
        const search = encodeState(sharedState()).toString();
        const firstKey = baseSimulationKey(
            buildSimInputs(initialStateFromSearch(search)),
        );
        const decoded = decodeState(
            new URLSearchParams(search),
            ALL_FIRMS,
            defaultCalculatorState(),
        );
        expect(firstKey).toBe(simInputsCacheKey(buildSimInputs(decoded)));
        const defaultKey = baseSimulationKey(
            buildSimInputs(defaultCalculatorState()),
        );
        expect(firstKey).not.toBe(defaultKey);
    });

    it.each([
        [true, true, true, true],
        [false, true, true, false],
        [true, false, true, false],
        [true, true, false, false],
        [false, false, false, false],
    ])(
        'runs only when mounted=%s, legacy hash settled=%s and a consumer=%s all hold (%s)',
        (mounted, legacyHashSettled, hasConsumer, expected) => {
            expect(
                shouldRunBaseSimulation({
                    hasConsumer,
                    legacyHashSettled,
                    mounted,
                }),
            ).toBe(expected);
        },
    );
});

describe('setFundedHorizonDays', () => {
    it('keeps the UI max below the URL bound', () => {
        expect(FUNDED_HORIZON_UI_MAX_DAYS).toBe(730);
        expect(FUNDED_HORIZON_UI_MAX_DAYS).toBeLessThan(
            CALCULATOR_SCALAR_BOUNDS.fundedDays.max,
        );
    });

    it('caps a typed horizon at the UI max', () => {
        expect(dispatchedHorizon(3650)).toBe(FUNDED_HORIZON_UI_MAX_DAYS);
        expect(dispatchedHorizon(FUNDED_HORIZON_UI_MAX_DAYS + 1)).toBe(
            FUNDED_HORIZON_UI_MAX_DAYS,
        );
    });

    it('passes a horizon within the UI max through unchanged', () => {
        expect(dispatchedHorizon(1)).toBe(1);
        expect(dispatchedHorizon(365)).toBe(365);
        expect(dispatchedHorizon(FUNDED_HORIZON_UI_MAX_DAYS)).toBe(
            FUNDED_HORIZON_UI_MAX_DAYS,
        );
    });

    it('leaves a non-numeric entry to the reducer fallback', () => {
        expect(dispatchedHorizon(NaN)).toBeNaN();
    });
});
