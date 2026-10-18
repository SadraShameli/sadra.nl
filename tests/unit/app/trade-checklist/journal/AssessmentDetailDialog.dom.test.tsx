import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TradeAssessmentRow } from '~/lib/trading/types';

import { AssessmentDetailDialog } from '~/app/(app)/trade-checklist/_components/journal/AssessmentDetailDialog';
import { scoreAssessment } from '~/lib/trading/scoring';

import { assessment } from '../assessmentFixture';

function knockedOut(): TradeAssessmentRow {
    const base = assessment();
    const answers = {
        ...base.answers,
        finals: { ...base.answers.finals, dolAlreadyTaken: true },
    };
    const result = scoreAssessment(base.planSnapshot, answers);
    return assessment({
        answers,
        grade: result.grade,
        recommendation: result.recommendation,
        result,
        score: result.score,
    });
}

function mentalUnweighted(): TradeAssessmentRow {
    const base = assessment();
    const { weights } = base.planSnapshot;
    const planSnapshot = {
        ...base.planSnapshot,
        weights: {
            ...weights,
            context: weights.context + weights.mental,
            mental: 0,
        },
    };
    const result = scoreAssessment(planSnapshot, base.answers);
    return assessment({
        grade: result.grade,
        planSnapshot,
        recommendation: result.recommendation,
        result,
        score: result.score,
    });
}

describe('the assessment detail dialog', () => {
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

    function renderRow(row: TradeAssessmentRow): string {
        act(() => {
            root.render(<AssessmentDetailDialog onClose={vi.fn()} row={row} />);
        });
        return (
            document.body.querySelector(':scope [role="dialog"]')
                ?.textContent ?? ''
        );
    }

    function renderLoss(actualRiskTaken: number): string {
        return renderRow(
            assessment({
                actualRiskTaken,
                outcome: 'loss',
                outcomeR: -1,
            }),
        );
    }

    it('states the risk actually taken in whole dollars, grouped in thousands', () => {
        expect(renderLoss(1250)).toContain('Risked $1,250');
    });

    it('keeps the cents of a risk that was not a whole dollar amount', () => {
        expect(renderLoss(187.5)).toContain('Risked $187.50');
    });

    it('says the components were not scored when a knockout skipped scoring', () => {
        const row = knockedOut();
        expect(row.recommendation).toBe('hard-skip');
        const text = renderRow(row);
        expect(text).toContain('Not scored');
        expect(text).not.toContain('0.0 / 0');
    });

    it('marks a component the plan weights at zero as not weighted instead of skipped', () => {
        const row = mentalUnweighted();
        expect(row.recommendation).not.toBe('hard-skip');
        const text = renderRow(row);
        expect(text).toContain('Mental stateNot weighted');
        expect(text).not.toContain('Skipped');
        expect(text).not.toContain('Not scored');
    });

    it('states whether the plan was followed with an icon instead of a text glyph', () => {
        const text = renderRow(
            assessment({ followedPlan: true, outcome: 'win', outcomeR: 2 }),
        );
        expect(text).toContain('Followed plan');
        expect(text).not.toContain('✓');
    });
});
