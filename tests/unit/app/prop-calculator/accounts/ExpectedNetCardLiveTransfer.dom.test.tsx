import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExpectedNetCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/ExpectedNetCard';
import {
    type ExpectedNetCardModel,
    ExpectedNetStatus,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';

import { infoContent, withInfoTexts } from '../infoPopover';
import { inlineWarningNotes, warningNotes } from './warningNotes';

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

        const notes = [
            ...infoContent(container, 'Expected net').querySelectorAll('li'),
        ].map((item) => item.textContent);
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

        expect(withInfoTexts(container)).not.toContain('Live transfer');
    });
});

describe('ExpectedNetCard plan notes', () => {
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

    it('starts the policy-sensitive note on its own line under the plan name', () => {
        const model = modelOf([]);
        act(() => {
            root.render(
                <ExpectedNetCard
                    model={{
                        ...model,
                        rows: model.rows.map((row) => ({
                            ...row,
                            policySensitiveNote:
                                'This plan ranks differently under the payout-size optimum.',
                        })),
                    }}
                />,
            );
        });

        const planCell = container.querySelector(':scope tbody th');
        if (planCell === null) throw new Error('no plan row header');
        expect(warningNotes(planCell)).toHaveLength(1);
        expect(inlineWarningNotes(planCell)).toEqual([]);
    });
});
