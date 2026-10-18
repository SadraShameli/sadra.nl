import { describe, expect, it } from 'vitest';

import {
    type AccountState,
    ApexVariant,
    type Dollars,
    dollars,
    findFirm,
    FirmId,
    type Plan,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    AdviceSource,
    DEFAULT_RULEBOOK,
    EvalSizingAdvisor,
    type LadderSearchRequest,
    NO_PENDING_PAYOUT_COUNTS,
    NO_PERSONAL_CAPS,
    type PersonalCaps,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';

const APEX_EOD_ID = {
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
} as const;

function accountWithCushion(cushion: number): ReconstructedFundedOrEvalAccount {
    const state: AccountState = {
        balance: 50_000 + cushion,
        bestDayProfit: 0,
        consecutiveIdleDays: 0,
        elapsedDays: 0,
        intradayHighProfit: 0,
        peakDayCloseProfit: 0,
        peakIntradayProfit: 0,
        qualifyingDays: 0,
        startingBalance: 50_000,
        threshold: 50_000,
        thresholdLocked: false,
        todayPnL: 0,
        tradingDays: 0,
    };
    return {
        assumptions: [],
        contractLimit: null,
        cushion,
        fundedTracker: null,
        kind: TradingPhase.Eval,
        plan: registryPlan(),
        resolvedDailyLossLimit: null,
        state,
        ...NO_PENDING_PAYOUT_COUNTS,
    };
}

function ladderRequestOf(
    caps: Partial<PersonalCaps>,
    personalDll: Dollars | null,
): LadderSearchRequest {
    const [request] = new EvalSizingAdvisor({
        account: accountWithCushion(2000),
        maxEvalDays: 40,
        personalCaps: { ...NO_PERSONAL_CAPS, ...caps },
        personalDll,
        rulebook: DEFAULT_RULEBOOK,
        sims: 20,
        snapshotAsOf: '2026-09-26',
        substate: null,
        today: '2026-09-26',
    }).optimumRequests();
    if (
        request?.source !== AdviceSource.LadderSearchFresh &&
        request?.source !== AdviceSource.LadderSearchFromState
    ) {
        throw new Error('expected a ladder search request');
    }
    return request;
}

function registryPlan(): Plan {
    const found = findFirm(APEX_EOD_ID.firm)?.findPlan(APEX_EOD_ID);
    if (!found) throw new Error(`${serializePlanId(APEX_EOD_ID)} missing`);
    return found;
}

describe('the eval ladder request carries the personal day limits (PT-68h, F-V16)', () => {
    it('carries the daily loss limit and the daily profit cap', () => {
        expect(
            ladderRequestOf({ dailyProfitCap: dollars(700) }, dollars(600))
                .dayLimits,
        ).toStrictEqual({
            dailyLossLimit: dollars(600),
            dailyProfitCap: dollars(700),
        });
    });

    it('carries a lone daily loss limit with a null profit cap', () => {
        expect(ladderRequestOf({}, dollars(600)).dayLimits).toStrictEqual({
            dailyLossLimit: dollars(600),
            dailyProfitCap: null,
        });
    });

    it('leaves the field out when no day limit is set, so a plain account keeps its request and cache key', () => {
        const request = ladderRequestOf(
            { maxRiskPerTrade: dollars(250), maxTradesPerDay: 2 },
            null,
        );

        expect('dayLimits' in request).toBe(false);
    });
});
