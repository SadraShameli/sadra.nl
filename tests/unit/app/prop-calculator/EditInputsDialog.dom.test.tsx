import { act } from 'react';
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

import { EvalLadderScope } from '~/app/(app)/prop-calculator/_components/AppliedEvalLadderNotice';
import { defaultCalculatorState } from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import { EditInputsDialog } from '~/app/(app)/prop-calculator/_components/EditInputsDialog';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import {
    ALL_FIRMS,
    type DayPolicy,
    DayStopRuleKind,
    PolicySizing,
    RungSizing,
} from '~/lib/prop-calculator';

interface DialogHarness {
    actions: Record<string, Mock<(...values: unknown[]) => void>>;
    state: CalculatorState | null;
}

const harness = vi.hoisted((): DialogHarness => ({
    actions: {},
    state: null,
}));

vi.mock('~/app/(app)/prop-calculator/_components/CalculatorProvider', () => ({
    useCalculatorActions: () =>
        new Proxy(harness.actions, {
            get: (target, name: string) =>
                (target[name] ??= vi.fn<(...values: unknown[]) => void>()),
        }),
    useCalculatorInputs: () => ({ firms: ALL_FIRMS, state: harness.state }),
}));

const APPLIED_LEAD = 'Eval ladder applied from the ladder lab:';
const NOT_USED_LEAD =
    'Eval ladder applied from the ladder lab, but these results do not use it:';
const NOTICE = '.app-prop-calculator__applied-eval-ladder';

const LADDER: DayPolicy = {
    ladder: [250, 500],
    maxLossesPerDay: 2,
    sizing: PolicySizing.ContractCapped,
    stopRule: { kind: DayStopRuleKind.FirstWin },
};

function dialog(): HTMLElement | null {
    return document.body.querySelector('[role="dialog"]');
}

function stateWithLadder(): CalculatorState {
    return {
        ...defaultCalculatorState(),
        evalDayPolicy: LADDER,
        rungSizing: RungSizing.SkipIfUnaffordable,
    };
}

describe('EditInputsDialog', () => {
    let container: HTMLDivElement;
    let root: Root;

    function open(scope?: EvalLadderScope) {
        act(() => {
            root.render(
                scope === undefined ? (
                    <EditInputsDialog />
                ) : (
                    <EditInputsDialog evalLadderScope={scope} />
                ),
            );
        });
        act(() => {
            trigger().click();
        });
    }

    function trigger(): HTMLButtonElement {
        const button = [...container.querySelectorAll('button')].find(
            (candidate) => candidate.textContent.trim() === 'Edit inputs',
        );
        if (button === undefined) throw new Error('no trigger');
        return button;
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.state = defaultCalculatorState();
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('renders closed with only its trigger', () => {
        act(() => {
            root.render(<EditInputsDialog />);
        });
        expect(dialog()).toBeNull();
        expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
    });

    it('opens from its trigger titled Edit inputs with its description', () => {
        open();
        const opened = dialog();
        expect(opened).not.toBeNull();
        expect(opened?.querySelector('h2')?.textContent).toBe('Edit inputs');
        expect(opened?.textContent).toContain(
            'Firm, plan and trading inputs shared by every tool.',
        );
        expect(opened?.getAttribute('aria-labelledby')).not.toBeNull();
        expect(opened?.getAttribute('aria-describedby')).not.toBeNull();
    });

    it('scrolls inside the viewport', () => {
        open();
        expect(dialog()?.className).toContain('max-h-[85dvh]');
        expect(dialog()?.className).toContain('overflow-y-auto');
    });

    it('renders the shared inputs form', () => {
        open();
        expect(
            document.body.querySelector('#funded-horizon-days'),
        ).not.toBeNull();
        expect(dialog()?.textContent).toContain(
            defaultCalculatorState().firm.displayName,
        );
    });

    it('returns focus to the trigger on close', async () => {
        open();
        const closeButton = [
            ...(dialog()?.querySelectorAll('button') ?? []),
        ].find((button) => button.textContent.includes('Close'));
        expect(closeButton).toBeDefined();
        act(() => {
            closeButton?.click();
        });
        await act(async () => {
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
        });
        expect(dialog()).toBeNull();
        expect(document.activeElement).toBe(trigger());
    });

    it('says the ladder is applied by default', () => {
        harness.state = stateWithLadder();
        open();
        const notice = dialog()?.querySelector(NOTICE);
        expect(notice?.textContent).toContain(APPLIED_LEAD);
        expect(notice?.textContent).not.toContain(NOT_USED_LEAD);
        expect(notice?.textContent).toContain('Unaffordable rung');
    });

    it('says the results do not use the ladder where the page ignores it, with no unaffordable rung row', () => {
        harness.state = stateWithLadder();
        open(EvalLadderScope.NotUsedHere);
        const notice = dialog()?.querySelector(NOTICE);
        expect(notice?.textContent).toContain(NOT_USED_LEAD);
        expect(notice?.textContent).not.toContain(APPLIED_LEAD);
        expect(notice?.textContent).not.toContain('Unaffordable rung');
    });
});
