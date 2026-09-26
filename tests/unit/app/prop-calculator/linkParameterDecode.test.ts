import { describe, expect, it } from 'vitest';

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
    type PortfolioEntry,
} from '~/app/(app)/prop-calculator/_components/types';
import {
    decodeLabLink,
    decodeState,
    encodeState,
} from '~/app/(app)/prop-calculator/_components/urlState';
import {
    CorrelationMode,
    type DayPolicy,
    type DayStopRule,
    DayStopRuleKind,
    InstrumentSymbol,
    PolicySizing,
} from '~/lib/prop-calculator';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

const ABSENT: LabLinkOutcome = { status: LabLinkStatus.Absent };
const ACCEPTED: LabLinkOutcome = { status: LabLinkStatus.Accepted };

const sharedDayStop: DayStopRule = { k: 2, kind: DayStopRuleKind.AfterKLosses };

const sharedPolicy: DayPolicy = {
    ladder: [400, 600],
    maxLossesPerDay: null,
    sizing: PolicySizing.ContractCapped,
    stopRule: { kind: DayStopRuleKind.None },
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

function blob(payload: unknown): string {
    return btoa(JSON.stringify(payload))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/, '');
}

function decodeWithPortfolioPayload(payload: unknown): CalculatorState {
    const parameters = sharedLink({ pf: blob(payload) });
    return decodeState(parameters, ALL_FIRMS, defaultCalculatorState());
}

function decodeWithPortfolioWire(wire: unknown[]): CalculatorState {
    return decodeWithPortfolioPayload(wire);
}

function defaultEntry(): PortfolioEntry {
    const [entry] = defaultCalculatorState().portfolio;
    if (!entry) throw new Error('no default portfolio entry');
    return entry;
}

function portfolioWire(patch: Record<string, unknown>): unknown[] {
    return [
        {
            activationDiscountPercent: 0,
            count: 2,
            evalDiscountPercent: 10,
            firmId: 'apex',
            id: 'wire-1',
            instrument: null,
            linkActivationDiscount: false,
            monthlySubscriptionDiscountPercent: 0,
            planId: 'apex-50000-eod',
            resetDiscountPercent: 0,
            stopPoints: null,
        },
        {
            activationDiscountPercent: 0,
            count: 1,
            evalDiscountPercent: 0,
            firmId: 'apex',
            id: 'wire-2',
            instrument: null,
            linkActivationDiscount: false,
            monthlySubscriptionDiscountPercent: 0,
            planId: 'apex-50000-eod',
            resetDiscountPercent: 0,
            stopPoints: null,
            ...patch,
        },
    ];
}

function rejection(state: CalculatorState, parameter: LinkParameter): string {
    const outcome = state.linkParameters[parameter];
    return outcome.status === LabLinkStatus.Rejected ? outcome.issue : '';
}

function sharedLink(entries: Record<string, string>): URLSearchParams {
    const parameters = encodeState(defaultCalculatorState());
    for (const [key, value] of Object.entries(entries))
        parameters.set(key, value);
    return parameters;
}

function withRejections(): CalculatorState {
    const rejected: LabLinkOutcome = {
        issue: 'refused',
        status: LabLinkStatus.Rejected,
    };
    return {
        ...defaultCalculatorState(),
        linkParameters: {
            [LinkParameter.DayStop]: rejected,
            [LinkParameter.EvalDayPolicy]: rejected,
            [LinkParameter.Portfolio]: rejected,
        },
    };
}

describe('decodeState refuses a shared portfolio entry it cannot use, with a reason, instead of keeping it with a null field (PT-53g)', () => {
    it.each<[string, Record<string, unknown>, string]>([
        [
            'an unknown instrument',
            { instrument: 'XYZ', stopPoints: 10 },
            'portfolio entry 2: instrument must be empty or one of ES, MNQ, NQ',
        ],
        [
            'stop points of zero',
            { instrument: InstrumentSymbol.NQ, stopPoints: 0 },
            'portfolio entry 2: stop points must be empty or between 0.25 and 10,000 points',
        ],
        [
            'stop points above the bound',
            { instrument: InstrumentSymbol.NQ, stopPoints: 10_001 },
            'portfolio entry 2: stop points must be empty or between 0.25 and 10,000 points',
        ],
        [
            'a negative monthly subscription discount',
            { monthlySubscriptionDiscountPercent: -10 },
            'portfolio entry 2: monthly subscription discount must be between 0% and 100%',
        ],
        [
            'a non-numeric reset discount',
            { resetDiscountPercent: 'half' },
            'portfolio entry 2: reset fee discount must be between 0% and 100%',
        ],
        [
            'a negative eval discount',
            { evalDiscountPercent: -1 },
            'portfolio entry 2: eval fee discount must be between 0% and 100%',
        ],
        [
            'an activation discount over 100%',
            { activationDiscountPercent: 150 },
            'portfolio entry 2: activation fee discount must be between 0% and 100%',
        ],
        [
            'an instrument without stop points',
            { instrument: InstrumentSymbol.NQ, stopPoints: null },
            'portfolio entry 2: instrument and stop points must both be set or both be empty',
        ],
        [
            'stop points without an instrument',
            { instrument: null, stopPoints: 10 },
            'portfolio entry 2: instrument and stop points must both be set or both be empty',
        ],
        [
            'a firm the calculator does not know',
            { firmId: 'not-a-firm' },
            'portfolio entry 2: firm is not one the calculator knows',
        ],
        [
            'a plan the firm does not offer',
            { planId: 'apex-50000-nope' },
            'portfolio entry 2: plan is not one Apex Trader Funding offers',
        ],
    ])(
        'refuses a portfolio with %s and keeps the current portfolio',
        (_name, patch, issue) => {
            const state = decodeWithPortfolioWire(portfolioWire(patch));
            expect(state.portfolio).toEqual([defaultEntry()]);
            expect(state.linkParameters[LinkParameter.Portfolio]).toEqual({
                issue,
                status: LabLinkStatus.Rejected,
            });
        },
    );

    it('refuses a portfolio parameter that is not a list, and one that is not readable', () => {
        const notAList = decodeWithPortfolioPayload({ entries: [] });
        expect(rejection(notAList, LinkParameter.Portfolio)).toBe(
            'the portfolio parameter is not a list of portfolio entries',
        );
        const unreadable = decodeState(
            sharedLink({ pf: 'not-json!' }),
            ALL_FIRMS,
            defaultCalculatorState(),
        );
        expect(rejection(unreadable, LinkParameter.Portfolio)).toBe(
            'the portfolio parameter is not readable base64 JSON',
        );
    });

    it('applies a valid shared portfolio and marks it accepted', () => {
        const state = decodeWithPortfolioWire(
            portfolioWire({ instrument: InstrumentSymbol.NQ, stopPoints: 10 }),
        );
        expect(state.linkParameters[LinkParameter.Portfolio]).toEqual(
            ACCEPTED,
        );
        expect(state.portfolio.map((entry) => entry.id)).toEqual([
            'wire-1',
            'wire-2',
        ]);
        expect(state.portfolio[1]?.instrument).toBe(InstrumentSymbol.NQ);
        expect(state.portfolio[1]?.stopPoints).toBe(10);
    });

    it('still loads a portfolio saved before the per-entry discounts and sizing existed', () => {
        const keptFields = [
            'activationDiscountPercent',
            'count',
            'evalDiscountPercent',
            'firmId',
            'id',
            'linkActivationDiscount',
            'planId',
        ];
        const legacy = portfolioWire({}).map((entry) => {
            const source = entry as Record<string, unknown>;
            return Object.fromEntries(
                keptFields.map((field) => [field, source[field]]),
            );
        });
        const state = decodeWithPortfolioWire(legacy);
        expect(state.linkParameters[LinkParameter.Portfolio]).toEqual(
            ACCEPTED,
        );
        expect(state.portfolio[1]).toMatchObject({
            instrument: null,
            monthlySubscriptionDiscountPercent: 0,
            resetDiscountPercent: 0,
            stopPoints: null,
        });
    });
});

describe('a shared lab scenario sets its instrument and stop points together (PT-53g)', () => {
    it.each<[string, Partial<LabScenario>]>([
        [
            'an instrument without stop points',
            { instrument: InstrumentSymbol.MNQ, stopPoints: null },
        ],
        ['stop points without an instrument', { instrument: null, stopPoints: 8 }],
    ])('refuses a scenario with %s in plain words', (_name, patch) => {
        const decoded = decodeLabLink(
            sharedLink({ lab: blob([sharedScenario, { ...sharedScenario, ...patch }]) }),
            [],
        );
        expect(decoded).toEqual({
            issue: 'scenario 2: instrument and stop points must both be set or both be empty',
            scenarios: [],
            status: LabLinkStatus.Rejected,
        });
    });
});

describe('decodeState reports an unreadable ds, dp or pf parameter instead of dropping it (PT-53g)', () => {
    it.each<[string, LinkParameter, string, string]>([
        [
            'day stop',
            LinkParameter.DayStop,
            'not-json!',
            'the day stop rule parameter is not readable base64 JSON',
        ],
        [
            'day stop',
            LinkParameter.DayStop,
            blob({ k: 0, kind: DayStopRuleKind.AfterKLosses }),
            'the day stop rule is not one the calculator knows',
        ],
        [
            'eval ladder',
            LinkParameter.EvalDayPolicy,
            'not-json!',
            'the eval ladder parameter is not readable base64 JSON',
        ],
        [
            'eval ladder',
            LinkParameter.EvalDayPolicy,
            blob({ ...sharedPolicy, ladder: [0, 400] }),
            'the eval ladder is not one the calculator can use',
        ],
        [
            'portfolio',
            LinkParameter.Portfolio,
            'not-json!',
            'the portfolio parameter is not readable base64 JSON',
        ],
    ])(
        'reports a bad %s parameter and still loads the rest of the link',
        (_name, parameter, raw, issue) => {
            const parameters = sharedLink({ [parameter]: raw, wr: '0.55' });
            const current = defaultCalculatorState();
            const state = decodeState(parameters, ALL_FIRMS, current);
            expect(state.linkParameters[parameter]).toEqual({
                issue,
                status: LabLinkStatus.Rejected,
            });
            expect(state.winrate).toBe(0.55);
            expect(state.dayStop).toEqual(current.dayStop);
            expect(state.evalDayPolicy).toEqual(current.evalDayPolicy);
            expect(state.portfolio).toEqual(current.portfolio);
        },
    );

    it('applies and accepts valid ds, dp and pf parameters', () => {
        const pfWire = portfolioWire({});
        const parameters = sharedLink({
            dp: blob(sharedPolicy),
            ds: blob(sharedDayStop),
            pf: blob(pfWire),
        });
        const state = decodeState(parameters, ALL_FIRMS, defaultCalculatorState());
        expect(state.dayStop).toEqual(sharedDayStop);
        expect(state.evalDayPolicy).toEqual(sharedPolicy);
        expect(state.linkParameters).toEqual({
            [LinkParameter.DayStop]: ACCEPTED,
            [LinkParameter.EvalDayPolicy]: ACCEPTED,
            [LinkParameter.Portfolio]: ACCEPTED,
        });
    });

    it('marks ds, dp and pf absent when the link has none, even over an earlier rejection', () => {
        const parameters = encodeState(defaultCalculatorState());
        parameters.delete(LinkParameter.Portfolio);
        expect(
            decodeState(parameters, ALL_FIRMS, withRejections())
                .linkParameters,
        ).toEqual({
            [LinkParameter.DayStop]: ABSENT,
            [LinkParameter.EvalDayPolicy]: ABSENT,
            [LinkParameter.Portfolio]: ABSENT,
        });
    });

    it('keeps the current day stop of a saved scenario whose ds is refused, and says so', () => {
        const current: CalculatorState = {
            ...defaultCalculatorState(),
            dayStop: sharedDayStop,
        };
        const saved = sharedLink({ ds: blob({ kind: 'after-lunch' }) });
        const loaded = calculatorReducer(current, {
            state: decodeState(saved, ALL_FIRMS, current),
            type: CalculatorActionType.ApplyState,
        });
        expect(loaded.dayStop).toEqual(sharedDayStop);
        expect(rejection(loaded, LinkParameter.DayStop)).toBe(
            'the day stop rule is not one the calculator knows',
        );
    });

    it('encodeState never writes the outcomes', () => {
        const rejected = withRejections();
        expect(encodeState(rejected).toString()).toBe(
            encodeState({
                ...rejected,
                linkParameters: defaultCalculatorState().linkParameters,
            }).toString(),
        );
    });
});

describe('the reducer clears a refused link parameter once the user sets it (PT-53g)', () => {
    it('starts with every link parameter absent', () => {
        expect(defaultCalculatorState().linkParameters).toEqual({
            [LinkParameter.DayStop]: ABSENT,
            [LinkParameter.EvalDayPolicy]: ABSENT,
            [LinkParameter.Portfolio]: ABSENT,
        });
    });

    it.each<[LinkParameter, CalculatorAction]>([
        [
            LinkParameter.DayStop,
            { rule: sharedDayStop, type: CalculatorActionType.SetDayStop },
        ],
        [
            LinkParameter.EvalDayPolicy,
            { policy: null, type: CalculatorActionType.SetEvalDayPolicy },
        ],
        [
            LinkParameter.Portfolio,
            { entries: [], type: CalculatorActionType.SetPortfolio },
        ],
    ])('clears only the %s outcome when the user sets it', (parameter, action) => {
        const next = calculatorReducer(withRejections(), action);
        expect(next.linkParameters[parameter]).toEqual(ABSENT);
        const others = Object.values(LinkParameter).filter(
            (key) => key !== parameter,
        );
        for (const other of others)
            expect(next.linkParameters[other].status).toBe(
                LabLinkStatus.Rejected,
            );
    });

    it('clears every outcome when the user resets the calculator', () => {
        expect(
            calculatorReducer(withRejections(), {
                type: CalculatorActionType.Reset,
            }).linkParameters,
        ).toEqual(defaultCalculatorState().linkParameters);
    });

    it('keeps the outcomes while the user edits unrelated inputs', () => {
        const next = calculatorReducer(withRejections(), {
            type: CalculatorActionType.SetWinrate,
            value: 0.5,
        });
        expect(next.linkParameters).toEqual(withRejections().linkParameters);
    });
});
