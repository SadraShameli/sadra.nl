import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LightAssessment } from '~/lib/trading/analytics';

import { KpiStrip } from '~/app/(app)/trade-checklist/_components/analytics/KpiStrip';

import { MISSING_REASON_BUTTON_SELECTOR } from '../../prop-calculator/missingValue';
import {
    statStripCaption,
    statStripValue,
} from '../../prop-calculator/statStripValue';

function graded(
    id: string,
    outcome: LightAssessment['outcome'],
    outcomeR: null | number,
): LightAssessment {
    return {
        createdAt: '2026-09-10T14:00:00Z',
        grade: 'F',
        id,
        outcome,
        outcomeR,
        planId: 'plan',
        score: 20,
    };
}

describe('the checklist KPI strip', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    function render(assessments: LightAssessment[]): void {
        act(() => {
            root.render(<KpiStrip assessments={assessments} />);
        });
    }

    function missingReasonOf(label: string): null | string {
        const trigger = statStripValue(container, label)?.querySelector(
            MISSING_REASON_BUTTON_SELECTOR,
        );
        if (!(trigger instanceof HTMLButtonElement)) return null;
        act(() => {
            trigger.click();
        });
        const popoverId = trigger.getAttribute('aria-controls');
        return popoverId === null
            ? null
            : (document.querySelector(`#${CSS.escape(popoverId)}`)
                  ?.textContent ?? null);
    }

    it('counts a win recorded without an R value as an outcome, the same as the streak does', () => {
        render([graded('a', 'win', null)]);
        expect(statStripCaption(container, 'Trades graded')?.textContent).toBe(
            '1 outcome, 0 with R',
        );
        expect(statStripValue(container, 'Win rate')?.textContent).toBe('100%');
        expect(statStripCaption(container, 'Win rate')?.textContent).toBe(
            'n=1',
        );
        expect(statStripValue(container, 'Current streak')?.textContent).toBe(
            '1',
        );
    });

    it('says an R value is missing for the R figures when outcomes were recorded without one', () => {
        render(['a', 'b', 'c'].map((id) => graded(id, 'win', null)));
        expect(statStripCaption(container, 'Trades graded')?.textContent).toBe(
            '3 outcomes, 0 with R',
        );
        expect(missingReasonOf('Expectancy')).toContain('with an R value');
        expect(missingReasonOf('Cumulative R')).toContain('with an R value');
    });

    it('takes the win rate over every outcome and the R figures over the outcomes with R', () => {
        render([
            graded('a', 'win', 2),
            graded('b', 'loss', null),
            graded('c', 'no-trade', null),
            graded('d', null, null),
        ]);
        expect(statStripValue(container, 'Trades graded')?.textContent).toBe(
            '4',
        );
        expect(statStripCaption(container, 'Trades graded')?.textContent).toBe(
            '2 outcomes, 1 with R',
        );
        expect(statStripValue(container, 'Win rate')?.textContent).toBe('50%');
        expect(statStripCaption(container, 'Expectancy')?.textContent).toBe(
            'avg R over 1 outcome with R',
        );
        expect(statStripValue(container, 'Expectancy')?.textContent).toBe(
            '+2.00R',
        );
    });

    it('shows a value and its sign in the default ink, with no colour per sign', () => {
        render([graded('a', 'loss', -1), graded('b', 'loss', -1)]);
        for (const label of ['Cumulative R', 'Expectancy', 'Current streak']) {
            const value = statStripValue(container, label);
            expect(value?.textContent, label).toMatch(/^(-|2)/);
            expect(value?.getHTML(), label).not.toMatch(
                /success|destructive|warning|danger|camel/,
            );
        }
    });
});
