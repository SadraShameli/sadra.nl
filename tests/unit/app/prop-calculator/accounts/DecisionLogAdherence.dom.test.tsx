import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountStage, usdCents } from '~/lib/prop-accounts';
import { AdviceSource } from '~/lib/prop-calculator/advisor';

import { dialogTitled, findDialogTitled } from '../../../components/formDialog';
import {
    chooseRowAction,
    rowActionsTrigger,
} from '../../../components/rowActionsMenu';

vi.mock('sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));

const mutate = vi.hoisted(() => vi.fn());
const recordActual = vi.hoisted(() => vi.fn());

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            decision: {
                create: {
                    useMutation: () => ({ isPending: false, mutate }),
                },
                recordActual: {
                    useMutation: () => ({
                        isPending: false,
                        mutate: recordActual,
                    }),
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

    function render(decisions: readonly DecisionRow[]) {
        act(() => {
            root.render(
                <DecisionLog
                    accountId="account-a"
                    decidedOn="2026-09-27"
                    decisions={decisions}
                    stepCents={STEP_CENTS}
                    suggestion={SUGGESTION}
                />,
            );
        });
    }

    function adherenceCells(): string[] {
        return [...container.querySelectorAll(':scope tbody tr')].map(
            (row) =>
                row.querySelector(':scope td[data-label="Adherence"]')
                    ?.textContent ?? '',
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
        recordActual.mockClear();
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

    it('shows only the verdict at a zero accepted size, with no share of it', () => {
        render([
            decisionOf({
                acceptedRiskCents: usdCents(0),
                actualRiskCents: usdCents(0),
            }),
        ]);

        expect(adherenceCells()).toEqual(['followed']);
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

    it('offers to record the actual risk only on a decision that has none yet', () => {
        render([
            decisionOf({
                actualRiskCents: usdCents(47_000),
                decidedOn: '2026-09-25',
                id: 'd1',
            }),
            decisionOf({ id: 'd2' }),
        ]);

        expect(() =>
            rowActionsTrigger('the decision of 25 Sep 2026'),
        ).toThrow();
        chooseRowAction('the decision of 26 Sep 2026', 'Record actual risk');
        expect(
            findDialogTitled('Actual risk for the decision of 26 Sep 2026'),
        ).not.toBeNull();
        expect(container.textContent).toContain('Not recorded');
    });

    it('keeps the record button disabled while the actual risk is empty and rejects a negative amount with a message', async () => {
        render([decisionOf()]);
        chooseRowAction('the decision of 26 Sep 2026', 'Record actual risk');
        const dialog = dialogTitled(
            'Actual risk for the decision of 26 Sep 2026',
        );
        const submit = [...dialog.querySelectorAll('button')].find(
            (button) => button.textContent === 'Record actual',
        );
        if (submit === undefined) throw new Error('no Record actual button');
        expect(submit.disabled).toBe(true);
        const input = dialog.querySelector('input');
        if (input === null) throw new Error('no actual risk input');
        act(() => {
            Reflect.set(HTMLInputElement.prototype, 'value', '-5', input);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(submit.disabled).toBe(false);
        await act(async () => {
            submit.click();
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
        });

        expect(dialog.textContent).toContain('Enter a valid risk amount');
        expect(recordActual).not.toHaveBeenCalled();
    });

    it('accepts a new size once through the mutation', () => {
        render([]);

        act(() => {
            acceptButton().click();
        });

        expect(mutate).toHaveBeenCalledTimes(1);
    });
});
