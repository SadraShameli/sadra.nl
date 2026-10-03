import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AttemptEconomicsCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/AttemptEconomicsCard';
import { type AttemptEconomicsCardModel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';

type Row = AttemptEconomicsCardModel['rows'][number];

function row(overrides: Partial<Row> = {}): Row {
    return {
        attemptCost: '$150.00',
        attempts: '8',
        averagePayout: '$500.00, n = 2',
        breakevenPassRate: '30.0%',
        formula:
            'Pass rate 25.0% x funded value $500.00 - attempt cost $150.00 = -$25.00 per attempt',
        fundedValue: '$500.00, n = 2',
        fundedValueToAttemptCost: 'funded value / attempt cost; net 2.33:1',
        key: 'plan-a',
        marginAboveBreakeven: 'No',
        modeledEvPerAttempt: '$55.00',
        modeledFundedValue: '$900.00',
        modeledPassRate: '30.0%',
        modeledPayoutRate: '40.0%',
        modeledPayoutsPerPaidFunded: '3.75',
        passRate: '25.0% (n = 8)',
        payoutRate: '100.0% (n = 2)',
        payoutsPerPaidFunded: '1.00, n = 2',
        plan: 'Alpha Prop $50K',
        realizedEvPerAttempt: '-$25.00',
        ...overrides,
    };
}

describe('AttemptEconomicsCard', () => {
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

    function render(rows: readonly Row[]) {
        act(() => {
            root.render(
                <AttemptEconomicsCard
                    model={{ disclosures: [], horizonDays: 365, rows }}
                />,
            );
        });
    }

    it('shows realized funded value over attempt cost with its label', () => {
        render([row()]);
        const headers = [...container.querySelectorAll(':scope thead th')].map(
            (header) => header.textContent,
        );
        expect(headers).toContain('Funded value / attempt cost');
        expect(container.textContent).toContain(
            'funded value / attempt cost; net 2.33:1',
        );
    });

    it('prints the filled formula under each plan and the sample size of every factor', () => {
        render([row()]);
        expect(container.textContent).toContain(
            'Alpha Prop $50K: Pass rate 25.0% x funded value $500.00 - attempt cost $150.00 = -$25.00 per attempt',
        );
        expect(container.textContent).toContain('1.00, n = 2');
        expect(container.textContent).toContain('$500.00, n = 2');
        expect(container.textContent).toContain('25.0% (n = 8)');
    });

    it('prints n/a for a plan with no fully observed funded cohort', () => {
        render([row({ formula: 'n/a', fundedValueToAttemptCost: 'n/a' })]);
        expect(container.textContent).not.toContain('Alpha Prop $50K: n/a');
    });
});
