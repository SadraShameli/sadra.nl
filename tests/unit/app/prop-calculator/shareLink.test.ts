import { describe, expect, it } from 'vitest';

import {
    CalculatorActionType,
    calculatorReducer,
    defaultCalculatorState,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    buildShareLink,
    shareLinkForQuery,
} from '~/app/(app)/prop-calculator/_components/shareLink';
import {
    encodeState,
    type EncodeStateOptions,
    ObjectiveUrlMode,
} from '~/app/(app)/prop-calculator/_components/urlState';
import { SizingObjective } from '~/lib/prop-calculator/advisor';
import { OBJECTIVE_URL_PARAMETER } from '~/lib/schemas/url';

describe('buildShareLink', () => {
    it('is origin plus pathname plus the encoded state', () => {
        const state = calculatorReducer(defaultCalculatorState(), {
            type: CalculatorActionType.SetWinrate,
            value: 0.44,
        });
        expect(
            buildShareLink(
                'https://sadra.nl',
                '/prop-calculator/analysis',
                state,
                {},
            ),
        ).toBe(
            `https://sadra.nl/prop-calculator/analysis?${encodeState(state).toString()}`,
        );
    });

    it('never carries a fragment or a stale query from the page', () => {
        const state = defaultCalculatorState();
        const link = buildShareLink(
            'https://sadra.nl',
            '/prop-calculator',
            state,
            {},
        );
        expect(link).not.toContain('#');
        expect(link.split('?')).toHaveLength(2);
        expect(new URL(link).searchParams.get('wr')).toBe('0.400');
    });
});

function objectiveOf(
    objective: SizingObjective,
    options: EncodeStateOptions = {},
): null | string {
    const state = { ...defaultCalculatorState(), objective };
    return new URL(
        buildShareLink(
            'https://sadra.nl',
            '/prop-calculator/sizing',
            state,
            options,
        ),
    ).searchParams.get(OBJECTIVE_URL_PARAMETER);
}

describe('buildShareLink objective (PT-63d, F-V15)', () => {
    it('writes a deliberately chosen MonthlyNet, so the recipient and a reload keep it', () => {
        expect(
            objectiveOf(SizingObjective.MonthlyNet, {
                objectiveUrl: ObjectiveUrlMode.Explicit,
            }),
        ).toBe(SizingObjective.MonthlyNet);
    });

    it('leaves out an objective the bankroll chose automatically, so the link chooses again for its reader', () => {
        expect(
            objectiveOf(SizingObjective.RuinFirst, {
                objectiveUrl: ObjectiveUrlMode.Omitted,
            }),
        ).toBeNull();
    });

    it('writes only a non-default objective when nothing says it was chosen', () => {
        expect(objectiveOf(SizingObjective.MonthlyNet)).toBeNull();
        expect(objectiveOf(SizingObjective.CycleCash)).toBe(
            SizingObjective.CycleCash,
        );
    });
});

describe('shareLinkForQuery', () => {
    it('joins a tool codec query onto the page', () => {
        expect(
            shareLinkForQuery(
                'https://sadra.nl',
                '/prop-calculator/position-size',
                'risk=450&instr=NQ',
            ),
        ).toBe(
            'https://sadra.nl/prop-calculator/position-size?risk=450&instr=NQ',
        );
    });

    it('drops the question mark for an empty query', () => {
        expect(shareLinkForQuery('https://sadra.nl', '/a', '')).toBe(
            'https://sadra.nl/a',
        );
        expect(shareLinkForQuery('https://sadra.nl', '/a', '?')).toBe(
            'https://sadra.nl/a',
        );
        expect(shareLinkForQuery('https://sadra.nl', '/a', '?x=1')).toBe(
            'https://sadra.nl/a?x=1',
        );
    });
});
