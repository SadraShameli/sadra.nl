import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EvSourcesCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/EvSourcesCard';
import { type EvSourcesCardModel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';

function modelOf(liveTransferNotes: readonly string[]): EvSourcesCardModel {
    return {
        accounts: [],
        disclosures: [],
        heldLabel: 'payout money at risk',
        liveTransferNotes,
        plans: [],
    };
}

describe('EvSourcesCard live-transfer hazard lines (PT-73d)', () => {
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

    it('prints each hazard note of the values it shows', () => {
        act(() => {
            root.render(
                <EvSourcesCard
                    model={modelOf([
                        'Plan A, fresh funded value. Live transfer: 30.0% per paid payout (your assumption, not a firm rule).',
                        'Funded, value from its own state. Live transfer: 30.0% per paid payout (your assumption, not a firm rule).',
                    ])}
                />,
            );
        });

        const notes = [
            ...container.querySelectorAll(
                ':scope ul[aria-label="Live-transfer and payout-trigger assumptions behind the values"] li',
            ),
        ].map((item) => item.textContent);
        expect(notes).toHaveLength(2);
        expect(notes[0]).toContain('Plan A, fresh funded value. Live transfer');
        expect(notes[1]).toContain('Funded, value from its own state.');
    });

    it('prints no live-transfer line when no value priced a hazard', () => {
        act(() => {
            root.render(<EvSourcesCard model={modelOf([])} />);
        });

        expect(container.textContent).not.toContain('Live transfer');
        expect(
            container.querySelector(
                'ul[aria-label="Live-transfer and payout-trigger assumptions behind the values"]',
            ),
        ).toBeNull();
    });
});
