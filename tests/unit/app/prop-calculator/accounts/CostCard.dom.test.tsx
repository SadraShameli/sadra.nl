import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CostCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/CostCard';
import { type CostCardModel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { SampleLevel } from '~/lib/prop-accounts';

function model(overrides: Partial<CostCardModel> = {}): CostCardModel {
    return {
        byAccountSize: [],
        byFirm: [],
        byFirmAttemptCost: [],
        byKind: [],
        disclosures: [],
        discountsByFirm: [],
        discountsNote: null,
        perPlan: [],
        ...overrides,
    };
}

function rowsOf(table: HTMLTableElement): string[][] {
    return [...table.querySelectorAll('tr')].map((tableRow) =>
        [...tableRow.querySelectorAll('th, td')].map(
            (cell) => cell.textContent,
        ),
    );
}

function tableOf(container: HTMLElement, heading: string): HTMLTableElement {
    const title = [...container.querySelectorAll('h3')].find(
        (candidate) => candidate.textContent === heading,
    );
    const table = title?.parentElement?.querySelector('table');
    if (table === null || table === undefined) {
        throw new Error(`no table under ${heading}`);
    }
    return table;
}

describe('CostCard', () => {
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

    function render(value: CostCardModel) {
        act(() => {
            root.render(<CostCard model={value} />);
        });
    }

    it('renders the discounts table pinned: one row per firm with its discount and fees checked', () => {
        render(
            model({
                discountsByFirm: [
                    {
                        discount: '$70.00',
                        feesChecked: '4',
                        firm: 'Alpha Prop',
                        key: 'alpha',
                    },
                    {
                        discount: '$0.00',
                        feesChecked: '1',
                        firm: 'Beta Prop',
                        key: 'beta',
                    },
                ],
            }),
        );
        expect(
            rowsOf(tableOf(container, 'Discounts captured by firm')),
        ).toEqual([
            ['Firm', 'Discount vs list price', 'Fees checked'],
            ['Alpha Prop', '$70.00', '4'],
            ['Beta Prop', '$0.00', '1'],
        ]);
    });

    it('says how many fee rows the discount table left out, even with no discount to show', () => {
        render(
            model({
                discountsNote:
                    '2 fee rows of ledger-only and unmodeled accounts have no plan to price against and are not in this table.',
            }),
        );
        expect(container.textContent).toContain(
            '2 fee rows of ledger-only and unmodeled accounts have no plan to price against and are not in this table.',
        );
        expect(container.textContent).not.toContain('Fee kind');
    });

    it('shows each plan cost per attempt, attempts and implied attempts', () => {
        render(
            model({
                perPlan: [
                    {
                        acquisitionSpend: '$530.00',
                        attempts: '4',
                        attemptsSampleLevel: SampleLevel.Low,
                        costPerAttempt: '$132.50',
                        costPerFunded: 'n/a',
                        fundedAccounts: '0',
                        fundedSampleLevel: null,
                        impliedAttempts: '3.53',
                        key: 'plan-a',
                        modeled: 'Pending',
                        pendingEvalAccounts: '0',
                        pendingSpend: '$0.00',
                        plan: 'Alpha Prop $50K',
                        realizedMinusModeled: 'n/a',
                    },
                ],
            }),
        );
        const [head, row] = rowsOf(
            tableOf(container, 'Cost per funded account'),
        );
        expect(head).toContain('Attempts');
        expect(head).toContain('Cost per attempt');
        expect(head).toContain('Implied attempts');
        const attemptsCell = row?.[head?.indexOf('Attempts') ?? -1];
        expect(attemptsCell).toContain('4');
        expect(attemptsCell).toContain('Low sample');
        expect(row).toContain('$132.50');
        expect(row).toContain('3.53');
    });

    it('shows attempts, cost per attempt and implied attempts by firm', () => {
        render(
            model({
                byFirmAttemptCost: [
                    {
                        attempts: '4',
                        attemptsSampleLevel: null,
                        costPerAttempt: '$132.50',
                        firm: 'Alpha Prop',
                        impliedAttempts: '3.53',
                        key: 'alpha',
                        retryFeeAttempts: '0',
                    },
                ],
            }),
        );
        const [head, row] = rowsOf(
            tableOf(container, 'Attempts and cost per attempt by firm'),
        );
        expect(head).toEqual([
            'Firm',
            'Attempts',
            'Cost per attempt',
            'Implied attempts',
            'Resets and rebuys',
        ]);
        expect(row).toEqual(['Alpha Prop', '4', '$132.50', '3.53', '0']);
    });

    it('prints every disclosure, including the throughput versus decided attempts line', () => {
        render(
            model({
                disclosures: [
                    'Attempt throughput counts started attempts; cost per attempt counts decided attempts only.',
                ],
            }),
        );
        expect(container.textContent).toContain(
            'Attempt throughput counts started attempts; cost per attempt counts decided attempts only.',
        );
    });
});
