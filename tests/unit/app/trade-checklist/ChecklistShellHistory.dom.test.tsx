import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TradeAssessmentRow, TradingPlanRow } from '~/lib/trading/types';

import { assessmentLabel } from '~/app/(app)/trade-checklist/_components/AssessmentBadges';
import { ChecklistShell } from '~/app/(app)/trade-checklist/_components/ChecklistShell';
import { DEFAULT_PLAN } from '~/lib/trading/defaults';

import {
    chooseRowAction,
    confirmButton,
} from '../../components/rowActionsMenu';
import { assessment, ASSESSMENT_ID } from './assessmentFixture';

const actions = vi.hoisted(() => ({
    deleteAllAssessments: vi.fn(() => Promise.resolve()),
    deleteAssessment: vi.fn(() => Promise.resolve()),
    recordAssessmentOutcome: vi.fn((_input: unknown) => Promise.resolve()),
    saveAssessment: vi.fn(() => Promise.resolve({ id: 'saved' })),
    setActiveTradingPlan: vi.fn(() => Promise.resolve()),
}));

vi.mock('~/lib/trading/actions', () => actions);
vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
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
vi.mock('next/link', () => ({
    default: ({ children }: { children: unknown }) => children,
}));
vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

const ACTIVE_PLAN: TradingPlanRow = {
    config: {
        ...DEFAULT_PLAN,
        risk: { ...DEFAULT_PLAN.risk, evalDollars: 500 },
    },
    createdAt: new Date('2026-09-01T00:00:00Z'),
    id: 'current-plan',
    isActive: true,
    name: 'Current plan',
    sortOrder: 0,
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    userId: 'trader',
};

function buttonNamed(name: string): HTMLButtonElement {
    const button = [...document.body.querySelectorAll('button')].find(
        (candidate) => candidate.textContent.trim() === name,
    );
    if (button === undefined) throw new TypeError(`no ${name} button`);
    return button;
}

describe('ChecklistShell history', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        actions.deleteAssessment.mockClear();
        actions.recordAssessmentOutcome.mockClear();
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

    function render(history: TradeAssessmentRow[]): void {
        act(() => {
            root.render(
                <ChecklistShell
                    activePlan={ACTIVE_PLAN}
                    history={history}
                    plans={[ACTIVE_PLAN]}
                />,
            );
        });
    }

    function selectFirst(): void {
        const item = container.querySelector(
            '.app-trade-checklist__history-item',
        );
        if (!(item instanceof HTMLElement)) throw new TypeError('no item');
        act(() => {
            item.click();
        });
    }

    it('shows a past assessment with the plan risk it was graded under', () => {
        render([assessment()]);
        selectFirst();
        expect(container.textContent).toContain('Risk on this account: $100');
        expect(container.textContent).not.toContain('Current plan ·');
    });

    it('opens the outcome of a saved loss as that loss, not a blank win', async () => {
        render([
            assessment({
                outcome: 'loss',
                outcomeNotes: 'stopped out',
                outcomeR: -1,
            }),
        ]);
        selectFirst();
        act(() => {
            buttonNamed('Record outcome').click();
        });
        const form = document.body.querySelector(':scope [role="dialog"] form');
        if (!(form instanceof HTMLFormElement)) {
            throw new TypeError('no outcome form');
        }
        await act(async () => {
            form.dispatchEvent(
                new Event('submit', { bubbles: true, cancelable: true }),
            );
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(actions.recordAssessmentOutcome).toHaveBeenCalledWith(
            expect.objectContaining({
                id: ASSESSMENT_ID,
                notes: 'stopped out',
                outcome: 'loss',
                outcomeR: -1,
            }),
        );
    });

    it('deletes a past assessment only after confirming in its row menu', async () => {
        const row = assessment();
        render([row]);
        chooseRowAction(assessmentLabel(row), 'Delete');
        expect(actions.deleteAssessment).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain('Delete assessment?');
        await act(async () => {
            confirmButton('Delete').click();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(actions.deleteAssessment).toHaveBeenCalledWith({
            id: ASSESSMENT_ID,
        });
    });
});
