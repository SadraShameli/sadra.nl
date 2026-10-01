import { describe, expect, it } from 'vitest';

import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';
import {
    type DocumentedPolicySpec,
    type EnginePolicy,
} from '~/lib/prop-calculator/advisor/policy';
import { tradeValueSwing } from '~/lib/prop-calculator/advisor/value/TradeValueSwing';
import { valueAtState } from '~/lib/prop-calculator/advisor/value/ValueAtState';
import {
    isValueResult,
    type ValueResult,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value/ValueEstimate';
import {
    type AccountState,
    applyClosedTrade,
    FirmId,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

function expectedValue(
    account: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): ValueResult {
    const outcome = valueAtState(account, spec);
    if (!isValueResult(outcome)) throw new Error('expected a value result');
    return outcome;
}

function fundedAccount(
    plan: Plan,
    overrides: Partial<AccountState> = {},
): ReconstructedFundedOrEvalAccount {
    const state = plan.initialState();
    plan.beginFundedPhase(state);
    Object.assign(state, overrides);
    return {
        assumptions: [],
        contractLimit: null,
        cushion: state.balance - state.threshold,
        fundedTracker: newFundedCycleTracker(state),
        kind: TradingPhase.Funded,
        plan,
        resolvedDailyLossLimit: null,
        state,
    };
}

function liveAccount(plan: Plan): ReconstructedAccount {
    return {
        assumptions: [],
        cushion: null,
        kind: ReconstructedLiveKind.Live,
        livePlan: null,
        plan,
        state: null,
    };
}

function policyFor(
    plan: Plan,
    overrides: Partial<EnginePolicy> = {},
): EnginePolicy {
    return {
        ...buildEnginePolicy({
            fundedHorizonDays: 90,
            plan,
            rulebook: DEFAULT_RULEBOOK,
        }).policy,
        ...overrides,
    };
}

function rapidEodPlan(): Plan {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.RapidEod,
    });
    if (!plan) throw new Error('MFF Rapid EOD 50K plan not found');
    return plan;
}

function specFor(
    plan: Plan,
    overrides: Partial<EnginePolicy> = {},
): DocumentedPolicySpec {
    return {
        enginePolicy: policyFor(plan, overrides),
        rulebook: DEFAULT_RULEBOOK,
        run: { maxEvalDays: 40, seed: 21, trials: 30 },
    };
}

describe('tradeValueSwing (F-V17, PT-65a step 3)', () => {
    it('returns V(now), V(after win) and V(after loss) built with applyClosedTrade, all sharing the seed', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });

        const outcome = tradeValueSwing(account, spec, { risk: 250, rr: 2 });
        if (outcome.kind !== ValueResultKind.Swing) throw new Error('expected a swing result');

        expect(outcome.now).toEqual(expectedValue(account, spec));

        const wonState = { ...account.state };
        applyClosedTrade(wonState, plan, TradingPhase.Funded, 500);
        expect(outcome.afterWin).toEqual(
            expectedValue({ ...account, state: wonState }, spec),
        );

        const lostState = { ...account.state };
        applyClosedTrade(lostState, plan, TradingPhase.Funded, -250);
        expect(plan.isBust(lostState, TradingPhase.Funded)).toBe(false);
        expect(outcome.afterLoss).toEqual(
            expectedValue({ ...account, state: lostState }, spec),
        );
        expect(outcome.afterLossBusted).toBe(false);
        expect(outcome.afterLossRebuyLagDays).toBeNull();

        expect(outcome.winProbability).toBe(DEFAULT_RULEBOOK.strategy.winrate);
        expect(outcome.deltaWin.value).toBeCloseTo(
            outcome.afterWin.creditInclusive.value -
                outcome.now.creditInclusive.value,
        );
        expect(outcome.deltaLoss.value).toBeCloseTo(
            outcome.afterLoss.creditInclusive.value -
                outcome.now.creditInclusive.value,
        );
    });

    it('nets the commission per round trip on the evaluated win and loss trades, matching the simulator (day.ts)', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan, { commissionPerRoundTrip: 4.52 });
        const account = fundedAccount(plan, { balance: 50_800 });

        const outcome = tradeValueSwing(account, spec, { risk: 250, rr: 2 });
        if (outcome.kind !== ValueResultKind.Swing) throw new Error('expected a swing result');

        const wonState = { ...account.state };
        applyClosedTrade(
            wonState,
            plan,
            TradingPhase.Funded,
            250 * 2 - spec.enginePolicy.commissionPerRoundTrip,
        );
        expect(outcome.afterWin).toEqual(
            expectedValue({ ...account, state: wonState }, spec),
        );

        const lostState = { ...account.state };
        applyClosedTrade(
            lostState,
            plan,
            TradingPhase.Funded,
            -250 - spec.enginePolicy.commissionPerRoundTrip,
        );
        expect(outcome.afterLoss).toEqual(
            expectedValue({ ...account, state: lostState }, spec),
        );
    });

    it('a loss that busts gives the refill value of a fresh eval account, with the rebuy lag disclosed', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const state = plan.initialState();
        plan.beginFundedPhase(state);
        state.balance = state.threshold + 250;
        const account: ReconstructedFundedOrEvalAccount = {
            assumptions: [],
            contractLimit: null,
            cushion: state.balance - state.threshold,
            fundedTracker: newFundedCycleTracker(state),
            kind: TradingPhase.Funded,
            plan,
            resolvedDailyLossLimit: null,
            state,
        };

        const outcome = tradeValueSwing(account, spec, { risk: 250, rr: 2 });
        if (outcome.kind !== ValueResultKind.Swing) throw new Error('expected a swing result');

        expect(outcome.afterLossBusted).toBe(true);
        expect(outcome.afterLossRebuyLagDays).toBe(
            spec.enginePolicy.rebuyLagDays,
        );

        const freshAccount: ReconstructedFundedOrEvalAccount = {
            assumptions: [],
            contractLimit: null,
            cushion: 0,
            fundedTracker: null,
            kind: TradingPhase.Eval,
            plan,
            resolvedDailyLossLimit: null,
            state: plan.initialState(),
        };
        expect(outcome.afterLoss).toEqual(expectedValue(freshAccount, spec));
    });

    it('is not modeled for a live account', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = liveAccount(plan);

        expect(tradeValueSwing(account, spec, { risk: 250, rr: 2 })).toStrictEqual(
            { kind: 'not-modeled', reason: 'live-not-modeled' },
        );
    });

    it('is deterministic per seed', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });

        expect(tradeValueSwing(account, spec, { risk: 250, rr: 2 })).toStrictEqual(
            tradeValueSwing(account, spec, { risk: 250, rr: 2 }),
        );
    });
});
