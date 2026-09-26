import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    type CalculatorAction,
    CalculatorActionType,
    calculatorReducer,
    defaultCalculatorState,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    type CalculatorState,
    type LabLinkOutcome,
    LabLinkStatus,
    type LabScenario,
    LinkParameter,
} from '~/app/(app)/prop-calculator/_components/types';
import {
    decodeState,
    encodeState,
} from '~/app/(app)/prop-calculator/_components/urlState';
import { initialStateFromSearch } from '~/app/(app)/prop-calculator/_components/useCalculator';
import {
    ApexVariant,
    CorrelationMode,
    DayStopRuleKind,
    FirmId,
    PolicySizing,
    serializePlanId,
} from '~/lib/prop-calculator';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';
import { MAX_LAB_SCENARIOS } from '~/lib/schemas/url';

const decodeFailure = vi.hoisted(() => ({ isThrowing: false }));

vi.mock(
    import('~/app/(app)/prop-calculator/_components/urlState'),
    async (importOriginal) => {
        const actual = await importOriginal();
        return {
            ...actual,
            decodeState: (
                ...arguments_: Parameters<typeof actual.decodeState>
            ) => {
                if (decodeFailure.isThrowing) throw new Error('decode failed');
                return actual.decodeState(...arguments_);
            },
        };
    },
);

const REJECTED: LabLinkOutcome = {
    issue: 'scenario 1: win rate must be between 5% and 95%',
    status: LabLinkStatus.Rejected,
};

const sharedScenario: LabScenario = {
    accounts: 3,
    correlation: CorrelationMode.Grouped,
    dayStop: { kind: DayStopRuleKind.None },
    groups: 2,
    id: 'shared',
    instrument: null,
    label: 'Shared',
    riskPerTrade: 300,
    rrRatio: 2,
    stopPoints: null,
    tradesPerDay: 2,
    winrate: 0.45,
};

function apexEod() {
    const firm = ALL_FIRMS.find((f) => f.id === FirmId.Apex);
    if (!firm) throw new Error('Apex firm not registered');
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (!plan) throw new Error('Apex EOD 50K plan not found');
    return { firm, plan };
}

function labParameter(payload: unknown): string {
    return btoa(JSON.stringify(payload))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/, '');
}

function rejectedState(): CalculatorState {
    return { ...defaultCalculatorState(), labLink: REJECTED };
}

function sharedLink(payload: unknown): URLSearchParams {
    const parameters = encodeState(defaultCalculatorState());
    parameters.set('lab', labParameter(payload));
    return parameters;
}

afterEach(() => {
    decodeFailure.isThrowing = false;
});

describe('CalculatorState carries the shared lab link outcome (PT-53f)', () => {
    it('starts with no lab link', () => {
        expect(defaultCalculatorState().labLink).toEqual({
            status: LabLinkStatus.Absent,
        });
    });

    it.each<[string, (state: CalculatorState) => CalculatorAction]>([
        [
            'adds a scenario',
            () => ({ type: CalculatorActionType.AddLabScenario }),
        ],
        [
            'updates a scenario',
            (state) => ({
                id: state.labScenarios[0]?.id ?? '',
                patch: { winrate: 0.5 },
                type: CalculatorActionType.UpdateLabScenario,
            }),
        ],
        [
            'removes a scenario',
            (state) => ({
                id: state.labScenarios[0]?.id ?? '',
                type: CalculatorActionType.RemoveLabScenario,
            }),
        ],
        [
            'resets the scenarios',
            () => ({ type: CalculatorActionType.ResetLabScenarios }),
        ],
        [
            'replaces the scenarios',
            () => ({
                entries: [sharedScenario],
                type: CalculatorActionType.SetLabScenarios,
            }),
        ],
        ['resets the calculator', () => ({ type: CalculatorActionType.Reset })],
    ])('clears a rejected lab link when the user %s', (_name, action) => {
        const state = rejectedState();
        expect(calculatorReducer(state, action(state)).labLink).toEqual({
            status: LabLinkStatus.Absent,
        });
    });

    it('adds no scenario past the most a link may carry', () => {
        const full: CalculatorState = {
            ...defaultCalculatorState(),
            labScenarios: Array.from(
                { length: MAX_LAB_SCENARIOS },
                (_, index) => ({ ...sharedScenario, id: String(index) }),
            ),
        };
        const next = calculatorReducer(full, {
            type: CalculatorActionType.AddLabScenario,
        });
        expect(next.labScenarios).toHaveLength(MAX_LAB_SCENARIOS);
    });

    it('keeps a rejected lab link while the user edits inputs outside the lab', () => {
        const next = calculatorReducer(rejectedState(), {
            type: CalculatorActionType.SetWinrate,
            value: 0.5,
        });
        expect(next.labLink).toEqual(REJECTED);
    });

    it('keeps the lab link of an applied state', () => {
        const next = calculatorReducer(defaultCalculatorState(), {
            state: rejectedState(),
            type: CalculatorActionType.ApplyState,
        });
        expect(next.labLink).toEqual(REJECTED);
    });

    it('decodeState keeps a rejection and its plain-language reason', () => {
        const state = decodeState(
            sharedLink([{ ...sharedScenario, winrate: 2 }]),
            ALL_FIRMS,
            defaultCalculatorState(),
        );
        expect(state.labLink).toEqual(REJECTED);
    });

    it('decodeState marks accepted and absent lab parameters', () => {
        expect(
            decodeState(
                sharedLink([sharedScenario]),
                ALL_FIRMS,
                rejectedState(),
            ).labLink,
        ).toEqual({ status: LabLinkStatus.Accepted });
        const parameters = encodeState(defaultCalculatorState());
        parameters.delete('lab');
        expect(
            decodeState(parameters, ALL_FIRMS, rejectedState()).labLink,
        ).toEqual({ status: LabLinkStatus.Absent });
    });

    it('encodeState never writes the lab link outcome', () => {
        const rejected = rejectedState();
        const encoded = encodeState(rejected);
        expect(encoded.toString()).toBe(
            encodeState({
                ...rejected,
                labLink: { status: LabLinkStatus.Absent },
            }).toString(),
        );
        expect(encoded.toString()).not.toContain(LabLinkStatus.Rejected);
    });
});

describe('initialStateFromSearch keeps the shared lab link outcome (PT-53f)', () => {
    it('rejects an invalid lab-only link and keeps the default scenarios', () => {
        const state = initialStateFromSearch(
            new URLSearchParams({
                lab: labParameter([{ ...sharedScenario, winrate: 2 }]),
            }).toString(),
        );
        expect(state.labLink).toEqual(REJECTED);
        expect(state.labScenarios.map((scenario) => scenario.label)).toEqual(
            defaultCalculatorState().labScenarios.map(
                (scenario) => scenario.label,
            ),
        );
    });

    it('applies the scenarios of a valid lab-only link', () => {
        const state = initialStateFromSearch(
            new URLSearchParams({
                lab: labParameter([sharedScenario]),
            }).toString(),
        );
        expect(state.labLink).toEqual({ status: LabLinkStatus.Accepted });
        expect(state.labScenarios).toEqual([sharedScenario]);
    });

    it('reports a link without firm or lab as absent', () => {
        expect(initialStateFromSearch('').labLink).toEqual({
            status: LabLinkStatus.Absent,
        });
    });

    it('keeps the lab outcome when the rest of the link cannot be decoded', () => {
        decodeFailure.isThrowing = true;
        const state = initialStateFromSearch(
            sharedLink([{ ...sharedScenario, winrate: 2 }]).toString(),
        );
        expect(state.labLink).toEqual(REJECTED);
        expect(state.firm).toBe(defaultCalculatorState().firm);
    });

    it('applies valid lab scenarios when the rest of the link cannot be decoded', () => {
        decodeFailure.isThrowing = true;
        const state = initialStateFromSearch(
            sharedLink([sharedScenario]).toString(),
        );
        expect(state.labLink).toEqual({ status: LabLinkStatus.Accepted });
        expect(state.labScenarios).toEqual([sharedScenario]);
    });
});

describe('a lab-only link reports its other parameters too (PT-53h)', () => {
    it('reports an unreadable day stop parameter on a link with no firm', () => {
        const state = initialStateFromSearch(
            new URLSearchParams({
                ds: 'not-json!',
                lab: labParameter([sharedScenario]),
            }).toString(),
        );
        expect(state.linkParameters[LinkParameter.DayStop]).toEqual({
            issue: 'the day stop rule parameter is not readable base64 JSON',
            status: LabLinkStatus.Rejected,
        });
        expect(state.labLink).toEqual({ status: LabLinkStatus.Accepted });
        expect(state.labScenarios).toEqual([sharedScenario]);
    });

    it('reports an unreadable eval ladder parameter on a link with no firm', () => {
        const state = initialStateFromSearch(
            new URLSearchParams({ dp: 'not-json!' }).toString(),
        );
        expect(state.linkParameters[LinkParameter.EvalDayPolicy]).toEqual({
            issue: 'the eval ladder parameter is not readable base64 JSON',
            status: LabLinkStatus.Rejected,
        });
    });

    it('reports an unreadable portfolio parameter on a link with no firm', () => {
        const state = initialStateFromSearch(
            new URLSearchParams({ pf: 'not-json!' }).toString(),
        );
        expect(state.linkParameters[LinkParameter.Portfolio]).toEqual({
            issue: 'the portfolio parameter is not readable base64 JSON',
            status: LabLinkStatus.Rejected,
        });
    });

    it('accepts a valid day stop parameter on a link with no firm', () => {
        const state = initialStateFromSearch(
            new URLSearchParams({
                ds: labParameter({ k: 2, kind: DayStopRuleKind.AfterKLosses }),
            }).toString(),
        );
        expect(state.linkParameters[LinkParameter.DayStop]).toEqual({
            status: LabLinkStatus.Accepted,
        });
        expect(state.dayStop).toEqual({
            k: 2,
            kind: DayStopRuleKind.AfterKLosses,
        });
    });

    it('keeps every other input at its default when only a link parameter is present', () => {
        const state = initialStateFromSearch(
            new URLSearchParams({ ds: 'not-json!' }).toString(),
        );
        const defaults = defaultCalculatorState();
        expect(state.firm).toBe(defaults.firm);
        expect(state.plan).toBe(defaults.plan);
        expect(state.winrate).toBe(defaults.winrate);
        expect(state.riskDollars).toBe(defaults.riskDollars);
    });

    it.each<[LinkParameter, () => URLSearchParams, (state: CalculatorState) => unknown]>(
        [
            [
                LinkParameter.DayStop,
                () =>
                    new URLSearchParams({
                        ds: labParameter({
                            k: 2,
                            kind: DayStopRuleKind.AfterKLosses,
                        }),
                    }),
                (state) => state.dayStop,
            ],
            [
                LinkParameter.EvalDayPolicy,
                () =>
                    new URLSearchParams({
                        dp: labParameter({
                            ladder: [1],
                            maxLossesPerDay: null,
                            sizing: PolicySizing.ContractCapped,
                            stopRule: { kind: DayStopRuleKind.None },
                        }),
                    }),
                (state) => state.evalDayPolicy,
            ],
            [
                LinkParameter.Portfolio,
                () => {
                    const { firm, plan } = apexEod();
                    return new URLSearchParams({
                        pf: labParameter([
                            {
                                activationDiscountPercent: 0,
                                count: 1,
                                evalDiscountPercent: 0,
                                firmId: firm.id,
                                id: 'entry-1',
                                instrument: null,
                                linkActivationDiscount: false,
                                monthlySubscriptionDiscountPercent: 0,
                                planId: serializePlanId(plan.id),
                                resetDiscountPercent: 0,
                                stopPoints: null,
                            },
                        ]),
                    });
                },
                (state) => state.portfolio,
            ],
        ],
    )(
        'carries every LinkParameter enum member through to its CalculatorState field on a link with no firm (%s)',
        (parameter, buildParameters, readField) => {
            const state = initialStateFromSearch(buildParameters().toString());
            expect(state.linkParameters[parameter]).toEqual({
                status: LabLinkStatus.Accepted,
            });
            expect(readField(state)).not.toEqual(
                readField(defaultCalculatorState()),
            );
        },
    );

    it('degrades to defaults for every link parameter, without crashing, when even the lab-only decode throws', () => {
        decodeFailure.isThrowing = true;
        const state = initialStateFromSearch(
            new URLSearchParams({
                ds: 'not-json!',
                lab: labParameter([sharedScenario]),
            }).toString(),
        );
        expect(state.labLink).toEqual({ status: LabLinkStatus.Accepted });
        expect(state.labScenarios).toEqual([sharedScenario]);
        expect(state.linkParameters[LinkParameter.DayStop]).toEqual({
            status: LabLinkStatus.Absent,
        });
        expect(state.dayStop).toEqual(defaultCalculatorState().dayStop);
    });
});
