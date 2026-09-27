import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FunnelCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/FunnelCard';
import { type FunnelCardModel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';

type FunnelRow = FunnelCardModel['rows'][number];

function model(overrides: Partial<FunnelCardModel> = {}): FunnelCardModel {
    return {
        biggestWeakness: 'pending',
        disclosures: [],
        rows: [],
        unresolvedNote: null,
        ...overrides,
    };
}

function row(overrides: Partial<FunnelRow> & Pick<FunnelRow, 'firm' | 'key'>): FunnelRow {
    return {
        fees: '$0',
        firstPayout: '0',
        funded: '0',
        movedLive: '0',
        net: '$0',
        netPayouts: '$0',
        passed: '0',
        payoutRate: 'n/a',
        purchased: '0',
        ...overrides,
    };
}

describe('FunnelCard', () => {
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

    it('shows fees, net payouts and net dollars per firm', () => {
        act(() => {
            root.render(
                <FunnelCard
                    model={model({
                        rows: [
                            row({
                                fees: '$350.00',
                                firm: 'Alpha Prop',
                                key: 'alpha',
                                net: '$550.00',
                                netPayouts: '$900.00',
                            }),
                        ],
                    })}
                />,
            );
        });
        expect(container.textContent).toContain('$350.00');
        expect(container.textContent).toContain('$900.00');
        expect(container.textContent).toContain('$550.00');
    });

    it('shows the biggest-weakness line beneath the table', () => {
        act(() => {
            root.render(
                <FunnelCard
                    model={model({
                        biggestWeakness:
                            'The biggest-weakness ranking is pending the engine cards: no modeled run is compared against these realized numbers yet.',
                        rows: [row({ firm: 'Alpha Prop', key: 'alpha' })],
                    })}
                />,
            );
        });
        expect(container.textContent).toContain(
            'The biggest-weakness ranking is pending the engine cards',
        );
    });
});
