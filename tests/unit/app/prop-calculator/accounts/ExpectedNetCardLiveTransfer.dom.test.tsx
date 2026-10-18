import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExpectedNetCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/ExpectedNetCard';
import {
    type ExpectedNetCardModel,
    ExpectedNetStatus,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';

const FIGURE = {
    creditFree: '$1,111',
    creditInclusive: '$1,234',
    requestSize: '$1,250',
    totalCreditFree: '$2,222',
};

function modelOf(liveTransferNotes: readonly string[]): ExpectedNetCardModel {
    return {
        disclosures: [],
        refused: [],
        rows: [
            {
                activeSlots: '1',
                documented: FIGURE,
                key: 'plan-a',
                labels: {
                    creditBasis: 'credit basis',
                    lifetimeCapBasis: 'lifetime basis',
                    payoutPolicy: 'payout policy',
                    retainedCushion: 'retained cushion',
                    startBasis: 'Fresh start',
                    trials: '1,234 trials',
                },
                liveTransferNotes,
                optimum: FIGURE,
                plan: 'Plan A',
                policySensitiveNote: null,
                rankDocumented: '1 of 1',
                rankOptimum: '1 of 1',
            },
        ],
        status: ExpectedNetStatus.Ready,
        statusNote: null,
    };
}

describe('ExpectedNetCard live-transfer hazard lines (PT-73d)', () => {
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

    it('prints every hazard note of a plan row under the figures', () => {
        act(() => {
            root.render(
                <ExpectedNetCard
                    model={modelOf([
                        'Documented policy. Live transfer: 30.0% per paid payout (your assumption, not a firm rule).',
                        'Payout-size optimum. Live transfer: 30.0% per paid payout (your assumption, not a firm rule).',
                    ])}
                />,
            );
        });

        const notes = [...container.querySelectorAll('li')].map(
            (item) => item.textContent,
        );
        expect(notes).toContainEqual(
            expect.stringContaining('Plan A: Documented policy. Live transfer'),
        );
        expect(notes).toContainEqual(
            expect.stringContaining(
                'Plan A: Payout-size optimum. Live transfer',
            ),
        );
    });

    it('prints no live-transfer line for a plan whose figures priced no hazard', () => {
        act(() => {
            root.render(<ExpectedNetCard model={modelOf([])} />);
        });

        expect(container.textContent).not.toContain('Live transfer');
    });
});
