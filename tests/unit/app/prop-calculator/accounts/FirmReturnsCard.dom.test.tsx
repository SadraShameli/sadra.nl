import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FirmReturnsCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/FirmReturnsCard';
import { type FirmReturnsCardModel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { SampleLevel } from '~/lib/prop-accounts';

type FirmReturnRow = FirmReturnsCardModel['rows'][number];

function row(
    overrides: Partial<FirmReturnRow> &
        Pick<FirmReturnRow, 'firm' | 'key' | 'multiple'>,
): FirmReturnRow {
    return {
        accounts: '1',
        accountsWithPayout: '0',
        attempts: '1',
        attemptsSampleLevel: null,
        coverageNote: null,
        firstPayoutOn: 'n/a',
        fundedAccounts: '0',
        fundedSampleLevel: null,
        lastPayoutOn: 'n/a',
        net: '$0.00',
        payouts: '$0.00',
        spend: '$0.00',
        verdict: 'Unknown (not enough data)',
        ...overrides,
    };
}

describe('FirmReturnsCard', () => {
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

    it('sorts a zero-spend firm with a not applicable multiple below every real multiple, including a genuine 0.00x', () => {
        const model: FirmReturnsCardModel = {
            rows: [
                row({ firm: 'Zero spend firm', key: 'zero', multiple: 'n/a' }),
                row({
                    firm: 'Real zero firm',
                    key: 'realzero',
                    multiple: '0.00x',
                }),
                row({ firm: 'Winner firm', key: 'winner', multiple: '2.00x' }),
            ],
        };
        act(() => {
            root.render(<FirmReturnsCard model={model} />);
        });
        const multipleHeader = [...container.querySelectorAll('button')].find(
            (button) => button.textContent === 'Multiple',
        );
        act(() => {
            multipleHeader?.dispatchEvent(
                new MouseEvent('click', { bubbles: true }),
            );
        });
        const firmNames = [
            ...container.querySelectorAll(':scope tbody tr'),
        ].map((tableRow) => tableRow.querySelector(':scope td')?.textContent);
        expect(firmNames).toEqual([
            'Winner firm',
            'Real zero firm',
            'Zero spend firm',
        ]);
    });

    it('shows a sample-level badge next to the attempts and funded counts once a threshold is set', () => {
        const model: FirmReturnsCardModel = {
            rows: [
                row({
                    attempts: '2',
                    attemptsSampleLevel: SampleLevel.Low,
                    firm: 'Thin sample firm',
                    fundedAccounts: '1',
                    fundedSampleLevel: SampleLevel.Adequate,
                    key: 'thin',
                    multiple: '1.00x',
                }),
            ],
        };
        act(() => {
            root.render(<FirmReturnsCard model={model} />);
        });
        expect(container.textContent).toContain('Low sample');
        expect(container.textContent).toContain('Adequate sample');
    });

    it('discloses the accounts of a firm that have no timeline', () => {
        const model: FirmReturnsCardModel = {
            rows: [
                row({
                    coverageNote:
                        '1 account with a plan that is no longer modeled and 1 ledger-only account have no timeline in this firm row.',
                    firm: 'Mixed firm',
                    key: 'mixed',
                    multiple: '1.00x',
                }),
            ],
        };
        act(() => {
            root.render(<FirmReturnsCard model={model} />);
        });
        expect(container.textContent).toContain(
            'Mixed firm: 1 account with a plan that is no longer modeled and 1 ledger-only account have no timeline in this firm row.',
        );
    });
});
