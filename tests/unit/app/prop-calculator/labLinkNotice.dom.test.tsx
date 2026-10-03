import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    CalculatorActionType,
    calculatorReducer,
    defaultCalculatorState,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import StrategyLabPanel from '~/app/(app)/prop-calculator/_components/StrategyLabPanel';
import {
    type CalculatorState,
    type LabLinkOutcome,
    LabLinkStatus,
} from '~/app/(app)/prop-calculator/_components/types';
import {
    decodeState,
    encodeState,
} from '~/app/(app)/prop-calculator/_components/urlState';
import { InstrumentSymbol } from '~/lib/prop-calculator';
import { ALL_FIRMS } from '~/lib/prop-calculator/firms';

import { InlineToolsWorker } from './labWorkerFixtures';

vi.mock('next/dynamic', () => ({ default: () => renderNothing }));

vi.mock('next/navigation', () => ({
    usePathname: () => '/',
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

const ISSUE = 'scenario 2: trades per day must be a whole number from 1 to 50';
const NOTICE = 'lab scenarios in this link or saved scenario were rejected';

function loadSavedScenario(
    params: string,
    current: CalculatorState,
): CalculatorState {
    return calculatorReducer(current, {
        state: decodeState(new URLSearchParams(params), ALL_FIRMS, current),
        type: CalculatorActionType.ApplyState,
    });
}

function renderNothing(): null {
    return null;
}

describe('StrategyLabPanel says when the lab scenarios of a link or saved scenario were rejected (PT-53e, PT-53f)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(
        labLink: LabLinkOutcome,
        state: CalculatorState = defaultCalculatorState(),
    ) {
        act(() => {
            root.render(
                <StrategyLabPanel
                    activationDiscountPercent={0}
                    commissionPerRoundTrip={0}
                    evalDiscountPercent={0}
                    fundedHorizonDays={5}
                    labLink={labLink}
                    linkActivationDiscount={false}
                    maxEvalDays={10}
                    minRetainedCushion={undefined}
                    monthlySubscriptionDiscountPercent={0}
                    onAdd={vi.fn()}
                    onRemove={vi.fn()}
                    onReset={vi.fn()}
                    onUpdate={vi.fn()}
                    payoutRequestSize={undefined}
                    plan={state.plan}
                    resetDiscountPercent={0}
                    rungSizing={undefined}
                    scenarios={state.labScenarios}
                    seed={1}
                />,
            );
        });
    }

    function alerts(): string[] {
        return [...container.querySelectorAll('[role="alert"]')].map(
            (node) => node.textContent,
        );
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.stubGlobal('Worker', InlineToolsWorker);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('says the scenarios were rejected, why, and that the scenarios shown did not come from the link or saved scenario', () => {
        render({ issue: ISSUE, status: LabLinkStatus.Rejected });
        const notice = alerts().find((text) => text.includes(NOTICE));
        expect(notice).toContain(ISSUE);
        expect(notice).toMatch(/scenarios shown did not come from it/);
    });

    it('does not blame a shared link when a saved scenario with a stop the lab now refuses is loaded', () => {
        const current = defaultCalculatorState();
        const [first] = current.labScenarios;
        if (!first) throw new Error('no default lab scenario');
        const saved = encodeState({
            ...current,
            labScenarios: [
                {
                    ...first,
                    instrument: InstrumentSymbol.MNQ,
                    label: 'Saved before PT-53f',
                    stopPoints: 0.1,
                },
            ],
        }).toString();
        const loaded = loadSavedScenario(saved, current);
        expect(loaded.labScenarios).toEqual(current.labScenarios);
        render(loaded.labLink, loaded);
        const notice = alerts().find((text) => text.includes(NOTICE));
        expect(notice).toContain(
            'scenario 1: stop points must be empty or between 0.25 and 10,000 points',
        );
        expect(notice).not.toMatch(/shared link/);
    });

    it('does not claim the defaults are shown, because a saved scenario keeps the current ones', () => {
        render({ issue: ISSUE, status: LabLinkStatus.Rejected });
        const notice = alerts().find((text) => text.includes(ISSUE));
        expect(notice).toBeDefined();
        expect(notice).not.toMatch(/default/);
    });

    it.each<LabLinkOutcome>([
        { status: LabLinkStatus.Accepted },
        { status: LabLinkStatus.Absent },
    ])('shows no rejection notice when the lab link is %j', (labLink) => {
        render(labLink);
        expect(container.textContent).not.toMatch(/rejected/);
    });
});
