import type * as Recharts from 'recharts';

import { act, cloneElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('recharts', async (importOriginal) => {
    const actual = await importOriginal<typeof Recharts>();
    return {
        ...actual,
        ResponsiveContainer: ({ children }: { children: ReactElement }) =>
            cloneElement(children, { height: 200, width: 400 } as never),
    };
});

import { FundedPayoutsCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/FundedPayoutsCard';
import { type FundedPayoutsCardModel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';

import { infoText } from '../infoPopover';
import { inlineWarningNotes, warningNotes } from './warningNotes';

type Row = FundedPayoutsCardModel['rows'][number];

function model(rows: readonly Row[]): FundedPayoutsCardModel {
    return {
        disclosures: [
            'A funded account still younger than the horizon is listed open and left out of the distribution.',
        ],
        horizonDays: 365,
        payoutCountCap: 10,
        rows,
    };
}

function row(overrides: Partial<Row> = {}): Row {
    return {
        counts: ['0', '4', '0', '0', '0', '0', '0', '0', '0', '0', '0'],
        fundedValueFlag: null,
        key: 'plan-a',
        modeledCounts: ['60.0%', '20.0%', '10.0%'],
        modeledFundedValue: '$900.00',
        modeledProbabilities: [0.6, 0.2, 0.1, 0.05, 0.03, 0.02, 0, 0, 0, 0, 0],
        modeledUnavailableReason: null,
        openAccounts: '1',
        plan: 'Alpha Prop $50K',
        realizedFundedValue: '$100.00, n = 4',
        realizedProbabilities: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ...overrides,
    };
}

describe('FundedPayoutsCard', () => {
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

    function render(value: FundedPayoutsCardModel) {
        act(() => {
            root.render(<FundedPayoutsCard model={value} />);
        });
    }

    it('draws the realized probabilities beside the modeled distribution for each plan', () => {
        render(model([row()]));
        const text = container.textContent;
        expect(text).toContain('# payouts per funded account, realized');
        expect(text).toContain('# payouts per funded account, modeled');
        expect(
            container.querySelectorAll(
                '.app-prop-calculator__accounts-passed-chart',
            ),
        ).toHaveLength(2);
    });

    it('draws only the modeled distribution while no funded account is fully observed, and says so', () => {
        render(model([row({ realizedProbabilities: [] })]));
        expect(container.textContent).toContain(
            'Realized distribution: no fully observed funded account yet.',
        );
        expect(
            container.querySelectorAll(
                '.app-prop-calculator__accounts-passed-chart',
            ),
        ).toHaveLength(1);
    });

    it('draws the realized distribution beside a placeholder while the engine has not answered', () => {
        render(
            model([
                row({
                    modeledFundedValue: 'Pending',
                    modeledProbabilities: null,
                }),
            ]),
        );
        expect(
            container.querySelectorAll(
                '.app-prop-calculator__accounts-passed-chart',
            ),
        ).toHaveLength(1);
        expect(
            container.querySelector('[data-slot="skeleton"]'),
        ).not.toBeNull();
    });

    it('draws only the realized distribution and says the engine has none when it answered without one', () => {
        render(model([row({ modeledProbabilities: null })]));
        expect(container.textContent).toContain(
            'Modeled distribution: the engine has none for this plan.',
        );
        expect(
            container.querySelectorAll(
                '.app-prop-calculator__accounts-passed-chart',
            ),
        ).toHaveLength(1);
    });

    it('says the modeled distribution could not be computed, with the reason, when the engine failed or refused the plan', () => {
        render(
            model([
                row({
                    modeledCounts: null,
                    modeledFundedValue: 'Not available',
                    modeledProbabilities: null,
                    modeledUnavailableReason:
                        'Web workers are not available in this browser.',
                }),
            ]),
        );
        expect(container.textContent).not.toContain(
            'the engine has none for this plan',
        );
        expect(container.textContent).toContain('Modeled distribution:');
        expect(infoText(container, 'Not available')).toContain(
            'Web workers are not available in this browser.',
        );
    });

    it('keeps the counts table with the too young column and the disclosures', () => {
        render(model([row()]));
        const headers = [...container.querySelectorAll(':scope thead th')].map(
            (header) => header.textContent,
        );
        expect(headers).toContain('Too young');
        expect(headers).toContain('10+');
        expect(infoText(container, 'Payouts per funded account')).toContain(
            'listed open',
        );
    });

    it('starts the funded value flag on its own line under the modeled figure', () => {
        render(
            model([
                row({
                    fundedValueFlag:
                        'The modeled value is above the realized value by more than its spread.',
                }),
            ]),
        );
        const table = container.querySelector('table');
        if (table === null) throw new Error('no funded payouts table');
        expect(warningNotes(table)).toHaveLength(1);
        expect(inlineWarningNotes(table)).toEqual([]);
    });

    it('tells the modeled share row apart by its label, never by a muted tint', () => {
        render(model([row()]));
        const rows = [...container.querySelectorAll(':scope tbody tr')];
        const modeled = rows.find((line) =>
            line.textContent.includes('(modeled share)'),
        );
        if (modeled === undefined) throw new Error('no modeled share row');
        const tinted = rows.flatMap((line) => [
            line,
            ...line.querySelectorAll('*'),
        ]);
        expect(
            tinted.filter((node) =>
                node.classList.contains('text-muted-foreground'),
            ),
        ).toEqual([]);
    });
});
