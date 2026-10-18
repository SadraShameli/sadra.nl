import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BankrollCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/BankrollCard';
import {
    type BankrollCardModel,
    BankrollLossRiskKind,
    scaleModelAtBudget,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { ScaleAtMultipleKind } from '~/lib/prop-accounts/bankroll';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

const SCALE_INPUTS: BankrollCardModel['scaleInputs'] = {
    capacityFillCents: 30_000,
    cohortMultiple: { interval: { lower: 1.5, upper: 2.5 }, n: 4, value: 2 },
    planLimitCents: null,
    sampleThresholds: DEFAULT_RULEBOOK.samples,
};

function model(overrides: Partial<BankrollCardModel> = {}): BankrollCardModel {
    return {
        available: '$130.00',
        deposits: '$100.00',
        grownFromText: 'Grown from $100.00 injected.',
        lossRisk: {
            attemptPays: '16.7% (n = 6)',
            attemptsAtBankroll: '6 attempts',
            batchLoss: '35.2% (SE 1.1%)',
            kind: BankrollLossRiskKind.Ready,
            minimumBudget: '$1,200.00',
            minimumBudgetNote: null,
            noPayout: '33.5%',
            sampleNote:
                'Measured from 6 attempts decided within 14.0 days of funding (measured).',
        },
        moneyWeightedReturn: '12.0%',
        reinvestedPayouts: '$30.00',
        scale: scaleModelAtBudget(SCALE_INPUTS, null),
        scaleInputs: SCALE_INPUTS,
        undatedPaidPayoutsCaveat: null,
        withdrawals: '$0.00',
        ...overrides,
    };
}

describe('BankrollCard', () => {
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

    function render(value: BankrollCardModel) {
        act(() => {
            root.render(<BankrollCard model={value} />);
        });
    }

    function typeBudget(text: string) {
        const input = container.querySelector<HTMLInputElement>(
            'input[aria-label="Candidate monthly budget (dollars)"]',
        );
        if (input === null) throw new Error('no candidate budget field');
        act(() => {
            const descriptor = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                'value',
            );
            descriptor?.set?.call(input, text);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    it('shows the realized loss risk with its sample note', () => {
        render(model());
        const text = container.textContent;
        expect(text).toContain('Realized P(an attempt pays)');
        expect(text).toContain('Realized P(net below zero) at 6 attempts');
        expect(text).toContain('16.7% (n = 6)');
        expect(text).toContain('35.2% (SE 1.1%)');
        expect(text).toContain('33.5%');
        expect(text).toContain('$1,200.00');
        expect(text).toContain(
            'Measured from 6 attempts decided within 14.0 days of funding (measured).',
        );
    });

    it('shows why the realized minimum budget is missing', () => {
        render(
            model({
                lossRisk: {
                    attemptPays: '0.0% (n = 4)',
                    attemptsAtBankroll: null,
                    batchLoss: 'n/a',
                    kind: BankrollLossRiskKind.Ready,
                    minimumBudget: 'n/a',
                    minimumBudgetNote:
                        'The minimum budget is not shown: the expected net result is not positive.',
                    noPayout: 'n/a',
                    sampleNote: 'Measured from 4 attempts.',
                },
            }),
        );
        expect(container.textContent).toContain(
            'The minimum budget is not shown: the expected net result is not positive.',
        );
    });

    it('says why the realized loss risk is unavailable', () => {
        render(
            model({
                lossRisk: {
                    kind: BankrollLossRiskKind.Unavailable,
                    reason: 'No attempt cost is recorded yet, so the realized loss risk cannot be computed.',
                },
            }),
        );
        expect(container.textContent).toContain(
            'No attempt cost is recorded yet, so the realized loss risk cannot be computed.',
        );
    });

    it('states injected capital once and shows the reinvested payouts', () => {
        render(model());
        const labels = [...container.querySelectorAll('dt')].map(
            (label) => label.textContent,
        );
        expect(
            labels.filter((label) => label === 'Injected capital'),
        ).toHaveLength(1);
        expect(labels).toContain('Reinvested payouts');
        expect(container.textContent).toContain('Grown from $100.00 injected.');
    });

    it('recomputes the scale line from a candidate monthly budget typed on the card', () => {
        render(model());
        expect(container.textContent).toContain(
            'projected for one fill, not a monthly budget',
        );
        typeBudget('200');
        expect(container.textContent).toContain('projected monthly');
        expect(container.textContent).toContain('your entered monthly budget');
        expect(container.textContent).toContain('$400');
    });

    it('caps a candidate budget above the capacity fill and says so', () => {
        render(model());
        typeBudget('500');
        expect(container.textContent).toContain(
            'Your entered monthly budget is above your daily account capacity fill, so it is capped at $300.',
        );
    });

    it('returns to the fill basis when the candidate budget is cleared', () => {
        render(model());
        typeBudget('200');
        typeBudget('');
        expect(container.textContent).toContain(
            'projected for one fill, not a monthly budget',
        );
    });

    it('lets a candidate budget stand in when no capacity is set but an account has ended', () => {
        const inputs = { ...SCALE_INPUTS, capacityFillCents: null };
        render(
            model({
                scale: scaleModelAtBudget(inputs, null),
                scaleInputs: inputs,
            }),
        );
        expect(container.textContent).toContain(
            'Set your daily account capacity in the rulebook',
        );
        typeBudget('200');
        expect(container.textContent).toContain('projected monthly');
        expect(container.textContent).toContain('$400');
    });

    it('offers no candidate field while no account has ended', () => {
        render(
            model({
                scale: {
                    kind: ScaleAtMultipleKind.Unavailable,
                    reason: 'No account has ended yet, so there is no measured multiple to scale.',
                },
                scaleInputs: { ...SCALE_INPUTS, cohortMultiple: null },
            }),
        );
        expect(
            container.querySelector(
                'input[aria-label="Candidate monthly budget (dollars)"]',
            ),
        ).toBeNull();
        expect(container.textContent).toContain('No account has ended yet');
    });
});
