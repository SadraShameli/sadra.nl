import { describe, expect, it } from 'vitest';

import {
    AdviceDisplayKind,
    adviceViewModel,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
import {
    riskChecksOf,
    riskCheckViewOf,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/riskCheckModel';
import {
    type AccountState,
    dollars,
    findFirm,
    FirmId,
    InstrumentSymbol,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    type PlanId,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    FundedSizingAdvisor,
    NextTradeRiskVerdict,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedFundedOrEvalAccount,
    RungPlacement,
} from '~/lib/prop-calculator/advisor';
import { type NextTradeRiskCheckResult } from '~/lib/prop-calculator/advisor/actions';

import { NO_PERSONAL_LIMITS } from './personalLimitsFixture';

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

const STATE: AccountState = {
    balance: 55_000,
    bestDayProfit: 0,
    consecutiveIdleDays: 0,
    intradayHighProfit: 0,
    peakDayCloseProfit: 0,
    peakIntradayProfit: 0,
    qualifyingDays: 20,
    startingBalance: 50_000,
    threshold: 50_100,
    thresholdLocked: true,
    todayPnL: 0,
    tradingDays: 20,
};

function advisorAt(instrument: InstrumentSymbol | null): FundedSizingAdvisor {
    const plan = registryPlan(MFF_PRO_ID);
    const account: ReconstructedFundedOrEvalAccount = {
        assumptions: [],
        contractLimit: null,
        cushion: STATE.balance - STATE.threshold,
        fundedTracker: newFundedCycleTracker({
            ...STATE,
            balance: STATE.startingBalance,
        }),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state: STATE,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
    return new FundedSizingAdvisor({
        account,
        fundedHorizonDays: 252,
        ...(instrument !== null && {
            positionSizing: { instrument, stopPoints: 20 },
        }),
        rulebook: DEFAULT_RULEBOOK,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    });
}

function checkResult(
    overrides: Partial<NextTradeRiskCheckResult> = {},
): NextTradeRiskCheckResult {
    return {
        documentedRung: dollars(250),
        documentedRungPlacement: RungPlacement.NotChecked,
        dpRisk: null,
        excessCents: 0,
        payoutEligibleAboveRung: false,
        stopReason: null,
        verdict: NextTradeRiskVerdict.WithinPlan,
        ...overrides,
    };
}

function registryPlan(id: PlanId): Plan {
    const found = findFirm(id.firm)?.findPlan(id);
    if (!found) throw new Error(`${serializePlanId(id)} missing`);
    return found;
}

describe('the advice view renders the advisor flag on the daily card (PT-36j, F-154)', () => {
    it('carries one placement per rung from the advisor', () => {
        const view = adviceViewModel(
            advisorAt(InstrumentSymbol.NQ).assemble([]),
            NO_PERSONAL_LIMITS,
        );

        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }
        const card = view.dailyPlanCard;
        expect(card?.rungs.length).toBeGreaterThan(0);
        expect(card?.rungPlacements).toEqual(
            card?.rungs.map(() => RungPlacement.BelowOneContract),
        );
    });

    it('carries the risk of one contract the advisor computed, so the card needs no separate prop (PT-36m)', () => {
        const advice = advisorAt(InstrumentSymbol.NQ).assemble([]);
        const view = adviceViewModel(advice, NO_PERSONAL_LIMITS);

        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }
        expect(advice.dailyPlanCard?.oneContractRisk).not.toBeNull();
        expect(view.dailyPlanCard?.oneContractRisk).toBe(
            advice.dailyPlanCard?.oneContractRisk,
        );
    });

    it('carries no risk of one contract when the advisor was given no stop (PT-36m)', () => {
        const view = adviceViewModel(
            advisorAt(null).assemble([]),
            NO_PERSONAL_LIMITS,
        );

        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }
        expect(view.dailyPlanCard?.oneContractRisk).toBeNull();
    });

    it('carries not-checked placements when the advisor was given no stop', () => {
        const view = adviceViewModel(
            advisorAt(null).assemble([]),
            NO_PERSONAL_LIMITS,
        );

        if (view.kind !== AdviceDisplayKind.Ready) {
            throw new Error('expected ready advice');
        }
        expect(view.dailyPlanCard?.rungPlacements).toEqual(
            view.dailyPlanCard?.rungs.map(() => RungPlacement.NotChecked),
        );
    });
});

describe('the risk check renders the advisor flag (PT-36j, F-154)', () => {
    it('says the documented rung cannot be placed when it is below one contract', () => {
        const view = riskCheckViewOf(
            checkResult({
                documentedRungPlacement: RungPlacement.BelowOneContract,
            }),
            0,
        );

        expect(view.placementText).toContain('cannot be placed');
        expect(view.placementText).toContain('one contract');
    });

    it.each([RungPlacement.Placeable, RungPlacement.NotChecked])(
        'says nothing about placement for a %s rung',
        (placement) => {
            const view = riskCheckViewOf(
                checkResult({ documentedRungPlacement: placement }),
                0,
            );

            expect(view.placementText).toBeNull();
        },
    );

    it('takes the flag from the advisor that was given the entered stop', () => {
        const inputs = { losses: '0', risk: '200', wins: '0' };
        const flagged = riskChecksOf({
            advisor: advisorAt(InstrumentSymbol.NQ),
            decisions: [],
            inputs,
            today: '2026-09-26',
        });
        const placed = riskChecksOf({
            advisor: advisorAt(InstrumentSymbol.MNQ),
            decisions: [],
            inputs,
            today: '2026-09-26',
        });

        expect(flagged.proposed?.placementText).toContain('cannot be placed');
        expect(placed.proposed?.placementText).toBeNull();
    });
});
