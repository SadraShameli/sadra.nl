import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CushionBoardCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/CushionBoardCard';
import { type CushionBoardCardModel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';

import { infoText } from '../infoPopover';

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

    it('renders every populated row in rank order with its stage, floor, cushion, risk units and as-of, and the unavailable reasons (PT-113)', () => {
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
                { account: 'TopStep C', key: 'c', reason: 'no snapshot yet' },
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
        ]);
        const unavailable = container.querySelector(
            '[aria-label="Accounts without a cushion"]',
        );
        expect(unavailable?.textContent).toBe('TopStep C: no snapshot yet');
        expect(infoText(container, 'Cushion board')).toContain(
            'Ranked by cushion in risk units.',
        );
        expect(container.textContent).not.toContain(
            'No account has a usable balance snapshot yet.',
        );
    });
});
