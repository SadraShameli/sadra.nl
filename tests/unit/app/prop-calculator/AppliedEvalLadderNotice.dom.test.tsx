import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    type Mock,
    vi,
} from 'vitest';

import {
    AppliedEvalLadderNotice,
    EvalLadderScope,
} from '~/app/(app)/prop-calculator/_components/AppliedEvalLadderNotice';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { InputsSummary } from '~/app/(app)/prop-calculator/_components/InputsSummary';
import {
    describeAppliedEvalLadder,
    describeNonDefaultRungSizing,
} from '~/app/(app)/prop-calculator/_components/inputsSummaryRows';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import {
    type DayPolicy,
    DayStopRuleKind,
    DEFAULT_RUNG_SIZING,
    RungSizing,
} from '~/lib/prop-calculator';

interface NoticeHarness {
    setEvalDayPolicy: Mock<(policy: DayPolicy | null) => void>;
    setRungSizing: Mock<(rungSizing: RungSizing) => void>;
    state: CalculatorState | null;
}

const harness = vi.hoisted((): NoticeHarness => ({
    setEvalDayPolicy: vi.fn(),
    setRungSizing: vi.fn(),
    state: null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorActions: () => ({
        setEvalDayPolicy: harness.setEvalDayPolicy,
        setRungSizing: harness.setRungSizing,
    }),
    useCalculatorInputs: () => ({ state: harness.state }),
}));

vi.mock('~/app/(app)/prop-calculator/_components/EditInputsDialog', () => ({
    EditInputsDialog: () => null,
}));

const APPLIED_LEAD = 'Eval ladder applied from the ladder lab:';
const NOT_USED_LEAD =
    'Eval ladder applied from the ladder lab, but these results do not use it:';

const LADDER: DayPolicy = {
    ladder: [250, 500],
    maxLossesPerDay: 2,
    stopRule: { kind: DayStopRuleKind.FirstWin },
};

function stateWith(
    evalDayPolicy: DayPolicy | null,
    rungSizing: RungSizing = DEFAULT_RUNG_SIZING,
): CalculatorState {
    return { ...defaultCalculatorState(), evalDayPolicy, rungSizing };
}

describe('AppliedEvalLadderNotice', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(
        state: CalculatorState,
        element: ReactElement = <AppliedEvalLadderNotice />,
    ) {
        harness.state = state;
        act(() => {
            root.render(element);
        });
    }

    function clearButton(): HTMLButtonElement | null {
        return container.querySelector(
            'button[aria-label="Clear the applied eval ladder"]',
        );
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.setEvalDayPolicy.mockReset();
        harness.setRungSizing.mockClear();
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

    it('renders nothing while no eval ladder is applied, whatever the rung sizing', () => {
        render(stateWith(null));
        expect(container.childNodes).toHaveLength(0);
        render(stateWith(null, RungSizing.SkipIfUnaffordable));
        expect(container.childNodes).toHaveLength(0);
    });

    it('names the applied ladder after the ladder lab lead-in', () => {
        const state = stateWith(LADDER);
        render(state);
        const text = container.textContent;
        const lead = 'Eval ladder applied from the ladder lab:';
        const ladder = describeAppliedEvalLadder(state) ?? '';
        expect(ladder.length).toBeGreaterThan(0);
        expect(text).toContain(lead);
        expect(text.indexOf(ladder)).toBeGreaterThan(text.indexOf(lead));
    });

    it('adds the unaffordable rung choice when it is not the default', () => {
        render(stateWith(LADDER, RungSizing.SkipIfUnaffordable));
        expect(container.textContent).toContain(
            `Unaffordable rung: ${describeNonDefaultRungSizing(RungSizing.SkipIfUnaffordable) ?? ''}`,
        );
    });

    it('leaves the unaffordable rung choice out while it is the default', () => {
        render(stateWith(LADDER, DEFAULT_RUNG_SIZING));
        expect(container.textContent).not.toContain('Unaffordable rung');
    });

    it('clears only the applied eval ladder', () => {
        render(stateWith(LADDER, RungSizing.SkipIfUnaffordable));
        const clear = clearButton();
        expect(clear).not.toBeNull();
        expect(clear?.textContent).toBe('Clear');
        expect(clear?.type).toBe('button');
        act(() => {
            clear?.click();
        });
        expect(harness.setEvalDayPolicy).toHaveBeenCalledExactlyOnceWith(null);
        expect(harness.setRungSizing).not.toHaveBeenCalled();
    });

    it('is gone once the ladder is cleared', () => {
        render(stateWith(LADDER));
        expect(clearButton()).not.toBeNull();
        render(stateWith(null));
        expect(clearButton()).toBeNull();
        expect(container.textContent).not.toContain('Eval ladder');
    });

    it('has no em dash', () => {
        render(stateWith(LADDER, RungSizing.SkipIfUnaffordable));
        expect(container.textContent).not.toContain('—');
        render(
            stateWith(LADDER, RungSizing.SkipIfUnaffordable),
            <AppliedEvalLadderNotice scope={EvalLadderScope.NotUsedHere} />,
        );
        expect(container.textContent).not.toContain('—');
    });

    it('says the results do not use the ladder where the page ignores it', () => {
        const state = stateWith(LADDER);
        render(
            state,
            <AppliedEvalLadderNotice scope={EvalLadderScope.NotUsedHere} />,
        );
        const text = container.textContent;
        expect(text).toContain(NOT_USED_LEAD);
        expect(text).not.toContain(APPLIED_LEAD);
        expect(text).toContain(describeAppliedEvalLadder(state) ?? '');
        expect(clearButton()).not.toBeNull();
    });

    it('never lists the unaffordable rung choice as unused where the page ignores the ladder', () => {
        render(
            stateWith(LADDER, RungSizing.SkipIfUnaffordable),
            <AppliedEvalLadderNotice scope={EvalLadderScope.NotUsedHere} />,
        );
        expect(container.textContent).toContain(NOT_USED_LEAD);
        expect(container.textContent).not.toContain('Unaffordable rung');
        expect(container.textContent).not.toContain(
            describeNonDefaultRungSizing(RungSizing.SkipIfUnaffordable) ?? '',
        );
    });

    it('still shows the unaffordable rung choice as applied in a summary whose page ignores the ladder', () => {
        render(
            stateWith(LADDER, RungSizing.SkipIfUnaffordable),
            <InputsSummary evalLadderScope={EvalLadderScope.NotUsedHere} />,
        );
        const rungSizing =
            describeNonDefaultRungSizing(RungSizing.SkipIfUnaffordable) ?? '';
        const notice = container.querySelector(
            '.app-prop-calculator__applied-eval-ladder',
        );
        const rows = [
            ...(container
                .querySelector('dl')
                ?.querySelectorAll(':scope > div') ?? []),
        ].map((row) => row.textContent);
        expect(rungSizing.length).toBeGreaterThan(0);
        expect(rows).toContain(`Unaffordable rung${rungSizing}`);
        expect(notice?.textContent).toContain(NOT_USED_LEAD);
        expect(notice?.textContent).not.toContain(rungSizing);
    });

    it('renders nothing where the page ignores the ladder and none is applied', () => {
        render(
            stateWith(null),
            <AppliedEvalLadderNotice scope={EvalLadderScope.NotUsedHere} />,
        );
        expect(container.childNodes).toHaveLength(0);
    });

    it('is the applied notice in the inputs summary by default', () => {
        render(stateWith(LADDER), <InputsSummary />);
        expect(container.textContent).toContain(APPLIED_LEAD);
        expect(container.textContent).not.toContain(NOT_USED_LEAD);
    });

    it('takes its scope from the inputs summary', () => {
        render(
            stateWith(LADDER),
            <InputsSummary evalLadderScope={EvalLadderScope.NotUsedHere} />,
        );
        expect(container.textContent).toContain(NOT_USED_LEAD);
        expect(container.textContent).not.toContain(APPLIED_LEAD);
    });

    it('moves focus to the inputs summary when Clear removes the notice', () => {
        harness.setEvalDayPolicy.mockImplementation((policy) => {
            harness.state = { ...stateWith(LADDER), evalDayPolicy: policy };
        });
        render(stateWith(LADDER), <InputsSummary />);
        const clear = clearButton();
        const summary = container.querySelector<HTMLElement>(
            '.app-prop-calculator__inputs-summary',
        );
        expect(summary).not.toBeNull();
        clear?.focus();
        expect(document.activeElement).toBe(clear);
        act(() => {
            clear?.click();
        });
        const cleared = harness.state;
        if (cleared !== null) render(cleared, <InputsSummary />);
        expect(clearButton()).toBeNull();
        expect(document.activeElement).toBe(summary);
        expect(summary?.tabIndex).toBe(-1);
    });
});
