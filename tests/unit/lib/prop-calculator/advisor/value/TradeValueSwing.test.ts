import { describe, expect, it } from 'vitest';

import {
    AccountReconstruction,
    buildEnginePolicy,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    NO_PENDING_PAYOUT_COUNTS,
    type ReconstructedAccount,
    type ReconstructedFundedOrEvalAccount,
    ReconstructedLiveKind,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import {
    type DocumentedPolicySpec,
    type EnginePolicy,
} from '~/lib/prop-calculator/advisor/policy';
import {
    TRADE_VALUE_SWING_ASSUMPTION,
    tradeValueSwing,
} from '~/lib/prop-calculator/advisor/value/TradeValueSwing';
import { valueAtState } from '~/lib/prop-calculator/advisor/value/ValueAtState';
import {
    evalStartAccount,
    freshFundedAccount,
} from '~/lib/prop-calculator/advisor/value/ValueChain';
import {
    isValueResult,
    type ValueResult,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value/ValueEstimate';
import {
    type AccountState,
    applyClosedTrade,
    closeTradingDay,
    dollars,
    FirmId,
    FtmoFuturesVariant,
    MffuVariant,
    newFundedCycleTracker,
    type Plan,
    recordBestDay,
    resetForNewDay,
    TopStepVariant,
    TradeifyVariant,
    TradingPhase,
} from '~/lib/prop-calculator/core';
import { findFirm } from '~/lib/prop-calculator/firms';

function closedSession(
    account: ReconstructedFundedOrEvalAccount,
    pnl: number,
): ReconstructedFundedOrEvalAccount {
    const state = { ...account.state };
    applyClosedTrade(state, account.plan, account.kind, pnl);
    closeTradingDay(account.plan, account.kind, state, true);
    if (account.kind === TradingPhase.Eval) {
        recordBestDay(state);
        resetForNewDay(state);
        return { ...account, state };
    }
    const tracker = newFundedCycleTracker(account.state);
    tracker.cycleBestDayProfit = Math.max(0, state.todayPnL);
    tracker.recordSessionClose(state);
    resetForNewDay(state);
    return { ...account, fundedTracker: tracker, state };
}

function expectedValue(
    account: ReconstructedFundedOrEvalAccount,
    spec: DocumentedPolicySpec,
): ValueResult {
    const outcome = valueAtState(account, spec);
    if (!isValueResult(outcome)) throw new Error('expected a value result');
    return outcome;
}

function ftmoPlan(variant: FtmoFuturesVariant): Plan {
    const plan = findFirm(FirmId.FtmoFutures)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.FtmoFutures,
        variant,
    });
    if (!plan) throw new Error('FTMO Futures 50K plan not found');
    return plan;
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
        ...NO_PENDING_PAYOUT_COUNTS,
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

function topStepEval(
    balance: number,
    tradingDays: number,
): ReconstructedFundedOrEvalAccount {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep Standard/Standard 50K plan not found');
    const account = AccountReconstruction.rebuild(
        {
            asOf: '2026-01-05',
            balance: dollars(balance),
            dashboardConvention: DashboardBalanceConvention.Nominal,
            elapsedDaysSinceAttemptStart: tradingDays,
            highestEodBalance: dollars(Math.max(balance, 50_000)),
            stage: SizingStage.Eval,
            tradingDays,
        },
        plan,
        null,
        NO_PENDING_PAYOUT_COUNTS,
    );
    if (account.kind !== TradingPhase.Eval)
        throw new Error('expected an eval account');
    return account;
}

function topStepPlan(): Plan {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep Standard/Standard 50K plan not found');
    return plan;
}

describe('tradeValueSwing (F-V17, PT-65a step 3)', () => {
    it('returns V(now), V(after win) and V(after loss) built with applyClosedTrade, all sharing the seed', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });

        const outcome = tradeValueSwing(account, spec, { risk: 250, rr: 2 });
        if (outcome.kind !== ValueResultKind.Swing)
            throw new Error('expected a swing result');

        expect(outcome.now).toEqual(expectedValue(account, spec));

        expect(outcome.afterWin).toEqual(
            expectedValue(closedSession(account, 500), spec),
        );

        const lostSession = closedSession(account, -250);
        expect(plan.isBust(lostSession.state, TradingPhase.Funded)).toBe(false);
        expect(outcome.afterLoss).toEqual(expectedValue(lostSession, spec));
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
        if (outcome.kind !== ValueResultKind.Swing)
            throw new Error('expected a swing result');

        expect(outcome.afterWin).toEqual(
            expectedValue(
                closedSession(
                    account,
                    250 * 2 - spec.enginePolicy.commissionPerRoundTrip,
                ),
                spec,
            ),
        );
        expect(outcome.afterLoss).toEqual(
            expectedValue(
                closedSession(
                    account,
                    -250 - spec.enginePolicy.commissionPerRoundTrip,
                ),
                spec,
            ),
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
            ...NO_PENDING_PAYOUT_COUNTS,
        };

        const outcome = tradeValueSwing(account, spec, { risk: 250, rr: 2 });
        if (outcome.kind !== ValueResultKind.Swing)
            throw new Error('expected a swing result');

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
            ...NO_PENDING_PAYOUT_COUNTS,
        };
        expect(outcome.afterLoss).toEqual(expectedValue(freshAccount, spec));
    });

    it('is not modeled for a live account', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = liveAccount(plan);

        expect(
            tradeValueSwing(account, spec, { risk: 250, rr: 2 }),
        ).toStrictEqual({ kind: 'not-modeled', reason: 'live-not-modeled' });
    });

    it('is deterministic per seed', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });

        expect(
            tradeValueSwing(account, spec, { risk: 250, rr: 2 }),
        ).toStrictEqual(tradeValueSwing(account, spec, { risk: 250, rr: 2 }));
    });

    it('states the session boundary it values at', () => {
        const plan = rapidEodPlan();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_800 });

        const outcome = tradeValueSwing(account, spec, { risk: 250, rr: 2 });
        if (outcome.kind !== ValueResultKind.Swing)
            throw new Error('expected a swing result');

        expect(outcome.assumption).toBe(TRADE_VALUE_SWING_ASSUMPTION);
        expect(TRADE_VALUE_SWING_ASSUMPTION).toBe(
            'valued at the next session start, as if you stop after this trade',
        );
    });

    it('funded: the after-win value is the value at the start of the next session, with the day counted as the cycle best day', () => {
        const plan = findFirm(FirmId.Tradeify)?.findPlan({
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Growth,
        });
        if (!plan) throw new Error('Tradeify Growth 50K plan not found');
        expect(plan.fundedConsistencyRule(0)).not.toBeNull();
        const spec = specFor(plan);
        const account = fundedAccount(plan, { balance: 50_900 });

        const outcome = tradeValueSwing(account, spec, { risk: 300, rr: 2 });
        if (outcome.kind !== ValueResultKind.Swing)
            throw new Error('expected a swing result');

        const won = closedSession(
            account,
            300 * 2 - spec.enginePolicy.commissionPerRoundTrip,
        );
        expect(won.fundedTracker?.cycleBestDayProfit).toBeGreaterThan(0);
        expect(won.state.todayPnL).toBe(0);
        expect(outcome.afterWin).toEqual(expectedValue(won, spec));
    });

    describe('a terminating daily loss limit', () => {
        it('values a funded loss that reaches the daily limit as a bust, though the drawdown is far away', () => {
            const plan = ftmoPlan(FtmoFuturesVariant.Pro);
            const spec = specFor(plan);
            const account = fundedAccount(plan, { balance: 52_000 });
            const limit = plan.resolvedDailyLossLimit(
                account.state,
                TradingPhase.Funded,
            );
            expect(limit).not.toBeNull();

            const outcome = tradeValueSwing(account, spec, {
                risk: (limit ?? 0) - spec.enginePolicy.commissionPerRoundTrip,
                rr: 2,
            });
            if (outcome.kind !== ValueResultKind.Swing)
                throw new Error('expected a swing result');

            expect(outcome.afterLossBusted).toBe(true);
            expect(outcome.afterLossRebuyLagDays).toBe(
                spec.enginePolicy.rebuyLagDays,
            );
        });

        it('values an eval loss that reaches the daily limit as a bust', () => {
            const plan = ftmoPlan(FtmoFuturesVariant.Pro);
            const spec = specFor(plan);
            const state = plan.initialState();
            const account: ReconstructedFundedOrEvalAccount = {
                assumptions: [],
                contractLimit: null,
                cushion: state.balance - state.threshold,
                fundedTracker: null,
                kind: TradingPhase.Eval,
                plan,
                resolvedDailyLossLimit: null,
                state,
                ...NO_PENDING_PAYOUT_COUNTS,
            };
            const limit = plan.resolvedDailyLossLimit(state, TradingPhase.Eval);
            expect(limit).not.toBeNull();

            const outcome = tradeValueSwing(account, spec, {
                risk: (limit ?? 0) - spec.enginePolicy.commissionPerRoundTrip,
                rr: 2,
            });
            if (outcome.kind !== ValueResultKind.Swing)
                throw new Error('expected a swing result');

            expect(outcome.afterLossBusted).toBe(true);
        });

        it('keeps a loss under the daily limit alive', () => {
            const plan = ftmoPlan(FtmoFuturesVariant.Pro);
            const spec = specFor(plan);
            const account = fundedAccount(plan, { balance: 52_000 });

            const outcome = tradeValueSwing(account, spec, {
                risk: 400,
                rr: 2,
            });
            if (outcome.kind !== ValueResultKind.Swing)
                throw new Error('expected a swing result');

            expect(outcome.afterLossBusted).toBe(false);
        });

        it('does not bust a lockout-only plan on the same loss', () => {
            const plan = ftmoPlan(FtmoFuturesVariant.Growth);
            const spec = specFor(plan);
            const account = fundedAccount(plan, { balance: 52_000 });

            const outcome = tradeValueSwing(account, spec, {
                risk: 900,
                rr: 2,
            });
            if (outcome.kind !== ValueResultKind.Swing)
                throw new Error('expected a swing result');

            expect(outcome.afterLossBusted).toBe(false);
        });
    });

    describe('a ladder of rungs, each taken only after the earlier ones lost', () => {
        it('prices rung four from the account after the three earlier losses, where its own loss busts', () => {
            const plan = topStepPlan();
            const spec = specFor(plan);
            const commission = spec.enginePolicy.commissionPerRoundTrip;
            const account = evalStartAccount(plan);
            const earlierRisks = [400, 600, 800];

            const fourth = tradeValueSwing(account, spec, {
                earlierRisks,
                risk: 200,
                rr: 2,
            });
            if (fourth.kind !== ValueResultKind.Swing)
                throw new Error('expected a swing result');
            const first = tradeValueSwing(account, spec, { risk: 400, rr: 2 });
            if (first.kind !== ValueResultKind.Swing)
                throw new Error('expected a swing result');

            expect(first.afterLossBusted).toBe(false);
            expect(fourth.afterLossBusted).toBe(true);
            expect(fourth.afterLossRebuyLagDays).toBe(
                spec.enginePolicy.rebuyLagDays,
            );
            const afterThree = closedSession(account, -1800 - 3 * commission);
            expect(fourth.now).toEqual(expectedValue(afterThree, spec));
            expect(fourth.afterWin).toEqual(
                expectedValue(
                    closedSession(
                        account,
                        -1800 - 3 * commission + 400 - commission,
                    ),
                    spec,
                ),
            );
        });

        it('prices the second rung from the account after the first loss', () => {
            const plan = topStepPlan();
            const spec = specFor(plan);
            const commission = spec.enginePolicy.commissionPerRoundTrip;
            const account = evalStartAccount(plan);

            const second = tradeValueSwing(account, spec, {
                earlierRisks: [400],
                risk: 600,
                rr: 2,
            });
            if (second.kind !== ValueResultKind.Swing)
                throw new Error('expected a swing result');

            expect(second.now).toEqual(
                expectedValue(closedSession(account, -400 - commission), spec),
            );
            expect(second.afterLoss).toEqual(
                expectedValue(
                    closedSession(account, -1000 - 2 * commission),
                    spec,
                ),
            );
        });

        it('refuses a rung that the earlier losses already make unreachable', () => {
            const plan = topStepPlan();
            const spec = specFor(plan);

            expect(() =>
                tradeValueSwing(evalStartAccount(plan), spec, {
                    earlierRisks: [2000],
                    risk: 200,
                    rr: 2,
                }),
            ).toThrow(/never taken/);
        });
    });

    describe('eval accounts rebuilt from a snapshot', () => {
        it('gives a real swing instead of failing on the day PnL, valued after a closed session', () => {
            const account = topStepEval(50_400, 4);
            const spec = specFor(account.plan);

            const outcome = tradeValueSwing(account, spec, {
                risk: 300,
                rr: 2,
            });
            if (outcome.kind !== ValueResultKind.Swing)
                throw new Error('expected a swing result');

            const commission = spec.enginePolicy.commissionPerRoundTrip;
            expect(outcome.afterWin).toEqual(
                expectedValue(closedSession(account, 600 - commission), spec),
            );
            expect(outcome.afterLoss).toEqual(
                expectedValue(closedSession(account, -300 - commission), spec),
            );
            expect(outcome.afterLossBusted).toBe(false);
            expect(outcome.assumption).toBe(TRADE_VALUE_SWING_ASSUMPTION);
        });

        it('values a win that reaches the profit target as a passed eval, the plan funded start, never a throw', () => {
            const plan = findFirm(FirmId.TopStep)?.findPlan({
                accountSize: 50_000,
                firm: FirmId.TopStep,
                variant: TopStepVariant.StandardStandard,
            });
            if (!plan) throw new Error('plan not found');
            const account = topStepEval(50_000 + plan.profitTarget - 200, 5);
            const spec = specFor(plan);

            const outcome = tradeValueSwing(account, spec, {
                risk: 300,
                rr: 2,
            });
            if (outcome.kind !== ValueResultKind.Swing)
                throw new Error('expected a swing result');

            expect(plan.isPassed(closedSession(account, 600 - 4).state)).toBe(
                true,
            );
            expect(outcome.afterWin).toEqual(
                expectedValue(freshFundedAccount(plan), spec),
            );
        });

        it('values a busting loss as a fresh eval, with the rebuy lag disclosed', () => {
            const account = topStepEval(48_050, 5);
            const spec = specFor(account.plan);

            const outcome = tradeValueSwing(account, spec, {
                risk: 300,
                rr: 2,
            });
            if (outcome.kind !== ValueResultKind.Swing)
                throw new Error('expected a swing result');

            expect(outcome.afterLossBusted).toBe(true);
            expect(outcome.afterLossRebuyLagDays).toBe(
                spec.enginePolicy.rebuyLagDays,
            );
        });
    });
});
