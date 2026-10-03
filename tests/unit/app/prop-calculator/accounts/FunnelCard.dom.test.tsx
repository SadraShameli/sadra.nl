import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FunnelCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/FunnelCard';
import { type FunnelCardModel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';

type FunnelRow = FunnelCardModel['rows'][number];

function model(overrides: Partial<FunnelCardModel> = {}): FunnelCardModel {
    return {
        biggestWeakness: 'pending',
        diagnosticIssues: [],
        disclosures: [],
        rows: [],
        stageDollars: [],
        unresolvedNote: null,
        untestedWeaknesses: [],
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

    it('shows three copies as raw and independent counts per stage', () => {
        act(() => {
            root.render(
                <FunnelCard
                    model={model({
                        rows: [
                            row({
                                firm: 'Alpha Prop',
                                funded: '3 accounts, 1 independent',
                                key: 'alpha',
                                passed: '3 accounts, 1 independent',
                                purchased: '3 accounts, 1 independent',
                            }),
                        ],
                    })}
                />,
            );
        });
        expect(container.textContent).toContain('3 accounts, 1 independent');
    });

    it('shows fees, net payouts and net per stage under the label of the cohort they cover', () => {
        act(() => {
            root.render(
                <FunnelCard
                    model={model({
                        rows: [row({ firm: 'Alpha Prop', key: 'alpha' })],
                        stageDollars: [
                            {
                                fees: '$450.00',
                                firm: 'Alpha Prop',
                                key: 'alpha-purchased',
                                net: '-$150.00',
                                netPayouts: '$300.00',
                                stage: 'Purchased',
                            },
                            {
                                fees: '$450.00',
                                firm: 'Alpha Prop',
                                key: 'alpha-funded',
                                net: '-$150.00',
                                netPayouts: '$300.00',
                                stage: 'Funded',
                            },
                        ],
                    })}
                />,
            );
        });
        const title = [...container.querySelectorAll('h3')].find(
            (heading) =>
                heading.textContent ===
                'Dollars per stage (fees of the accounts that reached this stage)',
        );
        const rows = [
            ...(title?.parentElement?.querySelectorAll(':scope tbody tr') ??
                []),
        ].map((tableRow) =>
            [...tableRow.querySelectorAll('td')].map(
                (cell) => cell.textContent,
            ),
        );
        expect(rows).toEqual([
            ['Alpha Prop', 'Purchased', '$450.00', '$300.00', '-$150.00'],
            ['Alpha Prop', 'Funded', '$450.00', '$300.00', '-$150.00'],
        ]);
    });

    it('lists the untested stage gaps of every plan', () => {
        act(() => {
            root.render(
                <FunnelCard
                    model={model({
                        rows: [row({ firm: 'Alpha Prop', key: 'alpha' })],
                        untestedWeaknesses: [
                            {
                                key: 'plan-a-payouts',
                                plan: 'Alpha Prop $50K',
                                text: 'Payouts per paid funded account: -$20.00 per attempt, -$40.00 per month versus the engine; not tested for noise.',
                            },
                        ],
                    })}
                />,
            );
        });
        const items = [
            ...container.querySelectorAll(
                ':scope ul[aria-label="Untested stages by plan"] li',
            ),
        ].map((item) => item.textContent);
        expect(items).toEqual([
            'Alpha Prop $50K: Payouts per paid funded account: -$20.00 per attempt, -$40.00 per month versus the engine; not tested for noise.',
        ]);
    });

    it('says why the diagnostic could not run for a plan', () => {
        act(() => {
            root.render(
                <FunnelCard
                    model={model({
                        diagnosticIssues: [
                            {
                                key: 'plan-a',
                                plan: 'Alpha Prop $50K',
                                text: 'The funnel diagnostic could not be computed: a modeled or realized figure is outside its valid range.',
                            },
                        ],
                        rows: [row({ firm: 'Alpha Prop', key: 'alpha' })],
                    })}
                />,
            );
        });
        expect(container.textContent).toContain(
            'Alpha Prop $50K: The funnel diagnostic could not be computed',
        );
    });
});
