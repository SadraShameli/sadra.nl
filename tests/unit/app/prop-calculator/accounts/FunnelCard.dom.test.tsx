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
        weaknesses: [],
        ...overrides,
    };
}

function row(
    overrides: Partial<FunnelRow> & Pick<FunnelRow, 'firm' | 'key'>,
): FunnelRow {
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
        structuralBusts: '0',
        unknownBusts: '0',
        withinPlanBusts: '0',
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

    it('shows the structural and within-plan bust counts per firm, with the disclosure (F-V20)', () => {
        act(() => {
            root.render(
                <FunnelCard
                    model={model({
                        disclosures: [
                            'A bust counts as structural only when a rule violation is recorded against that account.',
                        ],
                        rows: [
                            row({
                                firm: 'Alpha Prop',
                                key: 'alpha',
                                structuralBusts: '3',
                                withinPlanBusts: '2',
                            }),
                        ],
                    })}
                />,
            );
        });
        expect(container.textContent).toContain('3');
        expect(container.textContent).toContain('2');
        expect(container.textContent).toContain(
            'A bust counts as structural only when a rule violation is recorded against that account.',
        );
    });

    it('shows the unknown bust count per firm, alongside structural and within-plan (F-V20)', () => {
        act(() => {
            root.render(
                <FunnelCard
                    model={model({
                        rows: [
                            row({
                                firm: 'Alpha Prop',
                                key: 'alpha',
                                structuralBusts: '1',
                                unknownBusts: '4',
                                withinPlanBusts: '2',
                            }),
                        ],
                    })}
                />,
            );
        });
        expect(container.textContent).toContain('4');
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
    it('lists a biggest-weakness row per plan, naming the plan, the stage and its dollars per attempt and per month', () => {
        act(() => {
            root.render(
                <FunnelCard
                    model={model({
                        rows: [row({ firm: 'Alpha Prop', key: 'alpha' })],
                        weaknesses: [
                            {
                                key: 'plan-a',
                                plan: 'Alpha Prop $50K',
                                text: 'Pass rate: -$12.00 per attempt, -$120.00 per month versus the engine.',
                            },
                            {
                                key: 'plan-b',
                                plan: 'Beta Prop $100K',
                                text: 'Payout rate: -$3.00 per attempt, -$30.00 per month versus the engine.',
                            },
                        ],
                    })}
                />,
            );
        });
        const items = [
            ...container.querySelectorAll(
                ':scope ul[aria-label="Biggest weakness by plan"] li',
            ),
        ].map((item) => item.textContent);
        expect(items).toEqual([
            'Biggest weakness, Alpha Prop $50K: Pass rate: -$12.00 per attempt, -$120.00 per month versus the engine.',
            'Biggest weakness, Beta Prop $100K: Payout rate: -$3.00 per attempt, -$30.00 per month versus the engine.',
        ]);
    });

    it('shows no weakness row when none is beyond noise', () => {
        act(() => {
            root.render(
                <FunnelCard
                    model={model({
                        rows: [row({ firm: 'Alpha Prop', key: 'alpha' })],
                    })}
                />,
            );
        });
        expect(
            container.querySelectorAll(
                ':scope ul[aria-label="Biggest weakness by plan"]',
            ),
        ).toHaveLength(0);
    });
});
