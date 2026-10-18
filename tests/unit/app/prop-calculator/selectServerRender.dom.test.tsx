import { type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { PositionSizeView } from '~/app/(app)/prop-calculator/(tools)/position-size/PositionSizeView';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import DayStopRulePicker from '~/app/(app)/prop-calculator/_components/DayStopRulePicker';
import { DAY_STOP_KIND_LABELS } from '~/app/(app)/prop-calculator/_components/describeDayStopRule';
import FirmPlanPicker from '~/app/(app)/prop-calculator/_components/FirmPlanPicker';
import { ObjectiveSelect } from '~/app/(app)/prop-calculator/_components/ObjectiveChip';
import { POSITION_SIZE_PHASE_LABELS } from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeModel';
import { defaultPositionSize } from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeUrlState';
import { formatRiskDisplay } from '~/app/(app)/prop-calculator/_components/riskDisplay';
import { ScreenHourInputs } from '~/app/(app)/prop-calculator/_components/ScreenHourFilters';
import { ALL_FIRMS, DayStopRuleKind } from '~/lib/prop-calculator';
import {
    SIZING_OBJECTIVE_LABEL,
    SizingObjective,
} from '~/lib/prop-calculator/advisor';

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorInputs: () => ({ debouncedQuery: '' }),
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({ data: null, error: null, isPending: false }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            rulebook: { get: { useQuery: () => ({ data: undefined }) } },
        },
    },
}));

vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/app/(app)/prop-calculator/_components/ToolPageHeading', () => ({
    ToolPageHeading: () => null,
}));

function onlyTriggerText(element: ReactElement): string {
    const [text = ''] = serverTriggerTexts(element).values();
    return text;
}

function serverTriggerTexts(element: ReactElement): Map<string, string> {
    const template = document.createElement('template');
    template.innerHTML = renderToString(element);
    return new Map(
        [
            ...template.content.querySelectorAll<HTMLButtonElement>(
                'button[role="combobox"]',
            ),
        ].map((trigger) => [trigger.id, trigger.textContent.trim()]),
    );
}

describe('selects render their chosen option on the server, so they never hydrate as empty pills', () => {
    it('names the ranking objective', () => {
        expect(
            onlyTriggerText(
                <ObjectiveSelect
                    objective={SizingObjective.CycleCash}
                    onChange={vi.fn()}
                />,
            ),
        ).toBe(SIZING_OBJECTIVE_LABEL[SizingObjective.CycleCash]);
    });

    it('names the firm and the plan', () => {
        const { firm, plan } = defaultCalculatorState();
        const texts = serverTriggerTexts(
            <FirmPlanPicker
                firm={firm}
                firms={ALL_FIRMS}
                onFirmChange={vi.fn()}
                onPlanChange={vi.fn()}
                plan={plan}
            />,
        );
        expect(texts.get('firm-select')).toBe(firm.displayName);
        expect(texts.get('plan-select')).toBe(plan.label);
    });

    it('names the day stop rule', () => {
        expect(
            onlyTriggerText(
                <DayStopRulePicker
                    id="day-stop"
                    onChange={vi.fn()}
                    value={{ kind: DayStopRuleKind.DayGreen }}
                />,
            ),
        ).toBe(DAY_STOP_KIND_LABELS[DayStopRuleKind.DayGreen]);
    });

    it('names how many comparison rows to show', () => {
        expect(
            onlyTriggerText(
                <ScreenHourInputs
                    accountsPerSessionInput="2"
                    hoursPerDayInput="3"
                    idPrefix="comparison"
                    onAccountsPerSessionChange={vi.fn()}
                    onHoursPerDayChange={vi.fn()}
                    onTopLimitChange={vi.fn()}
                    topLimitInput="5"
                />,
            ),
        ).toBe('Top 5');
    });

    it('names the instrument, phase and risk unit of the position size tool', () => {
        const defaults = defaultPositionSize();
        const texts = serverTriggerTexts(<PositionSizeView />);
        expect(texts.get('position-size-instrument')).toMatch(
            new RegExp(`^${defaults.instrument}: `),
        );
        expect(texts.get('position-size-phase')).toBe(
            POSITION_SIZE_PHASE_LABELS[defaults.phase],
        );
        expect(texts.get('position-size-unit')).toBe(
            formatRiskDisplay(defaults.unit, {
                accountDollars: 0,
                evAtStake: 0,
                feeEquivalent: 0,
            }).label,
        );
    });
});
