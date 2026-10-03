import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { LabLinkStatus } from '~/app/(app)/prop-calculator/_components/types';
import { encodeState } from '~/app/(app)/prop-calculator/_components/urlState';
import { initialStateFromSearch } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { CorrelationMode, DayStopRuleKind } from '~/lib/prop-calculator';

const SHARED_SCENARIO = {
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

function throwingDecoder() {
    return vi.fn(() => {
        throw new Error('decode failed');
    });
}

describe('initialStateFromSearch takes the decoder, so no test replaces the urlState module (PT-63c)', () => {
    it('falls back to the shared lab when the injected decoder throws on a link with a firm', () => {
        const decode = throwingDecoder();
        const parameters = encodeState(defaultCalculatorState());
        parameters.set('lab', labParameter([SHARED_SCENARIO]));
        const state = initialStateFromSearch(parameters.toString(), decode);
        expect(decode).toHaveBeenCalledTimes(1);
        expect(state.labLink).toStrictEqual({ status: LabLinkStatus.Accepted });
        expect(state.labScenarios).toStrictEqual([SHARED_SCENARIO]);
        expect(state.firm).toBe(defaultCalculatorState().firm);
    });

    it('uses the injected decoder for the link parameters of a link with no firm too', () => {
        const decode = throwingDecoder();
        const state = initialStateFromSearch(
            new URLSearchParams({
                lab: labParameter([SHARED_SCENARIO]),
            }).toString(),
            decode,
        );
        expect(decode).toHaveBeenCalledTimes(1);
        expect(state.labLink).toStrictEqual({ status: LabLinkStatus.Accepted });
    });

    it('decodes with the real decoder when none is injected', () => {
        const parameters = encodeState(defaultCalculatorState());
        expect(initialStateFromSearch(parameters.toString()).firm).toBe(
            defaultCalculatorState().firm,
        );
    });
});

describe('the lab link state tests leave the urlState module alone', () => {
    it('does not mock the urlState module, which a non-isolated worker would share with calculatorProviderState', () => {
        const source = readFileSync(
            path.join(
                process.cwd(),
                'tests/unit/app/prop-calculator/labLinkState.test.ts',
            ),
            'utf8',
        );
        expect(source).not.toMatch(/vi\.mock\(/);
    });
});
