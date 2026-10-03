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
    InstrumentSymbol,
    MffuVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import { RiskDisplayUnit, RungPlacement } from '~/lib/prop-calculator/advisor';

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
    oneContractRisk: null,
    rungPlacements: [RungPlacement.NotChecked, RungPlacement.NotChecked],
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

const onInstrumentChange = vi.fn();

const onStopInputChange = vi.fn();

function microSizing(room: Partial<DailyCardSizing>): DailyCardSizing {
    const sizing = sizingFor(TradingPhase.Funded, '7.5');
    return {
        ...sizing,
        ...room,
        entry: { ...sizing.entry, instrument: InstrumentSymbol.MNQ },
    };
}

function sizingFor(
    phase: TradingPhase,
    stopInput = '',
    isSettled = true,
): DailyCardSizing {
    return {
        entry: {
            instrument: InstrumentSymbol.NQ,
            isSettled,
            onInstrumentChange,
            onStopInputChange,
            stopInput,
            stopPoints: stopInput === '' ? null : Number(stopInput),
        },
        phase,
        plan: mffProPlan(),
        tierContext: null,
        unit: RiskDisplayUnit.AccountDollars,
    };
}

describe('the daily plan card says a funded rung below one contract cannot be placed (PT-36h, F-154)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(
        sizing: DailyCardSizing | null,
        card: DailyPlanCardViewModel = CARD,
    ) {
        act(() => {
            root.render(<DailyPlanCardView card={card} sizing={sizing} />);
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
        onInstrumentChange.mockClear();
        onStopInputChange.mockClear();
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

    it('names the trades the advisor flags and the risk of one contract it carries', () => {
        render(sizingFor(TradingPhase.Funded, '20'), {
            ...CARD,
            oneContractRisk: 400,
            rungPlacements: [
                RungPlacement.BelowOneContract,
                RungPlacement.BelowOneContract,
            ],
        });

        const text = container.textContent;
        expect(text).toContain('Trades 1 and 2 cannot be placed');
        expect(text).toContain('where one contract risks $400.00');
    });

    it('hides the flag while the typed stop is not yet the settled stop, like the inline contracts status (PT-36m)', () => {
        const flagged = {
            ...CARD,
            oneContractRisk: 400,
            rungPlacements: [
                RungPlacement.BelowOneContract,
                RungPlacement.BelowOneContract,
            ],
        };

        render(sizingFor(TradingPhase.Funded, '20', false), flagged);
        expect(container.textContent).not.toContain('cannot be placed');

        render(sizingFor(TradingPhase.Funded, '20', true), flagged);
        expect(container.textContent).toContain('cannot be placed');
    });

    it('shows the flag on a card with no stop entry at all (PT-36m)', () => {
        render(null, {
            ...CARD,
            oneContractRisk: 400,
            rungPlacements: [
                RungPlacement.BelowOneContract,
                RungPlacement.BelowOneContract,
            ],
        });

        expect(container.textContent).toContain(
            'Trades 1 and 2 cannot be placed',
        );
        expect(container.textContent).toContain(
            'where one contract risks $400.00',
        );
    });

    it('says nothing while no stop is entered', () => {
        render(sizingFor(TradingPhase.Funded));

        expect(container.textContent).not.toContain('cannot be placed');
    });

    it('does not compute a flag from the stop typed into the card, because the advisor owns the flag (PT-36k)', () => {
        render(sizingFor(TradingPhase.Funded, '20'));
        setStop('20');

        expect(container.textContent).not.toContain('cannot be placed');
    });

    it('hands the typed stop and instrument to its owner instead of keeping its own copy (PT-36k)', () => {
        render(sizingFor(TradingPhase.Funded));

        setStop('20');

        expect(onStopInputChange).toHaveBeenCalledWith('20');
    });

    it('shows the stop its owner holds in the stop field (PT-36k)', () => {
        render(sizingFor(TradingPhase.Funded, '12.5'));

        expect(
            container.querySelector<HTMLInputElement>('#daily-card-stop')
                ?.value,
        ).toBe('12.5');
    });

    it('renders the advisor flag for the trades it marks, with no stop typed into the card (PT-36j)', () => {
        render(sizingFor(TradingPhase.Funded), {
            ...CARD,
            rungPlacements: [
                RungPlacement.BelowOneContract,
                RungPlacement.Placeable,
            ],
        });

        const text = container.textContent;
        expect(text).toContain('Trade 1 cannot be placed');
        expect(text).not.toContain('Trades 1 and 2');
    });

    it('says nothing when the advisor marks every trade placeable or not checked (PT-36j)', () => {
        render(sizingFor(TradingPhase.Funded), {
            ...CARD,
            rungPlacements: [RungPlacement.Placeable, RungPlacement.NotChecked],
        });

        expect(container.textContent).not.toContain('cannot be placed');
    });
});

describe('the daily plan card keeps its two statements about one stop from disagreeing (PT-36k review)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(sizing: DailyCardSizing, card = CARD) {
        act(() => {
            root.render(<DailyPlanCardView card={card} sizing={sizing} />);
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

    it('shows the inline contracts status once the typed stop is the settled stop', () => {
        render(sizingFor(TradingPhase.Funded, '20', true));

        expect(container.textContent).toContain('No whole NQ contract fits');
    });

    it('hides the inline contracts status while the typed stop is not yet the settled stop', () => {
        render(sizingFor(TradingPhase.Funded, '20', false));

        expect(container.textContent).not.toContain(
            'No whole NQ contract fits',
        );
        expect(container.textContent).toContain('Size in contracts');
    });

    it('reads the parsed stop from its owner, not from the typed text', () => {
        const sizing = sizingFor(TradingPhase.Funded, '20', true);
        render({ ...sizing, entry: { ...sizing.entry, stopPoints: null } });

        expect(container.textContent).not.toContain(
            'No whole NQ contract fits',
        );
    });

    it('says an evaluation account is not checked for placement once a stop is entered', () => {
        render(sizingFor(TradingPhase.Eval, '20'));

        expect(container.textContent).toContain(
            'Placement at the entered stop is not checked for evaluation accounts',
        );
    });

    it('says nothing about placement checks for an evaluation account while no stop is entered', () => {
        render(sizingFor(TradingPhase.Eval));

        expect(container.textContent).not.toContain('is not checked');
    });

    it('does not say the check is missing for a funded account whose trades the advisor checked', () => {
        render(sizingFor(TradingPhase.Funded, '5'), {
            ...CARD,
            rungPlacements: [RungPlacement.Placeable, RungPlacement.Placeable],
        });

        expect(container.textContent).not.toContain('is not checked');
    });
});

describe('the daily plan card judges the sibling instrument mismatch against the room left today (PT-92, F-V31)', () => {
    let container: HTMLDivElement;
    let root: Root;

    const mismatchCard: DailyPlanCardViewModel = {
        ...CARD,
        rungs: [
            {
                cappedByText: [],
                risk: 150,
                runningLossAfter: 150,
                takeProfit: 300,
            },
        ],
    };

    function render(sizing: DailyCardSizing) {
        act(() => {
            root.render(
                <DailyPlanCardView card={mismatchCard} sizing={sizing} />,
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
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('shows the room severity when the daily loss room is below the sibling risk', () => {
        render(microSizing({ cushionLeft: 3000, dailyLossRoom: 200 }));

        const text = container.textContent;
        expect(text).toContain('would exceed the room left today');
        expect(text).not.toContain("plan's full drawdown budget");
    });

    it('shows the room severity when the cushion left is the smaller room', () => {
        render(microSizing({ cushionLeft: 200, dailyLossRoom: 3000 }));

        expect(container.textContent).toContain(
            'would exceed the room left today',
        );
    });

    it('keeps the planned-risk wording when the known room is wider than the sibling risk', () => {
        render(microSizing({ cushionLeft: 3000, dailyLossRoom: 2500 }));

        const text = container.textContent;
        expect(text).toContain('more than you intended');
        expect(text).not.toContain('room left today');
    });

    it('keeps the planned-risk wording when no room is known and the sibling fits the full drawdown', () => {
        render(microSizing({}));

        expect(container.textContent).toContain('more than you intended');
        expect(container.textContent).not.toContain('room left today');
    });

    it('keeps the full-drawdown wording when no room is known and the sibling risk passes the whole drawdown', () => {
        act(() => {
            root.render(
                <DailyPlanCardView
                    card={{
                        ...mismatchCard,
                        rungs: [
                            {
                                cappedByText: [],
                                risk: 300,
                                runningLossAfter: 300,
                                takeProfit: 600,
                            },
                        ],
                    }}
                    sizing={{ ...microSizing({}), phase: TradingPhase.Eval }}
                />,
            );
        });

        const text = container.textContent;
        expect(text).toContain("plan's full drawdown budget");
        expect(text).not.toContain('room left today');
    });
});
