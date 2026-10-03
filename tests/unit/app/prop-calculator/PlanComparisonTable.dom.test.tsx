import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const synthetic = vi.hoisted(() => ({
    rows: null as null | readonly unknown[],
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/useDebouncedSimulation',
    () => {
        const computed = new Map<string, unknown>();
        return {
            useDebouncedComputation: (
                id: unknown,
                key: unknown,
                _debounceMs: unknown,
                compute: () => unknown,
            ) => {
                if (synthetic.rows !== null) {
                    return {
                        error: null,
                        pending: false,
                        result: synthetic.rows,
                    };
                }
                const cacheKey = `${String(id)}:${String(key)}`;
                if (!computed.has(cacheKey)) {
                    computed.set(cacheKey, compute());
                }
                return {
                    error: null,
                    pending: false,
                    result: computed.get(cacheKey),
                };
            },
        };
    },
);

vi.mock('~/components/ui/InfoPopover', () => ({
    default: () => null,
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/compare',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock(
    '~/app/(app)/prop-calculator/_components/CalculatorProvider',
    async () => {
        const { defaultCalculatorState } =
            await import('~/app/(app)/prop-calculator/_components/calculatorReducer');
        return {
            useCalculatorActions: () => ({ applyState: vi.fn() }),
            useCalculatorInputs: () => ({ state: defaultCalculatorState() }),
        };
    },
);

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    RUIN_FIRST_NEEDS_BANKROLL_NOTE,
    RUIN_FIRST_NO_ATTEMPT_NOTE,
    RUIN_FIRST_UNPRICED_NOTE,
} from '~/app/(app)/prop-calculator/_components/objectiveRanking';
import PlanComparisonTable from '~/app/(app)/prop-calculator/_components/PlanComparisonTable';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    ALL_FIRMS,
    dollars,
    NO_PLAN_OPT_INS,
    rankablePlans,
    type SimOutputs,
    simulate,
    type TradingFirm,
} from '~/lib/prop-calculator';
import { SizingObjective } from '~/lib/prop-calculator/advisor';
import { netPerScreenHour } from '~/lib/prop-calculator/economics';

import {
    RUIN_FIXTURE_BANKROLL_CENTS,
    RUIN_FIXTURE_MONTHLY_ORDER,
    RUIN_FIXTURE_RUIN_FIRST_ORDER,
    RUIN_FIXTURE_SPECS,
    type RuinFixtureKey,
    ruinFixtureOut,
} from './ruinFirstRowFixtures';

function dispatchInput(input: HTMLInputElement, value: string): void {
    Reflect.set(HTMLInputElement.prototype, 'value', value, input);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('PlanComparisonTable $/screen hour column (F-V25, PT-61b)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const state = defaultCalculatorState();
    const baseInputs = buildSimInputs(state);

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(
                <PlanComparisonTable
                    activePlan={state.plan}
                    baseInputs={baseInputs}
                    firm={state.firm}
                    planOptIns={NO_PLAN_OPT_INS}
                />,
            );
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
    });

    it('shows no $/screen hour column until both inputs are set', () => {
        expect(container.textContent).not.toContain('$/screen hour');
    });

    it('shows the column once hours/day and accounts/session are both set', () => {
        const hoursInput = container.querySelector<HTMLInputElement>(
            'input[aria-label="Hours per day"]',
        );
        const accountsInput = container.querySelector<HTMLInputElement>(
            'input[aria-label="Accounts per session"]',
        );
        if (!hoursInput || !accountsInput) {
            throw new Error('screen-hour inputs missing');
        }
        act(() => {
            dispatchInput(hoursInput, '4');
        });
        act(() => {
            dispatchInput(accountsInput, '3');
        });
        expect(container.textContent).toContain('$/screen hour');

        const plan = rankablePlans(state.firm.plans, false)[0];
        if (!plan) throw new Error('no plan to compare against');
        const out = simulate({
            ...baseInputs,
            plan,
            trials: Math.min(500, baseInputs.trials),
        });
        const perHour = netPerScreenHour({
            accountsPerSession: 3,
            expectedMonthlyNet: dollars(out.expectedMonthlyNet),
            sessionHoursPerDay: 4,
        });
        if (perHour.value === null) throw new Error('expected a value');
        expect(container.textContent).toContain(
            formatCurrency(perHour.value.value),
        );
    });

    it('rejects 0.5 accounts per session: no column, an inline hint (PT-61d, F-V22)', () => {
        const hoursInput = container.querySelector<HTMLInputElement>(
            'input[aria-label="Hours per day"]',
        );
        const accountsInput = container.querySelector<HTMLInputElement>(
            'input[aria-label="Accounts per session"]',
        );
        if (!hoursInput || !accountsInput) {
            throw new Error('screen-hour inputs missing');
        }
        act(() => {
            dispatchInput(hoursInput, '4');
        });
        act(() => {
            dispatchInput(accountsInput, '0.5');
        });
        expect(container.textContent).not.toContain('$/screen hour');
        expect(accountsInput.getAttribute('aria-invalid')).toBe('true');
        expect(container.textContent).toContain('Whole number, at least 1');
    });

    it('shows a P(no payout) column from the run on every row', () => {
        expect(container.textContent).toContain('P(no payout)');
        const plan = rankablePlans(state.firm.plans, false)[0];
        if (!plan) throw new Error('no plan to compare against');
        const out = simulate({
            ...baseInputs,
            plan,
            trials: Math.min(500, baseInputs.trials),
        });
        const noPayout = out.fundedPayoutCountDistribution[0];
        if (noPayout === undefined) {
            throw new Error('expected a funded payout distribution');
        }
        expect(container.textContent).toContain(formatPercent(noPayout));
    });
});

const COMPARE_TRIALS = 80;
const CANDIDATE_ACCOUNT_SIZE = 50_000;

function rowLabels(container: HTMLElement): string[] {
    return [...container.querySelectorAll(':scope tbody tr')].map(
        (row) => row.querySelector(':scope td')?.textContent ?? '',
    );
}

describe('PlanComparisonTable follows and names the objective (PT-83, F-V15, F-V25)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const state = defaultCalculatorState();
    const baseInputs = buildSimInputs({ ...state, trials: COMPARE_TRIALS });
    const candidates = ALL_FIRMS.flatMap((firm) =>
        rankablePlans(firm.plans, false).filter(
            (plan) => plan.accountSize === CANDIDATE_ACCOUNT_SIZE,
        ),
    ).map((plan) => ({
        out: simulate({ ...baseInputs, plan, trials: COMPARE_TRIALS }),
        plan,
    }));
    const byMonthly = candidates.toSorted(
        (a, b) => b.out.expectedMonthlyNet - a.out.expectedMonthlyNet,
    );
    const byCycle = candidates.toSorted(
        (a, b) => b.out.expectedNet - a.out.expectedNet,
    );
    const chosen = new Set([
        ...byMonthly.slice(0, 2),
        ...byCycle.slice(0, 2),
        ...candidates.slice(0, 2),
    ]);
    const outputs = [...chosen];
    const comparedFirm: TradingFirm = Object.assign(
        Object.create(Object.getPrototypeOf(state.firm) as object) as object,
        state.firm,
        { plans: outputs.map((entry) => entry.plan) },
    );

    function labelsBy(key: (entry: { out: SimOutputs }) => number): string[] {
        return outputs
            .toSorted((a, b) => key(b) - key(a))
            .map((entry) => entry.plan.label);
    }

    function render(
        extra: {
            bankrollCents?: null | number;
            objective?: SizingObjective;
        } = {},
    ): void {
        act(() => {
            root.render(
                <PlanComparisonTable
                    activePlan={state.plan}
                    baseInputs={baseInputs}
                    firm={comparedFirm}
                    planOptIns={NO_PLAN_OPT_INS}
                    {...extra}
                />,
            );
        });
    }

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
        container.remove();
    });

    it('compares at least four plans whose monthly and cycle orders differ', () => {
        expect(outputs.length).toBeGreaterThanOrEqual(4);
        expect(labelsBy((entry) => entry.out.expectedNet)).not.toStrictEqual(
            labelsBy((entry) => entry.out.expectedMonthlyNet),
        );
    });

    it('starts sorted by monthly net and names it when no objective is given', () => {
        render();
        expect(rowLabels(container)).toStrictEqual(
            labelsBy((entry) => entry.out.expectedMonthlyNet),
        );
        expect(container.textContent).toContain('Ranked by monthly net');
    });

    it('says that a column header click re-sorts the ranked rows, so the ranking label is not read as the shown order', () => {
        render();
        expect(container.textContent).toContain(
            'a column header click re-sorts the rows shown',
        );
    });

    it('reorders by cycle net under CycleCash and names it in the heading', () => {
        render({ objective: SizingObjective.MonthlyNet });
        expect(rowLabels(container)).toStrictEqual(
            labelsBy((entry) => entry.out.expectedMonthlyNet),
        );
        render({ objective: SizingObjective.CycleCash });
        expect(rowLabels(container)).toStrictEqual(
            labelsBy((entry) => entry.out.expectedNet),
        );
        expect(container.textContent).toContain('Ranked by cycle cash');
        expect(container.textContent).not.toContain('Ranked by monthly net');
    });

    it('shows the cycle net of each plan beside the monthly net and ROI', () => {
        render();
        const headers = [...container.querySelectorAll(':scope th')].map(
            (header) => header.textContent,
        );
        const monthlyIndex = headers.findIndex((text) =>
            text.includes('Monthly net'),
        );
        expect(monthlyIndex).toBeGreaterThanOrEqual(0);
        expect(headers[monthlyIndex + 1]).toContain('Cycle net');
        expect(headers[monthlyIndex + 2]).toContain('ROI');
        const first = outputs.find(
            (entry) => entry.plan.label === rowLabels(container)[0],
        );
        if (!first) throw new Error('first row plan not found');
        const cells = [
            ...(container
                .querySelector(':scope tbody tr')
                ?.querySelectorAll(':scope td') ?? []),
        ].map((cell) => cell.textContent);
        expect(cells[monthlyIndex + 1]).toBe(
            formatCurrency(first.out.expectedNet),
        );
    });

    it('keeps monthly net and shows the note for RuinFirst without a bankroll', () => {
        render({ objective: SizingObjective.RuinFirst });
        expect(rowLabels(container)).toStrictEqual(
            labelsBy((entry) => entry.out.expectedMonthlyNet),
        );
        expect(container.textContent).toContain(RUIN_FIRST_NEEDS_BANKROLL_NOTE);
        expect(container.textContent).toContain('Ranked by monthly net');
    });

    it('disables the top select until both hours inputs are set, then limits the rows', () => {
        render();
        const select = container.querySelector<HTMLSelectElement>(
            'select[aria-label="Show top"]',
        );
        if (!select) throw new Error('top select missing');
        expect(select.disabled).toBe(true);
        expect(rowLabels(container).length).toBeGreaterThan(3);
        const hoursInput = container.querySelector<HTMLInputElement>(
            'input[aria-label="Hours per day"]',
        );
        const accountsInput = container.querySelector<HTMLInputElement>(
            'input[aria-label="Accounts per session"]',
        );
        if (!hoursInput || !accountsInput) throw new Error('inputs missing');
        act(() => {
            dispatchInput(hoursInput, '4');
        });
        expect(select.disabled).toBe(true);
        act(() => {
            dispatchInput(accountsInput, '2');
        });
        expect(select.disabled).toBe(false);
        const all = rowLabels(container);
        act(() => {
            Reflect.set(HTMLSelectElement.prototype, 'value', '3', select);
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(rowLabels(container)).toStrictEqual(all.slice(0, 3));
        expect(
            [...select.options].map((option) => option.textContent),
        ).toStrictEqual(['Top 3', 'Top 5', 'Top 10', 'All']);
        act(() => {
            dispatchInput(accountsInput, '');
        });
        expect(select.disabled).toBe(true);
        expect(rowLabels(container)).toStrictEqual(all);
    });
});

describe('PlanComparisonTable ranks RuinFirst by the batch loss risk at a known bankroll (PT-83 review)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const state = defaultCalculatorState();
    const baseInputs = buildSimInputs({ ...state, trials: COMPARE_TRIALS });
    const seenLabels = new Set<string>();
    const plans = ALL_FIRMS.flatMap((firm) => rankablePlans(firm.plans, false))
        .filter((plan) => {
            if (seenLabels.has(plan.label)) return false;
            seenLabels.add(plan.label);
            return true;
        })
        .slice(0, RUIN_FIXTURE_SPECS.length);
    const baseOut = simulate({
        ...baseInputs,
        plan: state.plan,
        trials: COMPARE_TRIALS,
    });
    const labelOf = new Map(
        RUIN_FIXTURE_SPECS.map((spec, index) => [
            spec.key,
            plans[index]?.label ?? '',
        ]),
    );

    function labelsOf(keys: readonly RuinFixtureKey[]): string[] {
        return keys.map((key) => labelOf.get(key) ?? '');
    }

    function useRows(costPerAttempt?: number): void {
        synthetic.rows = RUIN_FIXTURE_SPECS.map((spec, index) => ({
            isBest: false,
            out: {
                ...ruinFixtureOut(baseOut, spec),
                ...(costPerAttempt !== undefined && { costPerAttempt }),
            },
            plan: plans[index],
            ptdd: 1,
            score: 3,
        }));
    }

    function render(
        bankrollCents: null | number,
        objective: SizingObjective,
    ): void {
        act(() => {
            root.render(
                <PlanComparisonTable
                    activePlan={state.plan}
                    bankrollCents={bankrollCents}
                    baseInputs={baseInputs}
                    firm={state.firm}
                    objective={objective}
                    planOptIns={NO_PLAN_OPT_INS}
                />,
            );
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        useRows();
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        synthetic.rows = null;
    });

    it('has five distinct plans whose ruin first order differs from the monthly net order', () => {
        expect(plans).toHaveLength(RUIN_FIXTURE_SPECS.length);
        expect(RUIN_FIXTURE_RUIN_FIRST_ORDER).not.toStrictEqual(
            RUIN_FIXTURE_MONTHLY_ORDER,
        );
        expect(
            RUIN_FIXTURE_SPECS.toSorted(
                (a, b) => b.monthlyNet - a.monthlyNet,
            ).map((spec) => spec.key),
        ).toStrictEqual(RUIN_FIXTURE_MONTHLY_ORDER);
    });

    it('orders by monthly net under MonthlyNet with the same rows', () => {
        render(RUIN_FIXTURE_BANKROLL_CENTS, SizingObjective.MonthlyNet);
        expect(rowLabels(container)).toStrictEqual(
            labelsOf(RUIN_FIXTURE_MONTHLY_ORDER),
        );
    });

    it('orders by lower loss risk, an unpriced plan after the priced ones, a non-positive EV plan last', () => {
        render(RUIN_FIXTURE_BANKROLL_CENTS, SizingObjective.RuinFirst);
        expect(rowLabels(container)).toStrictEqual(
            labelsOf(RUIN_FIXTURE_RUIN_FIRST_ORDER),
        );
        expect(container.textContent).toContain('Ranked by ruin first');
        expect(container.textContent).not.toContain('Ranked by monthly net');
    });

    it('falls back to monthly net with the no-attempt note when the bankroll buys no attempt of any plan', () => {
        render(100, SizingObjective.RuinFirst);
        expect(rowLabels(container)).toStrictEqual(
            labelsOf(RUIN_FIXTURE_MONTHLY_ORDER),
        );
        expect(container.textContent).toContain(RUIN_FIRST_NO_ATTEMPT_NOTE);
        expect(container.textContent).toContain('Ranked by monthly net');
    });

    it('says the risk could not be priced, not that no attempt is affordable, for a bankroll far above the plan cost', () => {
        useRows(1);
        render(5_000_000_000, SizingObjective.RuinFirst);
        expect(container.textContent).toContain(RUIN_FIRST_UNPRICED_NOTE);
        expect(container.textContent).not.toContain(RUIN_FIRST_NO_ATTEMPT_NOTE);
        expect(container.textContent).toContain('Ranked by monthly net');
    });

    it('labels the stars as the monthly net score', () => {
        render(null, SizingObjective.CycleCash);
        const headers = [...container.querySelectorAll(':scope th')].map(
            (header) => header.textContent,
        );
        expect(headers.some((text) => text.includes('Monthly net score'))).toBe(
            true,
        );
    });

    it('resets the top select to All and shows every row again when an hours input is cleared', () => {
        render(null, SizingObjective.MonthlyNet);
        const select = container.querySelector<HTMLSelectElement>(
            'select[aria-label="Show top"]',
        );
        const hoursInput = container.querySelector<HTMLInputElement>(
            'input[aria-label="Hours per day"]',
        );
        const accountsInput = container.querySelector<HTMLInputElement>(
            'input[aria-label="Accounts per session"]',
        );
        if (!select || !hoursInput || !accountsInput) {
            throw new Error('controls missing');
        }
        act(() => {
            dispatchInput(hoursInput, '4');
        });
        act(() => {
            dispatchInput(accountsInput, '2');
        });
        act(() => {
            Reflect.set(HTMLSelectElement.prototype, 'value', '3', select);
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(rowLabels(container)).toHaveLength(3);
        expect(container.textContent).toContain('showing 3 of 5 plans');
        act(() => {
            dispatchInput(hoursInput, '');
        });
        expect(select.value).toBe('all');
        expect(rowLabels(container)).toHaveLength(5);
        expect(container.textContent).toContain('5 plans');
        expect(container.textContent).not.toContain('showing');
        act(() => {
            dispatchInput(hoursInput, '4');
        });
        expect(select.value).toBe('all');
        expect(rowLabels(container)).toHaveLength(5);
    });
});
