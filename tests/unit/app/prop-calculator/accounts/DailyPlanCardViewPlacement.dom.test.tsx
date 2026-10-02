import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type DailyPlanCardViewModel } from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
import {
    type DailyCardSizing,
    DailyPlanCardView,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/DailyPlanCardView';
import {
    findFirm,
    FirmId,
    MffuVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import { RiskDisplayUnit } from '~/lib/prop-calculator/advisor';

function mffProPlan() {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (plan === undefined) throw new Error('no MFF Pro 50K plan');
    return plan;
}

const CARD: DailyPlanCardViewModel = {
    rungs: [
        {
            cappedByText: [],
            risk: 250,
            runningLossAfter: 250,
            takeProfit: 500,
        },
        {
            cappedByText: [],
            risk: 250,
            runningLossAfter: 500,
            takeProfit: 500,
        },
    ],
    stopCappedByText: [],
    stopReasonText: 'Stopped: the maximum trades for today were reached.',
    valueAfterLoss: null,
    valueAfterWin: null,
    valueNow: null,
};

function sizingFor(phase: TradingPhase): DailyCardSizing {
    return {
        phase,
        plan: mffProPlan(),
        tierContext: null,
        unit: RiskDisplayUnit.AccountDollars,
    };
}

describe('the daily plan card says a funded rung below one contract cannot be placed (PT-36h, F-154)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(sizing: DailyCardSizing | null) {
        act(() => {
            root.render(<DailyPlanCardView card={CARD} sizing={sizing} />);
        });
    }

    function setStop(text: string) {
        const input =
            container.querySelector<HTMLInputElement>('#daily-card-stop');
        if (input === null) throw new Error('no stop input');
        act(() => {
            Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value',
            )?.set?.call(input, text);
            input.dispatchEvent(new Event('input', { bubbles: true }));
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
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('names the trades that cannot be placed and the risk of one contract at the entered stop', () => {
        render(sizingFor(TradingPhase.Funded));

        setStop('20');

        const text = container.textContent;
        expect(text).toContain('Trades 1 and 2 cannot be placed');
        expect(text).toContain('one contract');
        expect(text).toContain('$400.00');
    });

    it('says nothing while no stop is entered', () => {
        render(sizingFor(TradingPhase.Funded));

        expect(container.textContent).not.toContain('cannot be placed');
    });

    it('says nothing when one contract at the entered stop fits inside the rung', () => {
        render(sizingFor(TradingPhase.Funded));

        setStop('5');

        expect(container.textContent).not.toContain('cannot be placed');
    });

    it('says nothing for an evaluation account, which stops instead of placing below one contract', () => {
        render(sizingFor(TradingPhase.Eval));

        setStop('20');

        expect(container.textContent).not.toContain('cannot be placed');
    });
});
