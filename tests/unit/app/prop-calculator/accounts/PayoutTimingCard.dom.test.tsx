import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PayoutTimingCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/PayoutTimingCard';
import {
    type PayoutTimingCardModel,
    type PayoutTimingRow,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/payoutTimingModel';
import { SampleLevel } from '~/lib/prop-accounts/core';

const EXPLANATION =
    'Days from funded to the first payout, against days between later payouts.';

const EMPTY_FIGURE = {
    mean: 'n/a',
    n: 0,
    sampleLevel: null,
    standardError: 'n/a',
} as const;

function row(overrides: Partial<PayoutTimingRow>): PayoutTimingRow {
    return {
        betweenPayouts: EMPTY_FIGURE,
        key: 'plan-a',
        plan: 'Plan A',
        toFirstPayout: EMPTY_FIGURE,
        unpaidNote: null,
        ...overrides,
    };
}

describe('PayoutTimingCard', () => {
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

    function render(model: PayoutTimingCardModel) {
        act(() => {
            root.render(<PayoutTimingCard model={model} />);
        });
    }

    it('renders both columns per plan with mean, standard error, n and the sample badge', () => {
        render({
            explanation: EXPLANATION,
            rows: [
                row({
                    betweenPayouts: {
                        mean: '14.0 days',
                        n: 1,
                        sampleLevel: SampleLevel.Low,
                        standardError: 'n/a',
                    },
                    toFirstPayout: {
                        mean: '25.0 days',
                        n: 2,
                        sampleLevel: SampleLevel.Low,
                        standardError: '5.0 days',
                    },
                }),
            ],
        });
        const headers = [...container.querySelectorAll(':scope thead th')].map(
            (header) => header.textContent,
        );
        expect(headers).toEqual([
            'Plan',
            'Funded to first payout',
            'Between later payouts',
        ]);
        const cells = [...container.querySelectorAll(':scope tbody td')].map(
            (cell) => cell.textContent,
        );
        expect(
            container.querySelector(':scope tbody th')?.textContent,
        ).toBe('Plan A');
        expect(cells[0]).toContain('25.0 days');
        expect(cells[0]).toContain('SE 5.0 days');
        expect(cells[0]).toContain('n = 2');
        expect(cells[0]).toContain('Low sample');
        expect(cells[1]).toContain('14.0 days');
        expect(cells[1]).toContain('SE n/a');
        expect(cells[1]).toContain('n = 1');
        expect(cells[1]).toContain('Low sample');
    });

    it('shows n/a with n = 0 for a plan with no payout', () => {
        render({ explanation: EXPLANATION, rows: [row({})] });
        const cells = [...container.querySelectorAll(':scope tbody td')].map(
            (cell) => cell.textContent,
        );
        expect(cells[0]).toContain('n/a');
        expect(cells[0]).toContain('n = 0');
        expect(cells[1]).toContain('n/a');
        expect(cells[1]).toContain('n = 0');
    });

    it('prints the one-line explanation', () => {
        render({ explanation: EXPLANATION, rows: [row({})] });
        expect(container.textContent).toContain(EXPLANATION);
    });

    it('prints the unpaid sentence under its plan and nothing when there is none', () => {
        const note =
            '1 funded account has not paid yet (oldest 90 days), not in the mean';
        render({
            explanation: EXPLANATION,
            rows: [row({ unpaidNote: note })],
        });
        expect(container.textContent).toContain(note);
        render({ explanation: EXPLANATION, rows: [row({ unpaidNote: null })] });
        expect(container.textContent).not.toContain('not paid yet');
    });

    it('says so when no plan has a funded account', () => {
        render({ explanation: EXPLANATION, rows: [] });
        expect(container.textContent).toContain('No plan to time yet.');
        expect(container.querySelector('table')).toBeNull();
    });

    it('names the table and marks the plan name as the row header', () => {
        render({ explanation: EXPLANATION, rows: [row({})] });
        expect(
            container.querySelector(
                ':scope [aria-label="Payout timing per plan"] table',
            ),
        ).not.toBeNull();
        const rowHeaders = [
            ...container.querySelectorAll(':scope tbody th[scope="row"]'),
        ].map((header) => header.textContent);
        expect(rowHeaders).toEqual(['Plan A']);
    });
});
