import { describe, expect, it } from 'vitest';

import {
    ConsistencyScope,
    contractLimitAt,
    ContractLimitKind,
    dollars,
    DrawdownKind,
    E8FuturesVariant,
    evalContractLimit,
    FirmId,
    flatDayPolicy,
    fraction,
    INSTRUMENTS,
    maxContractsAt,
    PayoutFloorEffect,
    points,
    RungSizing,
    serializePlanId,
    tierContextFromProfits,
} from '~/lib/prop-calculator/core';
import { newFundedCycleTracker } from '~/lib/prop-calculator/core/FundedPayoutCycle';
import { TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';
import { ALL_FIRMS, findFirm } from '~/lib/prop-calculator/firms';
import { E8Futures } from '~/lib/prop-calculator/firms/e8futures/E8Futures';
import { type Rng } from '~/lib/prop-calculator/rng';
import {
    LossStreak,
    newPhaseStats,
    runDay,
    TradeTotals,
} from '~/lib/prop-calculator/simulator';

const alwaysLoses: Rng = () => 0.99;

function findE8ZeroPlan(variant: E8FuturesVariant) {
    const found = new E8Futures().findPlan({
        accountSize: 50_000,
        firm: FirmId.E8Futures,
        variant,
    });
    if (!found) throw new Error(`E8 Zero plan ${variant} not found`);
    return found;
}

function signatureEvalMnqLossBalance(risk: number): number {
    const state = plan.initialState();
    const totals = new TradeTotals();
    const stats = newPhaseStats(
        state.startingBalance,
        totals,
        new LossStreak(totals),
    );
    runDay({
        commission: dollars(0),
        dayPolicy: flatDayPolicy(risk, 1),
        phase: TradingPhase.Eval,
        plan,
        positionSizing: {
            instrument: INSTRUMENTS.MNQ,
            stopPoints: points(20),
        },
        rng: alwaysLoses,
        rrRatio: 1,
        rungSizing: RungSizing.CapToCushion,
        state,
        stats,
        winrate: fraction(0.5),
    });
    return state.balance;
}

const plan = (() => {
    const found = new E8Futures().findPlan({
        accountSize: 50_000,
        firm: FirmId.E8Futures,
        variant: E8FuturesVariant.Signature,
    });
    if (!found) throw new Error('E8 Futures Signature 50K plan not found');
    return found;
})();

describe('E8 Futures Signature 50K', () => {
    it('is registered in ALL_FIRMS and findable via findFirm', () => {
        expect(findFirm(FirmId.E8Futures)).toBeInstanceOf(E8Futures);
        expect(ALL_FIRMS.some((firm) => firm.id === FirmId.E8Futures)).toBe(
            true,
        );
    });

    it('matches the live-verified core numbers', () => {
        expect(plan.drawdown.kind).toBe(DrawdownKind.EodTrailing);
        expect(plan.drawdown.amount).toBe(2000);
        expect(plan.drawdown.lock?.atProfit).toBe(2000);
        expect(plan.drawdown.lock?.lockedThreshold(50_000)).toBe(50_000);
        expect(plan.profitTarget).toBe(3000);
        expect(plan.fees.oneTimeEval).toBe(160);
        expect(plan.fees.reset).toBe(160);
        expect(plan.minPayoutProfit).toBe(2000);
    });

    it('stays EOD-trailing once funded instead of switching to an intraday trail', () => {
        expect(plan.fundedDrawdown.kind).toBe(DrawdownKind.EodTrailing);
        expect(plan.fundedDrawdown).toBe(plan.drawdown);
    });

    it('does not repeat the TPT bug: minPayoutRequest is explicit and independent of minPayoutProfit', () => {
        expect(plan.minPayoutRequest).toBe(125);
        expect(plan.minPayoutRequest).not.toBe(plan.minPayoutProfit);
    });

    it('applies the 35% consistency bar to the funded stage only', () => {
        expect(plan.evalConsistencyRule()).toBeNull();
        const funded = plan.fundedConsistencyRule();
        expect(funded?.scope).toBe(ConsistencyScope.Funded);
        expect(funded?.maxBestDayShare).toBe(0.35);
    });

    it('the payout cap steps up by payout count (1250 / 2250 / 3250), not a flat first-tier value', () => {
        const state = plan.initialState();
        expect(plan.resolvedPayoutCap(state, 0).requestCap).toBe(1250);
        expect(plan.resolvedPayoutCap(state, 1).requestCap).toBe(1250);
        expect(plan.resolvedPayoutCap(state, 2).requestCap).toBe(2250);
        expect(plan.resolvedPayoutCap(state, 3).requestCap).toBe(2250);
        expect(plan.resolvedPayoutCap(state, 4).requestCap).toBe(3250);
        expect(plan.resolvedPayoutCap(state, 40).requestCap).toBe(3250);
    });

    it('closes both the evaluation and funded account after 7 consecutive days without a trade (live-verified 2026-09-13 against helpfutures.e8markets.com)', () => {
        expect(plan.maxConsecutiveIdleDays).toBe(7);
    });

    it(
        'concludes the funded cycle after 5 lifetime payouts, not indefinitely at the flat $3,250 tier ' +
            "(live-verified 2026-09-14 against helpfutures.e8markets.com's 'Payout caps and buffers for E8 Signature Futures explained')",
        () => {
            expect(plan.maxLifetimePayouts).toBe(5);
            expect(plan.isAccountConcluded(4)).toBe(false);
            expect(plan.isAccountConcluded(5)).toBe(true);
        },
    );

    it("caps contracts by the $40,000 margin allowance: 4 minis at $10,000 and 40 micros at $1,000, eval and funded (pasted 2026-09-23 from helpfutures.e8markets.com's 'Max. available Contract Sizes')", () => {
        expect(plan.contractLimits?.evalMinis).toBe(4);
        expect(plan.contractLimits?.evalMicros).toBe(40);
        expect(plan.contractLimits?.fundedMinis).toStrictEqual({
            kind: ContractLimitKind.Flat,
            maxContracts: 4,
        });
        expect(plan.contractLimits?.fundedMicros).toStrictEqual({
            kind: ContractLimitKind.Flat,
            maxContracts: 40,
        });
        expect(
            contractLimitAt(
                plan.contractLimits,
                TradingPhase.Funded,
                true,
                tierContextFromProfits(0),
            ),
        ).toBe(40);
        expect(evalContractLimit(plan.contractLimits, true)).toBe(40);
        expect(
            contractLimitAt(
                plan.contractLimits,
                TradingPhase.Funded,
                false,
                tierContextFromProfits(0),
            ),
        ).toBe(4);
    });

    it('sizes a $250 MNQ loss on a 20-point stop at the full $250, not capped at 4 micros ($160)', () => {
        expect(signatureEvalMnqLossBalance(250)).toBe(49_750);
    });

    it('still caps an MNQ trade at 40 micros: a $2,000 intent on a 20-point stop loses $1,600', () => {
        expect(signatureEvalMnqLossBalance(2000)).toBe(48_400);
    });

    it(
        'has no explicit day-count gate on the first payout, but still requires 5 profitable days between every payout after ' +
            "(corrected 2026-09-18: 'What is Payout On Demand?' and 'Everything about Payouts' both state the old '3 days for the first payout' figure was never a separate rule, only how the 35% Best Day Rule's own math happens to work out; live-verified against helpfutures.e8markets.com)",
        () => {
            expect(plan.minDaysAfterPassForPayout).toBe(0);
            expect(plan.minDaysAfterPassForPayoutPerCycle).toBe(5);
            expect(plan.minQualifyingDayProfit).toBe(150);

            const state = plan.initialState();
            state.threshold = state.startingBalance;
            state.thresholdLocked = true;
            const tracker = newFundedCycleTracker(state);
            state.balance = state.startingBalance + 10_000;

            state.qualifyingDays = 0;
            tracker.recordSessionClose(state);
            const firstPayout = tracker.tryPayout({
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan,
                state,
            });
            expect(firstPayout).not.toBeNull();
            expect(tracker.payoutsIssued).toBe(1);

            state.balance += 3000;
            state.qualifyingDays += 4;
            tracker.recordSessionClose(state);
            expect(
                tracker.tryPayout({
                    minRetainedCushion: 0,
                    payoutRequestSize: undefined,
                    plan,
                    state,
                }),
            ).toBeNull();

            state.qualifyingDays += 1;
            tracker.recordSessionClose(state);
            const secondPayout = tracker.tryPayout({
                minRetainedCushion: 0,
                payoutRequestSize: undefined,
                plan,
                state,
            });
            expect(secondPayout).not.toBeNull();
        },
    );

    it('the $1,000 daily pause locks the day out once funded, without busting the account, and does not apply during the eval', () => {
        const evalState = plan.initialState();
        evalState.balance -= 1000;
        evalState.todayPnL = -1000;
        expect(plan.isDayLockedOut(evalState, TradingPhase.Eval)).toBe(false);
        expect(plan.isBust(evalState, TradingPhase.Eval)).toBe(false);

        const fundedState = plan.initialState();
        fundedState.balance -= 1000;
        fundedState.todayPnL = -1000;
        expect(plan.isDayLockedOut(fundedState, TradingPhase.Funded)).toBe(
            true,
        );
        expect(plan.isBust(fundedState, TradingPhase.Funded)).toBe(false);
    });
});

describe('E8 Zero (MAX/Starter x 80%/100% payout) 50K', () => {
    it('registers all 4 variants alongside Signature (5 E8 Futures plans total)', () => {
        const firm = new E8Futures();
        expect(firm.plans).toHaveLength(5);
        for (const variant of [
            E8FuturesVariant.Signature,
            E8FuturesVariant.ZeroMax80,
            E8FuturesVariant.ZeroMax100,
            E8FuturesVariant.ZeroStarter80,
            E8FuturesVariant.ZeroStarter100,
        ]) {
            expect(
                firm.findPlan({
                    accountSize: 50_000,
                    firm: FirmId.E8Futures,
                    variant,
                }),
            ).toBeDefined();
        }
    });

    it('caps funded accounts at 3, lower than Signature\'s 5 (live-verified against help.e8markets.com\'s "How many accounts can I apply for at once?")', () => {
        expect(
            findE8ZeroPlan(E8FuturesVariant.ZeroMax80).maxFundedAccounts,
        ).toBe(3);
        expect(
            findE8ZeroPlan(E8FuturesVariant.ZeroMax100).maxFundedAccounts,
        ).toBe(3);
        expect(
            findE8ZeroPlan(E8FuturesVariant.ZeroStarter80).maxFundedAccounts,
        ).toBe(3);
        expect(
            findE8ZeroPlan(E8FuturesVariant.ZeroStarter100).maxFundedAccounts,
        ).toBe(3);
        expect(plan.maxFundedAccounts).toBe(5);
    });

    it('applies the 40% consistency rule to the challenge/eval stage only, the reverse of Signature', () => {
        const zero = findE8ZeroPlan(E8FuturesVariant.ZeroMax80);
        const evalRule = zero.evalConsistencyRule();
        expect(evalRule?.scope).toBe(ConsistencyScope.Eval);
        expect(evalRule?.maxBestDayShare).toBe(0.4);
        expect(zero.fundedConsistencyRule()).toBeNull();
    });

    it(
        'matches the live-verified $1,500 drawdown and $3,000 target on both stages, but only the funded-stage floor locks ' +
            "(fixed 2026-09-18: the challenge-stage EOD Dynamic Drawdown was previously locking too, contradicting the plan's own article: 'In challange stage of E8 Zero, the Eod Drawdown scales with your profit... the loss level is not being locked at the initial balance and can go further')",
        () => {
            const zero = findE8ZeroPlan(E8FuturesVariant.ZeroMax80);
            expect(zero.drawdown.kind).toBe(DrawdownKind.EodTrailing);
            expect(zero.drawdown.amount).toBe(1500);
            expect(zero.drawdown.lock).toBeUndefined();
            expect(zero.fundedDrawdown.kind).toBe(DrawdownKind.EodTrailing);
            expect(zero.fundedDrawdown.amount).toBe(1500);
            expect(zero.fundedDrawdown.lock?.atProfit).toBe(1500);
            expect(zero.fundedDrawdown.lock?.lockedThreshold(50_000)).toBe(
                50_000,
            );
            expect(zero.profitTarget).toBe(3000);
            expect(
                zero.isDayLockedOut(zero.initialState(), TradingPhase.Eval),
            ).toBe(false);
        },
    );

    it('actually keeps trailing through the challenge stage past the $1,500 point that would lock it funded, run forward day by day rather than just checked by config', () => {
        const zero = findE8ZeroPlan(E8FuturesVariant.ZeroMax80);

        const evalState = zero.initialState();
        evalState.balance = evalState.startingBalance + 1000;
        zero.drawdown.onDayClose(evalState);
        evalState.balance += 1000;
        zero.drawdown.onDayClose(evalState);
        expect(evalState.thresholdLocked).toBe(false);
        expect(evalState.threshold).toBe(evalState.balance - 1500);

        const fundedState = zero.initialState();
        fundedState.balance = fundedState.startingBalance + 1000;
        zero.fundedDrawdown.onDayClose(fundedState);
        fundedState.balance += 1000;
        zero.fundedDrawdown.onDayClose(fundedState);
        expect(fundedState.thresholdLocked).toBe(true);
        expect(fundedState.threshold).toBe(fundedState.startingBalance);
    });

    it('prices MAX above Starter, and 100% payout above 80%, at the $50K list price with no coupon (e8futures.com configurator, 2026-09-23)', () => {
        const maxEighty = findE8ZeroPlan(E8FuturesVariant.ZeroMax80);
        const maxHundred = findE8ZeroPlan(E8FuturesVariant.ZeroMax100);
        const starterEighty = findE8ZeroPlan(E8FuturesVariant.ZeroStarter80);
        const starterHundred = findE8ZeroPlan(E8FuturesVariant.ZeroStarter100);

        expect(maxEighty.fees.oneTimeEval).toBe(328);
        expect(maxHundred.fees.oneTimeEval).toBe(428);
        expect(starterEighty.fees.oneTimeEval).toBe(178);
        expect(starterHundred.fees.oneTimeEval).toBe(228);
        for (const zero of [
            maxEighty,
            maxHundred,
            starterEighty,
            starterHundred,
        ]) {
            expect(zero.fees.reset).toBe(zero.fees.oneTimeEval);
        }

        expect(maxEighty.payoutFromProfit(1000, 0)).toBeCloseTo(800, 6);
        expect(maxHundred.payoutFromProfit(1000, 0)).toBeCloseTo(1000, 6);

        expect(maxEighty.payoutRequestCap).toBe(3000);
        expect(starterEighty.payoutRequestCap).toBe(1000);
    });

    it('scales the funded contract limit 2 -> 3 -> 5 with profit, matching the live account-profit tiers', () => {
        const zero = findE8ZeroPlan(E8FuturesVariant.ZeroMax80);
        const funded = zero.contractLimits?.fundedMinis;
        if (funded?.kind !== ContractLimitKind.Tiered) {
            throw new Error('expected a tiered funded contract limit');
        }
        expect(maxContractsAt(funded, tierContextFromProfits(0))).toBe(2);
        expect(maxContractsAt(funded, tierContextFromProfits(749))).toBe(2);
        expect(maxContractsAt(funded, tierContextFromProfits(750))).toBe(3);
        expect(maxContractsAt(funded, tierContextFromProfits(1499))).toBe(3);
        expect(maxContractsAt(funded, tierContextFromProfits(1500))).toBe(5);
        expect(zero.contractLimits?.evalMinis).toBe(4);
    });

    it("caps micros by margin like minis: 40 in the challenge and 20 -> 30 -> 50 funded, at $1,000 per micro against the $40,000 and $20,000/$30,000/$50,000 allowances (pasted 2026-09-23 from 'Max. available Contract Sizes')", () => {
        const zero = findE8ZeroPlan(E8FuturesVariant.ZeroStarter80);
        expect(zero.contractLimits?.evalMicros).toBe(40);
        expect(evalContractLimit(zero.contractLimits, true)).toBe(40);
        const fundedMicros = zero.contractLimits?.fundedMicros ?? null;
        expect(maxContractsAt(fundedMicros, tierContextFromProfits(0))).toBe(
            20,
        );
        expect(maxContractsAt(fundedMicros, tierContextFromProfits(749))).toBe(
            20,
        );
        expect(maxContractsAt(fundedMicros, tierContextFromProfits(750))).toBe(
            30,
        );
        expect(maxContractsAt(fundedMicros, tierContextFromProfits(1499))).toBe(
            30,
        );
        expect(maxContractsAt(fundedMicros, tierContextFromProfits(1500))).toBe(
            50,
        );
        expect(
            contractLimitAt(
                zero.contractLimits,
                TradingPhase.Funded,
                true,
                tierContextFromProfits(1500, 0),
            ),
        ).toBe(20);
    });

    it('funds daily with a $100 floor and no qualifying-day gate, unlike Signature', () => {
        const zero = findE8ZeroPlan(E8FuturesVariant.ZeroMax80);
        expect(zero.minDaysAfterPassForPayout).toBe(0);
        expect(zero.minPayoutRequest).toBe(100);
        expect(zero.minPayoutProfit).toBe(100);
        expect(zero.minPayoutProfitPerCycle).toBe(100);
        expect(zero.minQualifyingDayProfit).toBeNull();
    });

    it('locks the drawdown floor to breakeven on the first payout, before profit reaches the $1,500 natural lock threshold', () => {
        const zero = findE8ZeroPlan(E8FuturesVariant.ZeroMax80);
        expect(zero.payoutFloorEffect).toBe(PayoutFloorEffect.LockAtPlanFloor);

        const state = zero.initialState();
        state.balance = state.startingBalance + 300;
        state.threshold = state.balance - 1500;
        state.thresholdLocked = false;
        state.qualifyingDays = 0;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.startingBalance;
        tracker.qualifyingDaysAtLastPayout = 0;

        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan: zero,
            state,
        });

        expect(payout).not.toBeNull();
        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(state.startingBalance);
    });
});

describe('E8 Futures fee basis across Signature and Zero', () => {
    it('ranks all five plans by list eval fee: Signature 160 < Starter80 178 < Starter100 228 < Max80 328 < Max100 428', () => {
        const ranked = new E8Futures().plans
            .toSorted((a, b) => a.fees.oneTimeEval - b.fees.oneTimeEval)
            .map((p) => [serializePlanId(p.id), p.fees.oneTimeEval]);
        expect(ranked).toStrictEqual(
            (
                [
                    [E8FuturesVariant.Signature, 160],
                    [E8FuturesVariant.ZeroStarter80, 178],
                    [E8FuturesVariant.ZeroStarter100, 228],
                    [E8FuturesVariant.ZeroMax80, 328],
                    [E8FuturesVariant.ZeroMax100, 428],
                ] as const
            ).map(([variant, fee]) => [
                serializePlanId({
                    accountSize: 50_000,
                    firm: FirmId.E8Futures,
                    variant,
                }),
                fee,
            ]),
        );
    });
});

function fundedStates() {
    const states = [];
    for (let balance = 50_000; balance <= 56_000; balance += 250) {
        for (const threshold of [balance - 2000, balance - 1000, 50_000]) {
            for (const payoutsIssued of [0, 1, 3]) {
                for (const cycleProfit of [0, 500, 2000, 4000]) {
                    for (const minRetainedCushion of [0, 2000]) {
                        states.push({
                            balance,
                            cycleProfit,
                            minRetainedCushion,
                            payoutsIssued,
                            threshold,
                        });
                    }
                }
            }
        }
    }
    return states;
}

describe('E8 Signature payout buffer: a buffer equal to the EOD drawdown can not be requested (11864618)', () => {
    const withoutProfitGate = plan.withOverrides({
        minPayoutProfit: dollars(0),
    });
    const bufferBalance = plan.accountSize + plan.fundedDrawdown.amount;

    function payoutFor(
        target: typeof plan,
        scenario: ReturnType<typeof fundedStates>[number],
    ) {
        const state = target.initialState();
        target.beginFundedPhase(state);
        state.balance = scenario.balance;
        state.threshold = scenario.threshold;
        state.thresholdLocked = scenario.threshold === 50_000;
        state.qualifyingDays = 10;
        const tracker = newFundedCycleTracker(state);
        tracker.payoutsIssued = scenario.payoutsIssued;
        tracker.qualifyingDaysAtLastPayout = 0;
        tracker.lastPayoutBalance =
            scenario.payoutsIssued === 0
                ? state.startingBalance
                : scenario.balance - scenario.cycleProfit;
        tracker.recordSessionClose(state);
        const payout = tracker.tryPayout({
            minRetainedCushion: scenario.minRetainedCushion,
            payoutRequestSize: undefined,
            plan: target,
            state,
        });
        return { balanceAfter: state.balance, payout };
    }

    it('models the buffer as a $52,000 balance floor on every payout', () => {
        expect(
            plan.payoutBuffer?.requiredBalance(
                plan.accountSize,
                plan.fundedDrawdown.amount,
            ),
        ).toBe(52_000);
        expect(bufferBalance).toBe(52_000);
    });

    it('never lets a payout take the balance below the $52,000 buffer', () => {
        let paid = 0;
        for (const scenario of fundedStates()) {
            const { balanceAfter, payout } = payoutFor(plan, scenario);
            if (payout === null) continue;
            paid += 1;
            expect(balanceAfter).toBeGreaterThanOrEqual(bufferBalance);
        }
        expect(paid).toBeGreaterThan(50);
    });

    it('makes the $2,000 first-payout profit gate redundant: removing it changes no payout', () => {
        for (const scenario of fundedStates()) {
            expect(payoutFor(withoutProfitGate, scenario).payout).toStrictEqual(
                payoutFor(plan, scenario).payout,
            );
        }
    });
});
