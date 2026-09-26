import { describe, expect, it } from 'vitest';

import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    DAY_STOP_KIND_LABELS,
    DayStopRuleStyle,
    describeDayStopRule,
} from '~/app/(app)/prop-calculator/_components/describeDayStopRule';
import {
    describeNonDefaultRungSizing,
    InputsSummaryField,
    inputsSummaryRows,
} from '~/app/(app)/prop-calculator/_components/inputsSummaryRows';
import {
    RUNG_SIZING_LABELS,
    RUNG_SIZING_OPTIONS,
    RUNG_SIZING_OUTCOMES,
} from '~/app/(app)/prop-calculator/_components/rungSizingLabels';
import {
    type CalculatorState,
    SizingMode,
} from '~/app/(app)/prop-calculator/_components/types';
import {
    formatCurrency,
    formatDays,
    formatPercent,
    formatRatio,
} from '~/lib/format';
import { describePlanOptIn, PlanOptIn } from '~/lib/prop-accounts';
import {
    type DayStopRule,
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    RungSizing,
} from '~/lib/prop-calculator';

function valueOf(state: CalculatorState, field: InputsSummaryField): string {
    const row = inputsSummaryRows(state).find((r) => r.field === field);
    if (!row) throw new Error(`missing row ${field}`);
    return row.value;
}

describe('inputsSummaryRows', () => {
    it('lists firm, plan, opt-ins, winrate, RR, trades per day, risk and horizon in order', () => {
        const rows = inputsSummaryRows(defaultCalculatorState());
        expect(rows.map((row) => row.field)).toEqual([
            InputsSummaryField.Firm,
            InputsSummaryField.Plan,
            InputsSummaryField.OptIns,
            InputsSummaryField.Winrate,
            InputsSummaryField.RewardToRisk,
            InputsSummaryField.TradesPerDay,
            InputsSummaryField.Risk,
            InputsSummaryField.FundedHorizon,
        ]);
        for (const row of rows) {
            expect(row.label.trim().length).toBeGreaterThan(0);
            expect(row.value.trim().length).toBeGreaterThan(0);
        }
    });

    it('shows the firm display name and the plan label', () => {
        const state = defaultCalculatorState();
        expect(valueOf(state, InputsSummaryField.Firm)).toBe(
            state.firm.displayName,
        );
        expect(valueOf(state, InputsSummaryField.Plan)).toBe(state.plan.label);
    });

    it('formats winrate, RR, trades per day and horizon with the shared formatters', () => {
        const state: CalculatorState = {
            ...defaultCalculatorState(),
            fundedHorizonDays: 123,
            rrRatio: 2.75,
            tradesPerDay: 3,
            winrate: 0.437,
        };
        expect(valueOf(state, InputsSummaryField.Winrate)).toBe(
            formatPercent(0.437),
        );
        expect(valueOf(state, InputsSummaryField.RewardToRisk)).toBe(
            formatRatio(2.75),
        );
        expect(valueOf(state, InputsSummaryField.TradesPerDay)).toBe('3');
        expect(valueOf(state, InputsSummaryField.FundedHorizon)).toBe(
            formatDays(123),
        );
    });

    it('shows dollar risk in dollar mode', () => {
        const state: CalculatorState = {
            ...defaultCalculatorState(),
            riskDollars: 317,
            riskPercent: 1.5,
            sizingMode: SizingMode.Dollar,
        };
        const value = valueOf(state, InputsSummaryField.Risk);
        expect(value).toContain(formatCurrency(317));
        expect(value).not.toContain('%');
    });

    it('shows percent risk and its dollar amount in percent mode', () => {
        const state: CalculatorState = {
            ...defaultCalculatorState(),
            riskDollars: 317,
            riskPercent: 1.5,
            sizingMode: SizingMode.Percent,
        };
        const value = valueOf(state, InputsSummaryField.Risk);
        expect(value).toContain(formatPercent(0.015, 2));
        expect(value).toContain(
            formatCurrency((state.plan.accountSize * 1.5) / 100),
        );
        expect(value).not.toContain(formatCurrency(317));
    });

    it('says none when no opt-in is taken', () => {
        const state: CalculatorState = {
            ...defaultCalculatorState(),
            takesFundedReset: false,
            takesOneTimeEarlyWithdrawal: false,
        };
        expect(valueOf(state, InputsSummaryField.OptIns)).toBe('None');
    });

    it('lists each taken opt-in by its shared label', () => {
        const state: CalculatorState = {
            ...defaultCalculatorState(),
            takesFundedReset: true,
            takesOneTimeEarlyWithdrawal: true,
        };
        const value = valueOf(state, InputsSummaryField.OptIns);
        expect(value).toContain(describePlanOptIn(PlanOptIn.FundedReset));
        expect(value).toContain(
            describePlanOptIn(PlanOptIn.OneTimeEarlyWithdrawal),
        );

        const onlyReset = valueOf(
            { ...state, takesOneTimeEarlyWithdrawal: false },
            InputsSummaryField.OptIns,
        );
        expect(onlyReset).toContain(describePlanOptIn(PlanOptIn.FundedReset));
        expect(onlyReset).not.toContain(
            describePlanOptIn(PlanOptIn.OneTimeEarlyWithdrawal),
        );
    });
});

describe('describeDayStopRule', () => {
    it.each<[DayStopRule, string, string]>([
        [
            { k: 2, kind: DayStopRuleKind.AfterKLosses },
            'Stop 2L',
            'stops after 2 losses',
        ],
        [
            { k: 1, kind: DayStopRuleKind.AfterKLosses },
            'Stop 1L',
            'stops after 1 loss',
        ],
        [
            { dollars: 750, kind: DayStopRuleKind.AfterTarget },
            'Stop $750',
            `stops at ${formatCurrency(750)} of profit`,
        ],
        [
            { kind: DayStopRuleKind.DayGreen },
            'Stop when green',
            'stops once the day is green',
        ],
        [
            { kind: DayStopRuleKind.FirstWin },
            'Stop on win',
            'stops after the first win',
        ],
        [{ kind: DayStopRuleKind.None }, 'Take all', 'no day stop'],
    ])('describes %o compactly and in prose', (rule, compact, prose) => {
        expect(describeDayStopRule(rule, DayStopRuleStyle.Compact)).toBe(
            compact,
        );
        expect(describeDayStopRule(rule, DayStopRuleStyle.Prose)).toBe(prose);
    });

    it('labels every stop rule kind for the picker, in the enum order', () => {
        expect(Object.keys(DAY_STOP_KIND_LABELS)).toEqual(
            Object.values(DayStopRuleKind),
        );
        expect(DAY_STOP_KIND_LABELS).toEqual({
            [DayStopRuleKind.AfterKLosses]: 'Stop after K losses',
            [DayStopRuleKind.AfterTarget]: 'Stop after $ target',
            [DayStopRuleKind.DayGreen]: 'Stop when day is green',
            [DayStopRuleKind.FirstWin]: 'Stop after first win',
            [DayStopRuleKind.None]: 'No stop',
        });
    });
});

describe('the rung sizing labels', () => {
    it('offers every rung sizing, in the enum order, each with a label and an outcome', () => {
        expect(RUNG_SIZING_OPTIONS).toEqual(Object.values(RungSizing));
        expect(RUNG_SIZING_LABELS).toEqual({
            [RungSizing.CapToCushion]: 'Cap to cushion',
            [RungSizing.SkipIfUnaffordable]: 'Skip trade',
        });
        for (const option of RUNG_SIZING_OPTIONS) {
            expect(RUNG_SIZING_OUTCOMES[option].trim().length).toBeGreaterThan(
                0,
            );
        }
    });

    it('says a skipped rung ends the day, as the simulator and the ladder search do', () => {
        const outcome = RUNG_SIZING_OUTCOMES[RungSizing.SkipIfUnaffordable];
        expect(outcome).toContain('the trade is skipped');
        expect(outcome).toContain('the day ends');
    });

    it('says a capped rung is cut to the room left and still placed', () => {
        const outcome = RUNG_SIZING_OUTCOMES[RungSizing.CapToCushion];
        expect(outcome).toContain('cut down');
        expect(outcome).toContain('still placed');
        expect(outcome).not.toContain('day ends');
    });

    it('names both limits that bound the room a rung can use', () => {
        for (const option of RUNG_SIZING_OPTIONS) {
            expect(RUNG_SIZING_OUTCOMES[option]).toContain('drawdown floor');
            expect(RUNG_SIZING_OUTCOMES[option]).toContain('daily loss limit');
        }
    });

    it('has no em dash', () => {
        for (const option of RUNG_SIZING_OPTIONS) {
            expect(RUNG_SIZING_LABELS[option]).not.toContain('\u{2014}');
            expect(RUNG_SIZING_OUTCOMES[option]).not.toContain('\u{2014}');
        }
    });
});

describe('describeNonDefaultRungSizing', () => {
    it('is null for the default rung sizing', () => {
        expect(describeNonDefaultRungSizing(DEFAULT_RUNG_SIZING)).toBeNull();
    });

    it.each(
        Object.values(RungSizing).filter(
            (rungSizing) => rungSizing !== DEFAULT_RUNG_SIZING,
        ),
    )('names %s by its shared label, for eval and funded', (rungSizing) => {
        expect(describeNonDefaultRungSizing(rungSizing)).toBe(
            `${RUNG_SIZING_LABELS[rungSizing]}, eval and funded`,
        );
    });

    it('is the value of the unaffordable rung summary row', () => {
        const state: CalculatorState = {
            ...defaultCalculatorState(),
            rungSizing: RungSizing.SkipIfUnaffordable,
        };
        expect(valueOf(state, InputsSummaryField.RungSizing)).toBe(
            describeNonDefaultRungSizing(RungSizing.SkipIfUnaffordable),
        );
    });
});
