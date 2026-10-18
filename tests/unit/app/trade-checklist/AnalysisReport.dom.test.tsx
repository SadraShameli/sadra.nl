import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Recommendation, TradeAssessmentRow } from '~/lib/trading/types';

import { AnalysisReport } from '~/app/(app)/trade-checklist/_components/AnalysisReport';

import {
    statStripCaption,
    statStripLabels,
    statStripValue,
} from '../prop-calculator/statStripValue';
import { assessment } from './assessmentFixture';

vi.mock('~/lib/trading/actions', () => ({
    recordAssessmentOutcome: vi.fn(() => Promise.resolve()),
    saveAssessment: vi.fn(() => Promise.resolve({ id: 'saved' })),
}));
vi.mock('framer-motion', () => ({
    motion: {
        div: ({
            children,
            className,
        }: {
            children?: ReactNode;
            className?: string;
        }) => <div className={className}>{children}</div>,
    },
}));
vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

describe('the analysis report', () => {
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

    function render({
        evalDollars,
        history = [],
        recommendation,
        suggestedSizeMultiplier,
    }: {
        evalDollars: number;
        history?: TradeAssessmentRow[];
        recommendation: Recommendation;
        suggestedSizeMultiplier: number;
    }) {
        const row = assessment();
        act(() => {
            root.render(
                <AnalysisReport
                    answers={row.answers}
                    history={history}
                    onRestart={vi.fn()}
                    onSaved={vi.fn()}
                    plan={{
                        config: {
                            ...row.planSnapshot,
                            risk: { ...row.planSnapshot.risk, evalDollars },
                        },
                        id: 'plan',
                        name: 'Plan',
                    }}
                    result={{
                        ...row.result,
                        recommendation,
                        suggestedSizeMultiplier,
                    }}
                    savedId={null}
                />,
            );
        });
    }

    it('states the plan risk and the full size grouped in thousands', () => {
        render({
            evalDollars: 1500,
            recommendation: 'take',
            suggestedSizeMultiplier: 1,
        });
        expect(container.textContent).toContain('Risk on this account: $1,500');
        expect(container.textContent).toContain('Take this trade ($1,500).');
        expect(statStripValue(container, 'Recommended risk')?.textContent).toBe(
            '$1,500',
        );
    });

    it('keeps the cents of a plan risk that is not whole dollars and rounds the reduced size', () => {
        render({
            evalDollars: 187.5,
            recommendation: 'marginal',
            suggestedSizeMultiplier: 0.5,
        });
        expect(container.textContent).toContain(
            'Risk on this account: $187.50',
        );
        expect(container.textContent).toContain(
            'Marginal setup: consider reduced size ($94 vs $187.50 standard).',
        );
        expect(statStripValue(container, 'Recommended risk')?.textContent).toBe(
            '$94',
        );
    });

    it('shows the hindsight expectancy once, over the outcomes with R like the KPI strip', () => {
        render({
            evalDollars: 100,
            history: [
                assessment({ id: 'a', outcome: 'win', outcomeR: 2 }),
                assessment({ id: 'b', outcome: 'loss', outcomeR: -1 }),
                assessment({ id: 'c', outcome: 'win', outcomeR: null }),
            ],
            recommendation: 'take',
            suggestedSizeMultiplier: 1,
        });
        const labels = statStripLabels(container);
        expect(labels).not.toContain('Avg R');
        expect(labels.filter((label) => label === 'Expectancy')).toHaveLength(
            1,
        );
        expect(statStripValue(container, 'Expectancy')?.textContent).toBe(
            '+0.50R',
        );
        expect(statStripCaption(container, 'Expectancy')?.textContent).toBe(
            'avg R over 2 outcomes with R',
        );
    });
});
