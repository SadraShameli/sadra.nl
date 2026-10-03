import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountStage, usdCents } from '~/lib/prop-accounts';
import { AdviceSource } from '~/lib/prop-calculator/advisor';

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));

const mutate = vi.hoisted(() => vi.fn());

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            decision: {
                create: {
                    useMutation: () => ({ isPending: false, mutate }),
                },
                recordActual: {
                    useMutation: () => ({ isPending: false, mutate: vi.fn() }),
                },
            },
        },
        useUtils: () => ({
            propAccounts: { decision: { invalidate: vi.fn() } },
        }),
    },
}));

const { DecisionLog } =
    await import('~/app/(app)/prop-calculator/accounts/_components/advice/DecisionLog');

type DecisionRow = ComponentProps<typeof DecisionLog>['decisions'][number];

const STEP_CENTS = 5000;

function decisionOf(overrides: Partial<DecisionRow> = {}): DecisionRow {
    return {
        acceptedRiskCents: usdCents(50_000),
        acceptedRungsCents: [usdCents(50_000)],
        accountId: 'account-a',
        actualRiskCents: null,
        createdAt: new Date('2026-09-26T12:00:00Z'),
        decidedOn: '2026-09-26',
        headlineRiskCents: usdCents(50_000),
        id: 'decision-1',
        note: null,
        snapshotId: 'snap-1',
        source: AdviceSource.LadderSearchFresh,
        stage: AccountStage.Eval,
        updatedAt: new Date('2026-09-26T12:00:00Z'),
        userId: 'user-a',
        ...overrides,
    };
}

const SUGGESTION = {
    acceptedRiskCents: 50_000,
    acceptedRungsCents: [usdCents(50_000), usdCents(25_000)],
    headlineRiskCents: 50_000,
    snapshotId: 'snap-1',
    source: AdviceSource.LadderSearchFresh,
    stage: AccountStage.Eval,
};

describe('the decision log shows adherence from the one library notion (PT-108 steps 9 and 10, F-132)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(
        decisions: readonly DecisionRow[],
        suggestion: null | typeof SUGGESTION = SUGGESTION,
    ) {
        act(() => {
            root.render(
                <DecisionLog
                    accountId="account-a"
                    decidedOn="2026-09-27"
                    decisions={decisions}
                    stepCents={STEP_CENTS}
                    suggestion={suggestion}
                />,
            );
        });
    }

    function adherenceCells(): string[] {
        return [...container.querySelectorAll(':scope tbody tr')].map(
            (row) =>
                row.querySelector(':scope td:last-child')?.textContent ?? '',
        );
    }

    function acceptButton(): HTMLButtonElement {
        const button = [...container.querySelectorAll('button')].find(
            (candidate) =>
                candidate.textContent === 'Accept size' ||
                candidate.textContent === 'Already accepted',
        );
        if (button === undefined) throw new Error('no accept button');
        return button;
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        mutate.mockClear();
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

    it('shows the ratio and "followed" for an actual risk within one rounding step of the accepted size', () => {
        render([decisionOf({ actualRiskCents: usdCents(47_000) })]);

        expect(adherenceCells()).toEqual([
            '94% of the accepted size, followed',
        ]);
    });

    it('shows the ratio and "not followed" for an actual risk beyond one rounding step', () => {
        render([decisionOf({ actualRiskCents: usdCents(30_000) })]);

        expect(adherenceCells()).toEqual([
            '60% of the accepted size, not followed',
        ]);
    });

    it('shows "n/a" with the verdict at a zero accepted size', () => {
        render([
            decisionOf({
                acceptedRiskCents: usdCents(0),
                actualRiskCents: usdCents(0),
            }),
        ]);

        expect(adherenceCells()).toEqual(['n/a, followed']);
    });

    it('shows nothing for a decision whose actual risk is not recorded', () => {
        render([decisionOf()]);

        expect(adherenceCells()).toEqual(['']);
    });

    it('sums the verdicts the way the weekly review counts them, leaving unrecorded decisions out', () => {
        render([
            decisionOf({ actualRiskCents: usdCents(47_000), id: 'd1' }),
            decisionOf({ actualRiskCents: usdCents(30_000), id: 'd2' }),
            decisionOf({ id: 'd3' }),
        ]);

        expect(container.textContent).toContain(
            'Followed 1 of 2 decisions with an actual risk recorded, within $50.00 of the accepted size',
        );
    });

    it('shows no adherence summary while no decision has an actual risk', () => {
        render([decisionOf()]);

        expect(container.textContent).not.toContain('Followed');
    });

    it('enables "Accept size" for a snapshot with no accepted decision', () => {
        render([]);

        expect(acceptButton().textContent).toBe('Accept size');
        expect(acceptButton().disabled).toBe(false);
    });

    it('disables the button as "Already accepted" for the same snapshot and the same rungs', () => {
        render([
            decisionOf({
                acceptedRungsCents: [usdCents(50_000), usdCents(25_000)],
            }),
        ]);

        expect(acceptButton().textContent).toBe('Already accepted');
        expect(acceptButton().disabled).toBe(true);
        act(() => {
            acceptButton().click();
        });
        expect(mutate).not.toHaveBeenCalled();
    });

    it('enables the button when the same snapshot has different rungs', () => {
        render([
            decisionOf({
                acceptedRungsCents: [usdCents(50_000), usdCents(30_000)],
            }),
        ]);

        expect(acceptButton().textContent).toBe('Accept size');
        expect(acceptButton().disabled).toBe(false);
    });

    it('enables the button for a new snapshot with the same rungs', () => {
        render([
            decisionOf({
                acceptedRungsCents: [usdCents(50_000), usdCents(25_000)],
                snapshotId: 'snap-0',
            }),
        ]);

        expect(acceptButton().textContent).toBe('Accept size');
        expect(acceptButton().disabled).toBe(false);
    });

    it('accepts a new size once through the mutation', () => {
        render([]);

        act(() => {
            acceptButton().click();
        });

        expect(mutate).toHaveBeenCalledTimes(1);
    });
});
