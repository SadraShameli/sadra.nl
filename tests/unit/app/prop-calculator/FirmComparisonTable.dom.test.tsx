import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const synthetic = vi.hoisted(() => ({ rows: null as null | readonly unknown[] }));

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
import FirmComparisonTable from '~/app/(app)/prop-calculator/_components/FirmComparisonTable';
import {
    RUIN_FIRST_NEEDS_BANKROLL_NOTE,
    RUIN_FIRST_NO_ATTEMPT_NOTE,
    RUIN_FIRST_UNPRICED_NOTE,
} from '~/app/(app)/prop-calculator/_components/objectiveRanking';
import { buildSimInputs } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    ALL_FIRMS,
    dollars,
    NO_PLAN_OPT_INS,
    type Plan,
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

function pickPlan(firm: TradingFirm, targetSize: number): Plan {
    const candidates = rankablePlans(firm.plans, false);
    const sameSize = candidates.filter((p) => p.accountSize === targetSize);
    const best = sameSize.reduce<null | Plan>((current, p) => {
        if (!current) return p;
        return p.profitTarget < current.profitTarget ? p : current;
    }, null);
    if (!best) throw new Error('no plan at the target size');
    return best;
}

describe('FirmComparisonTable $/screen hour column (F-V25, PT-61b)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const state = defaultCalculatorState();
    const firms = [state.firm];
    const baseInputs = buildSimInputs(state);

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(
                <FirmComparisonTable
                    activeFirmId={state.firm.id}
                    baseInputs={baseInputs}
                    firms={firms}
                    planOptIns={NO_PLAN_OPT_INS}
                    targetAccountSize={state.plan.accountSize}
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
            dispatchInput(hoursInput, '5');
        });
        act(() => {
            dispatchInput(accountsInput, '2');
        });
        expect(container.textContent).toContain('$/screen hour');

        const plan = pickPlan(state.firm, state.plan.accountSize);
        const out = simulate({
            ...baseInputs,
            plan,
            trials: Math.min(500, baseInputs.trials),
        });
        const perHour = netPerScreenHour({
            accountsPerSession: 2,
            expectedMonthlyNet: dollars(out.expectedMonthlyNet),
            sessionHoursPerDay: 5,
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
            dispatchInput(hoursInput, '5');
        });
        act(() => {
            dispatchInput(accountsInput, '0.5');
        });
        expect(container.textContent).not.toContain('$/screen hour');
        expect(accountsInput.getAttribute('aria-invalid')).toBe('true');
        expect(container.textContent).toContain('Whole number, at least 1');
    });

    it('rejects a zero accounts-per-session and an hours-per-day of 0', () => {
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
            dispatchInput(accountsInput, '0');
        });
        expect(accountsInput.getAttribute('aria-invalid')).toBe('true');
        act(() => {
            dispatchInput(hoursInput, '0');
        });
        expect(hoursInput.getAttribute('aria-invalid')).toBe('true');
        expect(container.textContent).not.toContain('$/screen hour');
    });

    it('shows a P(no payout) column from the run on every row', () => {
        expect(container.textContent).toContain('P(no payout)');
        const plan = pickPlan(state.firm, state.plan.accountSize);
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

function rowLabels(container: HTMLElement): string[] {
    return [...container.querySelectorAll(':scope tbody tr')].map(
        (row) => row.querySelector(':scope td')?.textContent ?? '',
    );
}

describe('FirmComparisonTable follows and names the objective (PT-83, F-V15, F-V25)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const state = defaultCalculatorState();
    const baseInputs = buildSimInputs({ ...state, trials: COMPARE_TRIALS });
    const candidates = ALL_FIRMS.filter((firm) =>
        rankablePlans(firm.plans, false).some(
            (plan) => plan.accountSize === state.plan.accountSize,
        ),
    ).map((firm) => {
        const plan = pickPlan(firm, state.plan.accountSize);
        return {
            firm,
            out: simulate({ ...baseInputs, plan, trials: COMPARE_TRIALS }),
        };
    });
    const byMonthly = candidates.toSorted(
        (a, b) => b.out.expectedMonthlyNet - a.out.expectedMonthlyNet,
    );
    const byCycle = candidates.toSorted(
        (a, b) => b.out.expectedNet - a.out.expectedNet,
    );
    const compared = [
        ...new Set([
            ...byMonthly.slice(0, 2),
            ...byCycle.slice(0, 2),
            ...candidates.slice(0, 2),
        ]),
    ];

    function namesBy(key: (entry: { out: SimOutputs }) => number): string[] {
        return compared
            .toSorted((a, b) => key(b) - key(a))
            .map((entry) => entry.firm.displayName);
    }

    function render(
        extra: {
            bankrollCents?: null | number;
            objective?: SizingObjective;
        } = {},
    ): void {
        act(() => {
            root.render(
                <FirmComparisonTable
                    activeFirmId={state.firm.id}
                    baseInputs={baseInputs}
                    firms={compared.map((entry) => entry.firm)}
                    planOptIns={NO_PLAN_OPT_INS}
                    targetAccountSize={state.plan.accountSize}
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

    it('compares at least four firms whose monthly and cycle orders differ', () => {
        expect(compared.length).toBeGreaterThanOrEqual(4);
        expect(namesBy((entry) => entry.out.expectedNet)).not.toStrictEqual(
            namesBy((entry) => entry.out.expectedMonthlyNet),
        );
    });

    it('starts sorted by monthly net and names it when no objective is given', () => {
        render();
        expect(rowLabels(container)).toStrictEqual(
            namesBy((entry) => entry.out.expectedMonthlyNet),
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
            namesBy((entry) => entry.out.expectedMonthlyNet),
        );
        render({ objective: SizingObjective.CycleCash });
        expect(rowLabels(container)).toStrictEqual(
            namesBy((entry) => entry.out.expectedNet),
        );
        expect(container.textContent).toContain('Ranked by cycle cash');
        expect(container.textContent).not.toContain('Ranked by monthly net');
    });

    it('shows the cycle net of each firm beside the monthly net and ROI', () => {
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
        const first = compared.find(
            (entry) => entry.firm.displayName === rowLabels(container)[0],
        );
        if (!first) throw new Error('first row firm not found');
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
            namesBy((entry) => entry.out.expectedMonthlyNet),
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
        act(() => {
            dispatchInput(hoursInput, '');
        });
        expect(select.disabled).toBe(true);
        expect(rowLabels(container)).toStrictEqual(all);
    });
});

describe('FirmComparisonTable ranks RuinFirst by the batch loss risk at a known bankroll (PT-83 review)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const state = defaultCalculatorState();
    const baseInputs = buildSimInputs({ ...state, trials: COMPARE_TRIALS });
    const seenNames = new Set<string>();
    const firms = ALL_FIRMS.filter((firm) => {
        if (
            seenNames.has(firm.displayName) ||
            rankablePlans(firm.plans, false).length === 0
        ) {
            return false;
        }
        seenNames.add(firm.displayName);
        return true;
    }).slice(0, RUIN_FIXTURE_SPECS.length);
    const baseOut = simulate({
        ...baseInputs,
        plan: state.plan,
        trials: COMPARE_TRIALS,
    });
    const nameOf = new Map(
        RUIN_FIXTURE_SPECS.map((spec, index) => [
            spec.key,
            firms[index]?.displayName ?? '',
        ]),
    );

    function namesOf(keys: readonly RuinFixtureKey[]): string[] {
        return keys.map((key) => nameOf.get(key) ?? '');
    }

    function useRows(costPerAttempt?: number): void {
        synthetic.rows = RUIN_FIXTURE_SPECS.map((spec, index) => {
            const firm = firms[index];
            if (!firm) throw new Error('not enough firms');
            return {
                firm,
                out: {
                    ...ruinFixtureOut(baseOut, spec),
                    ...(costPerAttempt !== undefined && { costPerAttempt }),
                },
                plan: pickPlan(firm, state.plan.accountSize),
                score: 3,
            };
        });
    }

    function render(
        bankrollCents: null | number,
        objective: SizingObjective,
    ): void {
        act(() => {
            root.render(
                <FirmComparisonTable
                    activeFirmId={state.firm.id}
                    bankrollCents={bankrollCents}
                    baseInputs={baseInputs}
                    firms={firms}
                    objective={objective}
                    planOptIns={NO_PLAN_OPT_INS}
                    targetAccountSize={state.plan.accountSize}
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

    it('has five distinct firms whose ruin first order differs from the monthly net order', () => {
        expect(firms).toHaveLength(RUIN_FIXTURE_SPECS.length);
        expect(RUIN_FIXTURE_RUIN_FIRST_ORDER).not.toStrictEqual(
            RUIN_FIXTURE_MONTHLY_ORDER,
        );
    });

    it('orders by monthly net under MonthlyNet with the same rows', () => {
        render(RUIN_FIXTURE_BANKROLL_CENTS, SizingObjective.MonthlyNet);
        expect(rowLabels(container)).toStrictEqual(
            namesOf(RUIN_FIXTURE_MONTHLY_ORDER),
        );
    });

    it('orders by lower loss risk, an unpriced firm after the priced ones, a non-positive EV firm last', () => {
        render(RUIN_FIXTURE_BANKROLL_CENTS, SizingObjective.RuinFirst);
        expect(rowLabels(container)).toStrictEqual(
            namesOf(RUIN_FIXTURE_RUIN_FIRST_ORDER),
        );
        expect(container.textContent).toContain('Ranked by ruin first');
        expect(container.textContent).not.toContain('Ranked by monthly net');
    });

    it('falls back to monthly net with the no-attempt note when the bankroll buys no attempt of any plan', () => {
        render(100, SizingObjective.RuinFirst);
        expect(rowLabels(container)).toStrictEqual(
            namesOf(RUIN_FIXTURE_MONTHLY_ORDER),
        );
        expect(container.textContent).toContain(RUIN_FIRST_NO_ATTEMPT_NOTE);
        expect(container.textContent).toContain('Ranked by monthly net');
    });

    it('says the risk could not be priced, not that no attempt is affordable, for a bankroll far above the plan cost', () => {
        useRows(1);
        render(5_000_000_000, SizingObjective.RuinFirst);
        expect(container.textContent).toContain(RUIN_FIRST_UNPRICED_NOTE);
        expect(container.textContent).not.toContain(RUIN_FIRST_NO_ATTEMPT_NOTE);
    });

    it('does not show the needs-a-bankroll note while the bankroll is still loading', () => {
        act(() => {
            root.render(
                <FirmComparisonTable
                    activeFirmId={state.firm.id}
                    baseInputs={baseInputs}
                    firms={firms}
                    isBankrollPending
                    objective={SizingObjective.RuinFirst}
                    planOptIns={NO_PLAN_OPT_INS}
                    targetAccountSize={state.plan.accountSize}
                />,
            );
        });
        expect(container.textContent).not.toContain(
            RUIN_FIRST_NEEDS_BANKROLL_NOTE,
        );
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
        expect(container.textContent).toContain('showing 3 of 5');
        act(() => {
            dispatchInput(hoursInput, '');
        });
        expect(select.value).toBe('all');
        expect(rowLabels(container)).toHaveLength(5);
        expect(container.textContent).not.toContain('showing');
        act(() => {
            dispatchInput(hoursInput, '4');
        });
        expect(select.value).toBe('all');
        expect(rowLabels(container)).toHaveLength(5);
    });
});
