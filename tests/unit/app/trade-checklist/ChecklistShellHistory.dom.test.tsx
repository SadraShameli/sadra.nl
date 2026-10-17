import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
    Answers,
    TradeAssessmentRow,
    TradingPlanRow,
} from '~/lib/trading/types';

import { ChecklistShell } from '~/app/(app)/trade-checklist/_components/ChecklistShell';
import { DEFAULT_PLAN } from '~/lib/trading/defaults';
import { scoreAssessment } from '~/lib/trading/scoring';

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

const ANSWERS: Answers = {
    bias: {
        conviction: 8,
        daily: 'bullish',
        fifteenMin: 'bullish',
        fourHour: 'bullish',
        oneHour: 'bullish',
        weekly: 'bullish',
    },
    context: {
        accountType: 'eval',
        windowId: DEFAULT_PLAN.windows[0]?.id ?? null,
        windowQuotaUsed: false,
    },
    dol: { bothSided: false, distanceR: 3, singular: true, type: 'None' },
    entry: { confluences: [], onFvg: true },
    finals: { dolAlreadyTaken: false, notes: '', overExtended: false },
    mental: {
        boredomHunt: false,
        distracted: false,
        hesitation: false,
        revengeOrFomo: false,
    },
    rr: { slippageR: 0, targetR: 3 },
    sl: { bb: true, ob: true, swing: true },
    state: {
        dayType: 'imbalanced',
        displacement: 'toward',
        opposingSweep: true,
        setupType: 'continuation',
    },
};

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

const ASSESSMENT_ID = 'saved-assessment';

function assessment(
    overrides: Partial<TradeAssessmentRow> = {},
): TradeAssessmentRow {
    const snapshot = {
        ...DEFAULT_PLAN,
        risk: { ...DEFAULT_PLAN.risk, evalDollars: 100 },
    };
    const result = scoreAssessment(snapshot, ANSWERS);
    return {
        actualRiskTaken: null,
        answers: ANSWERS,
        createdAt: new Date('2026-09-10T14:00:00Z'),
        executionDeviations: null,
        followedPlan: null,
        grade: result.grade,
        id: ASSESSMENT_ID,
        outcome: null,
        outcomeNotes: null,
        outcomeR: null,
        outcomeRecordedAt: null,
        planId: 'old-plan',
        planSnapshot: snapshot,
        recommendation: result.recommendation,
        result,
        score: result.score,
        userId: 'trader',
        ...overrides,
    };
}

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
});
