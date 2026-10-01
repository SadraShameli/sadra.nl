import { describe, expect, it } from 'vitest';

import { DayStopRuleKind, dollars, PayoutGate } from '~/lib/prop-calculator';
import {
    AccountAction,
    type Advice,
    AdviceSource,
    AdviceStalenessReason,
    dailyPlanCard as buildDailyPlanCard,
    type DailyPlanCard,
    DayStopReason,
    DEFAULT_RULEBOOK,
    type DocumentedSizing,
    FundedFixedRiskRule,
    type FundedRuleContext,
    NO_PERSONAL_CAPS,
    payoutBlockReasonFromGate,
    PayoutReadinessKind,
    SizingObjective,
    SizingProvenance,
    SizingStage,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import { accountActionOf } from '~/lib/prop-calculator/advisor/actions';
import { RetireComparisonVerdict } from '~/lib/prop-calculator/advisor/value';

function adviceFixture(overrides: Partial<Advice> = {}): Advice {
    return {
        assumptions: [],
        dailyPlanCard: dailyPlanCardFixture(true),
        differenceReasons: [],
        documented: documentedSizingFixture(),
        headline: 'your documented rule',
        optima: [],
        payoutAdvice: null,
        provenance: {
            computedAt: '2026-01-10',
            firmDataDate: null,
            objective: SizingObjective.MonthlyNet,
            planRulesFingerprint: null,
            seed: null,
            snapshotDate: '2026-01-10',
            solverVersion: null,
            source: AdviceSource.Documented,
            startBasis: StartBasis.Fresh,
            trials: null,
        },
        requests: [],
        stage: SizingStage.Funded,
        staleness: { kind: 'fresh' },
        ...overrides,
    };
}

function dailyPlanCardFixture(hasRungs: boolean): DailyPlanCard {
    return {
        rungs: hasRungs ? documentedSizingFixture().rungs : [],
        stopCappedBy: [],
        stopReason: hasRungs ? DayStopReason.MaxTrades : DayStopReason.NoLossRoom,
        valueAfterLoss: null,
        valueAfterWin: null,
        valueNow: null,
    };
}

function documentedSizingFixture(): DocumentedSizing {
    return {
        assumptions: [],
        constraints: [],
        dailyProfitCap: null,
        maxTrades: 4,
        minStopPointsAtCap: null,
        profitCeiling: null,
        provenance: SizingProvenance.FundedFixedRisk,
        rewardMultiple: 2,
        rungs: [
            {
                cappedBy: [],
                risk: dollars(250),
                runningLossAfter: dollars(250),
                runningLossBefore: dollars(0),
                takeProfit: dollars(500),
            },
        ],
        sources: [],
        stopRule: { kind: DayStopRuleKind.DayGreen },
    };
}

const ELIGIBLE_READINESS = {
    kind: PayoutReadinessKind.Eligible as const,
    requestedAmount: 500,
    traderReceives: 480,
};

const BLOCKED_READINESS = {
    kind: PayoutReadinessKind.Blocked as const,
    reason: payoutBlockReasonFromGate(PayoutGate.BelowMinPayoutProfit),
    wait: null,
};

const NO_SETTINGS = { retireOnSwitchBeatsKeep: false };
const RETIRE_SETTINGS = { retireOnSwitchBeatsKeep: true };

describe('accountActionOf (F-V18, F-V19, F-V20, PT-74b step 3)', () => {
    it('gives EnterSnapshot when the advice is stale, even when payout-eligible', () => {
        const advice = adviceFixture({
            staleness: {
                kind: 'stale',
                noHolidayCalendarDisclosure: false,
                reasons: [AdviceStalenessReason.FundedSnapshotStale],
                snapshotAsOf: '2026-01-01',
            },
        });
        const result = accountActionOf(
            advice,
            ELIGIBLE_READINESS,
            null,
            NO_SETTINGS,
        );
        expect(result.action).toBe(AccountAction.EnterSnapshot);
    });

    it('gives NotModeled when the plan could not size the account (documented is null, fresh)', () => {
        const advice = adviceFixture({ dailyPlanCard: null, documented: null });
        const result = accountActionOf(
            advice,
            BLOCKED_READINESS,
            null,
            NO_SETTINGS,
        );
        expect(result.action).toBe(AccountAction.NotModeled);
    });

    it('gives RequestPayout when payout-eligible, leaving the documented rung unchanged', () => {
        const advice = adviceFixture();
        const eligible = accountActionOf(
            advice,
            ELIGIBLE_READINESS,
            null,
            NO_SETTINGS,
        );
        const notEligible = accountActionOf(
            advice,
            BLOCKED_READINESS,
            null,
            NO_SETTINGS,
        );
        expect(eligible.action).toBe(AccountAction.RequestPayout);
        expect(notEligible.action).not.toBe(AccountAction.RequestPayout);
        expect(eligible.action).not.toBe(notEligible.action);
    });

    it('gives StopForToday when the daily plan card has no rungs left to trade', () => {
        const advice = adviceFixture({ dailyPlanCard: dailyPlanCardFixture(false) });
        const result = accountActionOf(
            advice,
            BLOCKED_READINESS,
            null,
            NO_SETTINGS,
        );
        expect(result.action).toBe(AccountAction.StopForToday);
    });

    it('gives Trade, with the verdict passed through as information, when SwitchBeatsKeep and the settings flag is off', () => {
        const advice = adviceFixture();
        const result = accountActionOf(
            advice,
            BLOCKED_READINESS,
            RetireComparisonVerdict.SwitchBeatsKeep,
            NO_SETTINGS,
        );
        expect(result.action).toBe(AccountAction.Trade);
        expect(result.retireVerdict).toBe(RetireComparisonVerdict.SwitchBeatsKeep);
    });

    it('gives Retire only when SwitchBeatsKeep and the settings flag (QV-19) is on', () => {
        const advice = adviceFixture();
        const result = accountActionOf(
            advice,
            BLOCKED_READINESS,
            RetireComparisonVerdict.SwitchBeatsKeep,
            RETIRE_SETTINGS,
        );
        expect(result.action).toBe(AccountAction.Retire);
    });

    it('StopForToday reflects only day-start structural exhaustion, never a real intraday-fired stop (review HIGH: dailyPlanCard always forecasts from a zero day)', () => {
        const rule = new FundedFixedRiskRule(DEFAULT_RULEBOOK);
        const roomyContext: FundedRuleContext = {
            ceiling: null,
            contractLimit: null,
            cushion: dollars(3000),
            dayStartDllRoom: null,
            instrument: null,
            personalCaps: NO_PERSONAL_CAPS,
            personalDll: null,
            placeableMinimum: dollars(0.01),
            stage: SizingStage.Funded,
        };
        const roomyCard = buildDailyPlanCard(rule, roomyContext);
        expect(roomyCard.rungs.length).toBeGreaterThan(0);
        const advice = adviceFixture({ dailyPlanCard: roomyCard });
        const result = accountActionOf(
            advice,
            BLOCKED_READINESS,
            null,
            NO_SETTINGS,
        );
        expect(result.action).toBe(AccountAction.Trade);
    });

    it('gives Trade as the default action with no blocking condition', () => {
        const advice = adviceFixture();
        const result = accountActionOf(
            advice,
            BLOCKED_READINESS,
            RetireComparisonVerdict.Keep,
            RETIRE_SETTINGS,
        );
        expect(result.action).toBe(AccountAction.Trade);
        expect(result.retireVerdict).toBe(RetireComparisonVerdict.Keep);
    });
});
