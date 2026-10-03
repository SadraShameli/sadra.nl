import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    AdviceDisplayKind,
    adviceViewModel,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
import { DailyPlanCardView } from '~/app/(app)/prop-calculator/accounts/_components/advice/DailyPlanCardView';
import {
    type AccountState,
    dollars,
    findFirm,
    FirmId,
    newFundedCycleTracker,
    type Plan,
    serializePlanId,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    ConsistencyCeilingNote,
    type DailyPlanCard,
    DayStopReason,
    DEFAULT_RULEBOOK,
    type DocumentedRung,
    FundedSizingAdvisor,
    NO_PENDING_PAYOUT_COUNTS,
    SizingConstraint,
} from '~/lib/prop-calculator/advisor';

import { NO_PERSONAL_LIMITS } from './personalLimitsFixture';

function baseAdvice() {
    const state: AccountState = {
        balance: 51_500,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 20,
        startingBalance: 50_000,
        threshold: 48_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 20,
    };
    return new FundedSizingAdvisor({
        account: {
            assumptions: [],
            contractLimit: null,
            cushion: 3500,
            fundedTracker: newFundedCycleTracker({
                ...state,
                balance: state.startingBalance,
            }),
            kind: TradingPhase.Funded,
            plan: plan(),
            resolvedDailyLossLimit: null,
            state,
            ...NO_PENDING_PAYOUT_COUNTS,
        },
        fundedHorizonDays: 90,
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
        trials: 20,
    }).assemble([]);
}

function baseCard(): DailyPlanCard {
    const { dailyPlanCard } = baseAdvice();
    if (dailyPlanCard === null) throw new Error('expected a daily plan card');
    return dailyPlanCard;
}

function plan(): Plan {
    const id = {
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    } as const;
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

function rung(risk: number, takeProfit: number): DocumentedRung {
    return {
        cappedBy: [],
        risk: dollars(risk),
        runningLossAfter: dollars(risk),
        runningLossBefore: dollars(0),
        takeProfit: dollars(takeProfit),
    };
}

describe('the daily plan card shows the window rule, the caps and the consistency ceiling (PT-108 step 8, F-127, F-146, F-154)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(overrides: Partial<DailyPlanCard>) {
        const card = cardViewOf({ ...baseCard(), ...overrides });
        act(() => {
            root.render(<DailyPlanCardView card={card} sizing={null} />);
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

    it('prints the Hard Rule 6 window rule', () => {
        render({ maxTradesPerWindow: 1 });

        expect(container.textContent).toContain(
            'Hard Rule 6: at most one trade per trading window',
        );
    });

    it('pluralises the window rule above one trade', () => {
        render({ maxTradesPerWindow: 2 });

        expect(container.textContent).toContain(
            'Hard Rule 6: at most 2 trades per trading window',
        );
    });

    it('prints the daily loss cap with the constraint that sets it', () => {
        render({
            dailyLossCap: {
                amount: dollars(1500),
                constraint: SizingConstraint.DailyLossCap,
            },
        });

        expect(container.textContent).toContain(
            'Daily loss cap $1,500.00. Capped by the daily loss limit.',
        );
    });

    it('prints the daily profit ceiling and the ConsistencyCap text with its figure', () => {
        const ceiling = {
            amount: dollars(400),
            constraint: SizingConstraint.ConsistencyCap,
        };
        render({
            dailyProfitCeiling: ceiling,
            profitCeiling: ceiling,
            rungs: [rung(200, 400)],
        });

        const text = container.textContent;
        expect(text).toContain('Daily profit ceiling $400.00');
        expect(text).toContain(
            "Capped at $400.00, the most today's profit can be before the payout is pushed out.",
        );
        expect(text).not.toContain('Capped by the funded consistency rule');
    });

    it('prints one ceiling line when the daily ceiling and the rule ceiling are the same', () => {
        const ceiling = {
            amount: dollars(400),
            constraint: SizingConstraint.ConsistencyCap,
        };
        render({
            dailyProfitCeiling: ceiling,
            profitCeiling: ceiling,
            rungs: [rung(200, 400)],
        });

        expect(container.textContent.split('profit ceiling')).toHaveLength(2);
    });

    it('prints both ceilings when a personal cap makes the daily ceiling tighter than the rule ceiling', () => {
        render({
            dailyProfitCeiling: {
                amount: dollars(200),
                constraint: SizingConstraint.PersonalCap,
            },
            profitCeiling: {
                amount: dollars(400),
                constraint: SizingConstraint.CeilingCap,
            },
            rungs: [rung(100, 200)],
        });

        const text = container.textContent;
        expect(text).toContain(
            'Daily profit ceiling $200.00. Capped by a personal risk limit.',
        );
        expect(text).toContain(
            "Profit ceiling from the rules $400.00. Capped by today's profit ceiling.",
        );
    });

    it('prints no ceiling line when no ceiling applies', () => {
        render({ dailyProfitCeiling: null, profitCeiling: null });

        expect(container.textContent).not.toContain('profit ceiling');
    });

    it('never says "No trade is placeable today" for a consistency ceiling alone', () => {
        render({
            dailyProfitCeiling: {
                amount: dollars(0.5),
                constraint: SizingConstraint.ConsistencyCap,
            },
            profitCeiling: {
                amount: dollars(0.5),
                constraint: SizingConstraint.ConsistencyCap,
            },
            rungs: [],
            stopReason: DayStopReason.CeilingReached,
        });

        const text = container.textContent;
        expect(text).not.toContain('No trade is placeable today');
        expect(text).toContain('consistency ceiling');
        expect(text).toContain("Capped at $0.50, the most today's profit");
    });

    it('still says "No trade is placeable today" when a loss cap leaves no room', () => {
        render({
            dailyProfitCeiling: null,
            profitCeiling: null,
            rungs: [],
            stopReason: DayStopReason.NoLossRoom,
        });

        expect(container.textContent).toContain('No trade is placeable today');
    });

    it('still says "No trade is placeable today" when a non-consistency ceiling is reached', () => {
        render({
            dailyProfitCeiling: {
                amount: dollars(0),
                constraint: SizingConstraint.CeilingCap,
            },
            profitCeiling: {
                amount: dollars(0),
                constraint: SizingConstraint.CeilingCap,
            },
            rungs: [],
            stopReason: DayStopReason.CeilingReached,
        });

        expect(container.textContent).toContain('No trade is placeable today');
    });

    it("says the payout is already pushed out by this cycle's best day", () => {
        render({ consistencyNote: ConsistencyCeilingNote.AlreadyPushedOut });

        expect(container.textContent).toContain(
            "the payout is already pushed out by this cycle's best day",
        );
    });

    it('carries the fresh-cycle note that the rule is checked at the request', () => {
        render({ consistencyNote: ConsistencyCeilingNote.FreshCycle });

        const text = container.textContent;
        expect(text).toContain('no profit yet');
        expect(text).toContain('checked at the payout request');
    });

    it('prints no consistency note when the card carries none', () => {
        render({ consistencyNote: null });

        expect(container.textContent).not.toContain('pushed out by');
        expect(container.textContent).not.toContain('no profit yet');
    });
});

function cardViewOf(card: DailyPlanCard) {
    const advice = {
        ...baseAdvice(),
        dailyPlanCard: card,
    };
    const view = adviceViewModel(advice, NO_PERSONAL_LIMITS);
    if (view.kind !== AdviceDisplayKind.Ready || view.dailyPlanCard === null) {
        throw new Error('expected a ready card');
    }
    return view.dailyPlanCard;
}
