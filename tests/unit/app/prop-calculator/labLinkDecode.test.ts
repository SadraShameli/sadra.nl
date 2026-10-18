import { describe, expect, it } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    LabLinkStatus,
    type LabScenario,
} from '~/app/(app)/prop-calculator/_components/types';
import {
    decodeLabLink,
    decodeState,
    encodeState,
    type LabLinkDecode,
} from '~/app/(app)/prop-calculator/_components/urlState';
import { CorrelationMode, DayStopRuleKind } from '~/lib/prop-calculator';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

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

function labParameter(payload: unknown): string {
    return btoa(JSON.stringify(payload))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/, '');
}

function rejectionIssue(decoded: LabLinkDecode): string | undefined {
    return decoded.status === LabLinkStatus.Rejected
        ? decoded.issue
        : undefined;
}

function sharedLink(lab: string): URLSearchParams {
    const parameters = encodeState(defaultCalculatorState());
    parameters.set('lab', lab);
    return parameters;
}

describe('decodeLabLink says whether a shared link carried lab scenarios and whether they were rejected', () => {
    const fallback = defaultCalculatorState().labScenarios;

    it('accepts scenarios that pass the lab scenario schema', () => {
        const decoded = decodeLabLink(
            sharedLink(labParameter([sharedScenario])),
            fallback,
        );
        expect(decoded.status).toBe(LabLinkStatus.Accepted);
        expect(decoded.scenarios).toEqual([sharedScenario]);
    });

    it('accepts the most scenarios the lab holds', () => {
        const scenarios = Array.from({ length: 20 }, (_, index) => ({
            ...sharedScenario,
            id: String(index),
        }));
        const decoded = decodeLabLink(
            sharedLink(labParameter(scenarios)),
            fallback,
        );
        expect(decoded.status).toBe(LabLinkStatus.Accepted);
        expect(decoded.scenarios).toEqual(scenarios);
    });

    it('reports a link without a lab parameter as absent and keeps the fallback', () => {
        const parameters = encodeState(defaultCalculatorState());
        parameters.delete('lab');
        const decoded = decodeLabLink(parameters, fallback);
        expect(decoded.status).toBe(LabLinkStatus.Absent);
        expect(decoded.scenarios).toBe(fallback);
    });

    it.each([
        [
            'a win rate above the bound',
            [{ ...sharedScenario, winrate: 1.5 }],
            'scenario 1: win rate must be between 5% and 95%',
        ],
        [
            'zero risk per trade',
            [{ ...sharedScenario, riskPerTrade: 0 }],
            'scenario 1: risk per trade must be between $1 and $1,000,000',
        ],
        [
            'a risk per trade below one dollar',
            [{ ...sharedScenario, riskPerTrade: 0.5 }],
            'scenario 1: risk per trade must be between $1 and $1,000,000',
        ],
        [
            'a risk per trade above the ceiling',
            [{ ...sharedScenario, riskPerTrade: 1_000_001 }],
            'scenario 1: risk per trade must be between $1 and $1,000,000',
        ],
        [
            'more groups than accounts',
            [{ ...sharedScenario, accounts: 1, groups: 2 }],
            'scenario 1: groups must be a whole number from 1 up to the number of accounts',
        ],
        [
            'trades per day above the bound in the second scenario',
            [sharedScenario, { ...sharedScenario, tradesPerDay: 51 }],
            'scenario 2: trades per day must be a whole number from 1 to 50',
        ],
        [
            'a reward to risk below the bound',
            [{ ...sharedScenario, rrRatio: 0.1 }],
            'scenario 1: reward to risk must be between 0.5 and 10',
        ],
        [
            'a fractional account count',
            [{ ...sharedScenario, accounts: 2.5 }],
            'scenario 1: accounts must be a whole number from 1 to 20',
        ],
        [
            'more accounts than the lab editor allows',
            [{ ...sharedScenario, accounts: 21 }],
            'scenario 1: accounts must be a whole number from 1 to 20',
        ],
        [
            'a million accounts',
            [{ ...sharedScenario, accounts: 1_000_000 }],
            'scenario 1: accounts must be a whole number from 1 to 20',
        ],
        [
            'an empty scenario list',
            [],
            'the lab parameter must hold 1 to 20 scenarios',
        ],
        [
            'more scenarios than the lab holds',
            Array.from({ length: 21 }, (_, index) => ({
                ...sharedScenario,
                id: String(index),
            })),
            'the lab parameter must hold 1 to 20 scenarios',
        ],
        [
            'an unknown instrument',
            [{ ...sharedScenario, instrument: 'XYZ', stopPoints: 8 }],
            'scenario 1: instrument must be empty or one of ES, MNQ, NQ',
        ],
        [
            'a stop above the bound',
            [{ ...sharedScenario, instrument: 'MNQ', stopPoints: 20_000 }],
            'scenario 1: stop points must be empty or between 0.25 and 10,000 points',
        ],
        [
            'an unknown account mode',
            [{ ...sharedScenario, correlation: 'mirrored' }],
            'scenario 1: account mode is not one the lab knows',
        ],
        [
            'an unknown day-stop rule',
            [{ ...sharedScenario, dayStop: { kind: 'never' } }],
            'scenario 1: day-stop rule is not one the lab knows',
        ],
        [
            'a missing name',
            [{ ...sharedScenario, label: undefined }],
            'scenario 1: name must be text',
        ],
        [
            'a scenario that is not an object',
            [sharedScenario, 7],
            'scenario 2 is not a lab scenario',
        ],
        [
            'a non-array payload',
            { scenarios: [sharedScenario] },
            'the lab parameter is not a list of scenarios',
        ],
    ])(
        'rejects %s, keeps the fallback and names the first failing field in plain words',
        (_name, payload, issue) => {
            const decoded = decodeLabLink(
                sharedLink(labParameter(payload)),
                fallback,
            );
            expect(decoded.status).toBe(LabLinkStatus.Rejected);
            expect(decoded.scenarios).toBe(fallback);
            expect(rejectionIssue(decoded)).toBe(issue);
        },
    );

    it.each([
        ['text that is not base64 JSON', 'not-json!'],
        ['truncated base64', labParameter([sharedScenario]).slice(0, 25)],
    ])('rejects %s and says the parameter could not be read', (_name, lab) => {
        const decoded = decodeLabLink(sharedLink(lab), fallback);
        expect(decoded.status).toBe(LabLinkStatus.Rejected);
        expect(decoded.scenarios).toBe(fallback);
        expect(rejectionIssue(decoded)).toBe(
            'the lab parameter is not readable base64 JSON',
        );
    });

    it('decodeState uses the same decode, so a rejected link keeps the fallback scenarios', () => {
        const fallbackState = defaultCalculatorState();
        const rejected = decodeState(
            sharedLink(labParameter([{ ...sharedScenario, winrate: 2 }])),
            ALL_FIRMS,
            fallbackState,
        );
        expect(rejected.labScenarios).toEqual(fallbackState.labScenarios);
        const accepted = decodeState(
            sharedLink(labParameter([sharedScenario])),
            ALL_FIRMS,
            fallbackState,
        );
        expect(accepted.labScenarios).toEqual([sharedScenario]);
    });
});
