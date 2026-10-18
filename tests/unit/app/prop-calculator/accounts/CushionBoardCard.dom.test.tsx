import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CushionBoardCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/CushionBoardCard';
import { type CushionBoardCardModel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';

import { infoText, withInfoTexts } from '../infoPopover';

type Row = CushionBoardCardModel['rows'][number];

function row(overrides: Partial<Row> = {}): Row {
    return {
        account: 'MFF Pro A',
        asOf: '2026-09-25',
        basis: 'Funded',
        cushion: '$1,000.00',
        floor: '$52,000.00',
        key: 'a',
        rank: '1',
        ratio: '2.0R',
        ...overrides,
    };
}

describe('CushionBoardCard', () => {
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

    it('renders every populated row in rank order, then each account without a cushion as a row of missing values with its reason (PT-113)', () => {
        const model: CushionBoardCardModel = {
            disclosure: 'Ranked by cushion in risk units.',
            rows: [
                row(),
                row({
                    account: 'Apex EOD B',
                    asOf: '2026-09-24',
                    basis: 'Evaluation',
                    cushion: '$2,500.00',
                    floor: '$48,000.00',
                    key: 'b',
                    rank: '2',
                    ratio: '5.0R',
                }),
            ],
            unavailable: [
                {
                    account: 'TopStep C',
                    isAwaitingSnapshot: true,
                    key: 'c',
                    reason: 'no snapshot yet',
                },
            ],
        };
        act(() => {
            root.render(<CushionBoardCard model={model} />);
        });
        const cells = [...container.querySelectorAll(':scope tbody tr')].map(
            (tr) =>
                [...tr.querySelectorAll('th, td')].map((td) => td.textContent),
        );
        expect(cells).toEqual([
            [
                '1',
                'MFF Pro A',
                'Funded',
                '$52,000.00',
                '$1,000.00',
                '2.0R',
                '25 Sep 2026',
            ],
            [
                '2',
                'Apex EOD B',
                'Evaluation',
                '$48,000.00',
                '$2,500.00',
                '5.0R',
                '24 Sep 2026',
            ],
            [
                '',
                'TopStep C',
                '–Not available',
                '–Not available',
                '–Not available',
                '–Not available',
                '',
            ],
        ]);
        const unavailable = [
            ...container.querySelectorAll(':scope tbody tr'),
        ].at(-1);
        expect(
            unavailable === undefined ? '' : withInfoTexts(unavailable),
        ).toContain('No snapshot yet.');
        expect(infoText(container, 'Cushion board')).toContain(
            'Ranked by cushion in risk units.',
        );
        expect(container.textContent).not.toContain(
            'No account has a usable balance snapshot yet.',
        );
    });

    function render(model: CushionBoardCardModel) {
        act(() => {
            root.render(<CushionBoardCard model={model} />);
        });
    }

    it('asks for balances when every account without a cushion only lacks a snapshot', () => {
        render({
            disclosure: 'Ranked by cushion in risk units.',
            rows: [],
            unavailable: [
                {
                    account: 'TopStep C',
                    isAwaitingSnapshot: true,
                    key: 'c',
                    reason: 'it has no snapshot yet',
                },
            ],
        });
        expect(container.textContent).toContain(
            'Enter balances to see the cushion board',
        );
        expect(container.querySelector('table')).toBeNull();
    });

    it('lists each account and its reason, not a request for balances, when no account has a cushion for a reason a balance does not fix', () => {
        render({
            disclosure: 'Ranked by cushion in risk units.',
            rows: [],
            unavailable: [
                {
                    account: 'Hola',
                    isAwaitingSnapshot: false,
                    key: 'h',
                    reason: 'it is a ledger-only account with no state to reconstruct',
                },
                {
                    account: 'TopStep C',
                    isAwaitingSnapshot: true,
                    key: 'c',
                    reason: 'it has no snapshot yet',
                },
            ],
        });
        expect(container.textContent).not.toContain('Enter balances');
        const rows = [...container.querySelectorAll(':scope tbody tr')];
        expect(rows.map((tr) => tr.querySelector('th')?.textContent)).toEqual([
            'Hola',
            'TopStep C',
        ]);
        expect(rows[0] === undefined ? '' : withInfoTexts(rows[0])).toContain(
            'It is a ledger-only account with no state to reconstruct.',
        );
        expect(rows[1] === undefined ? '' : withInfoTexts(rows[1])).toContain(
            'It has no snapshot yet.',
        );
        expect(infoText(container, 'Cushion board')).toContain(
            'Ranked by cushion in risk units.',
        );
    });
});
