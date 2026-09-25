import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    DailyLossLimitKind,
    INSTRUMENTS,
    InstrumentSymbol,
    type LivePlan,
} from '~/lib/prop-calculator/core';
import * as TopStepLiveModule from '~/lib/prop-calculator/firms/topstep/TopStepLive';
import { buildTopStepLivePlan } from '~/lib/prop-calculator/firms/topstep/TopStepLive';

const DAILY_LOSS_LIMIT_KINDS: readonly unknown[] =
    Object.values(DailyLossLimitKind);

function isDailyLossLimitConfigShaped(value: unknown): boolean {
    return (
        typeof value === 'object' &&
        value !== null &&
        'kind' in value &&
        DAILY_LOSS_LIMIT_KINDS.includes(value.kind)
    );
}

describe('WP18h hardening: a live contract limit is only resolved through the plan, so no consumer can skip a tier gate', () => {
    it('keeps the tiered contract-limit config off the public LivePlan surface', () => {
        expectTypeOf<LivePlan>().not.toHaveProperty('contractLimits');
        expectTypeOf<LivePlan>().toHaveProperty('maxContractsFor');
    });

    it('keeps the daily loss limit config off the public LivePlan surface, so the limit is only read through dailyLossLimitFor and its tier gate', () => {
        expectTypeOf<LivePlan>().not.toHaveProperty('liveDailyLossLimit');
        expectTypeOf<LivePlan>().toHaveProperty('dailyLossLimitFor');
    });

    it('keeps the tier-gated TopStep LFA daily loss limit config private to its module, so no consumer can resolve it on a session-open context and skip the 10 Active Trading Day gate', () => {
        const exported = Object.entries(TopStepLiveModule)
            .filter(([, value]) => isDailyLossLimitConfigShaped(value))
            .map(([name]) => name);

        expect(exported).toStrictEqual([]);
    });

    it('holds TopStep LFA at 5 lots after a $100,000 session until the tier has 10 Active Trading Days, which a direct session-open read of the config would have skipped', () => {
        const plan = buildTopStepLivePlan();
        const state = plan.initialState();
        const nq = INSTRUMENTS[InstrumentSymbol.NQ];

        state.todayPnL = 100_000;
        state.balance += 100_000;
        plan.recordDayClose(state, true);
        state.todayPnL = 0;

        expect(plan.maxContractsFor(state, nq)).toBe(5);
        expect(plan.dailyLossLimitFor(state)).toBe(2000);
    });
});
