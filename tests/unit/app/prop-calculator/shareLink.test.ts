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
import { encodeState } from '~/app/(app)/prop-calculator/_components/urlState';

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
        );
        expect(link).not.toContain('#');
        expect(link.split('?')).toHaveLength(2);
        expect(new URL(link).searchParams.get('wr')).toBe('0.400');
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
