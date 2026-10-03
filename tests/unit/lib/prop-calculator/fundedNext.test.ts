import { describe, expect, it } from 'vitest';

import {
    contractLimitAt,
    ContractLimitKind,
    DailyLossLimitKind,
    FirmId,
    FundedNextVariant,
    initialEvalFee,
    INSTRUMENTS,
    InstrumentSymbol,
    newFundedCycleTracker,
    PayoutEvaluationKind,
    PayoutGate,
    percent,
    type Plan,
    PlanAvailability,
    resetFee,
    retryFee,
    RetryKind,
    retryPath,
    tierContextFromProfits,
} from '~/lib/prop-calculator/core';
import { TradingPhase } from '~/lib/prop-calculator/core/TradingPhase';
import { FundedNext } from '~/lib/prop-calculator/firms/fundednext/FundedNext';

const firm = new FundedNext();

function firstRewardAfterDays(plan: Plan, qualifyingDays: number) {
    const state = plan.initialState();
    state.balance = 55_000;
    state.thresholdLocked = true;
    state.threshold = 50_100;
    state.qualifyingDays = qualifyingDays;
    const tracker = newFundedCycleTracker(state);
    tracker.lastPayoutBalance = plan.accountSize;
    tracker.qualifyingDaysAtLastPayout = 0;
    tracker.recordSessionClose(state);
    return tracker.evaluatePayout({
        minRetainedCushion: 0,
        payoutRequestSize: undefined,
        plan,
        state,
    });
}

function legacyFirstPayoutAfterBenchmarkDays(plan: Plan, cycleProfit: number) {
    const state = plan.initialState();
    state.balance = plan.accountSize + cycleProfit;
    state.qualifyingDays = 5;
    const tracker = newFundedCycleTracker(state);
    tracker.lastPayoutBalance = plan.accountSize;
    tracker.qualifyingDaysAtLastPayout = 0;
    tracker.recordSessionClose(state);
    return tracker.tryPayout({
        minRetainedCushion: 0,
        payoutRequestSize: undefined,
        plan,
        state,
    });
}

function noteStarting(prefix: string) {
    const note = firm.notes.find((entry) => entry.startsWith(prefix));
    if (!note) throw new Error(`no FundedNext note starts with ${prefix}`);
    return note;
}

function planFor(variant: FundedNextVariant) {
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.FundedNext,
        variant,
    });
    if (!plan) throw new Error(`FundedNext ${variant} 50K plan not found`);
    return plan;
}

describe('FundedNext Flex 50K (live-verified 2026-09-14 from fundednext.com)', () => {
    const plan = planFor(FundedNextVariant.Flex);

    it('matches the live-verified core numbers', () => {
        expect(plan.profitTarget).toBe(2500);
        expect(plan.drawdown.amount).toBe(1500);
        expect(plan.evalConsistencyRule()?.maxBestDayShare).toBe(0.4);
        expect(plan.fundedConsistencyRule()).toBeNull();
        expect(plan.fees.oneTimeEval).toBe(133.99);
        expect(plan.fees.reset).toBe(77.99);
        expect(plan.minTradingDays).toBe(0);
        expect(plan.minDaysAfterPassForPayout).toBe(5);
        expect(plan.payoutRequestCap).toBe(1500);
        expect(plan.maxConsecutiveIdleDays).toBe(30);
    });

    it('has the highest trader profit share of any modeled plan (95%)', () => {
        expect(plan.payoutFromProfit(10_000, 0)).toBeCloseTo(9500, 5);
    });

    it('has no eval or funded daily loss limit', () => {
        const evalState = plan.initialState();
        evalState.balance -= 100_000;
        evalState.todayPnL = -100_000;
        expect(plan.isDayLockedOut(evalState, TradingPhase.Eval)).toBe(false);

        const fundedState = plan.initialState();
        fundedState.balance -= 100_000;
        fundedState.todayPnL = -100_000;
        expect(plan.isDayLockedOut(fundedState, TradingPhase.Funded)).toBe(
            false,
        );
    });

    it('models the funded contract limit as 3 minis / 30 micros, matching eval', () => {
        expect(plan.contractLimits?.evalMinis).toBe(3);
        expect(plan.contractLimits?.evalMicros).toBe(30);
        const funded = plan.contractLimits?.fundedMinis;
        if (funded?.kind !== ContractLimitKind.Flat) {
            throw new Error('expected a flat funded contract limit for Flex');
        }
        expect(funded.maxContracts).toBe(3);
    });

    it(
        'requires 5 benchmark days of $200+ profit and caps payouts at 50% of profit (max $1,500), not just a flat request cap ' +
            "(live-verified 2026-09-14 against helpfutures.fundednext.com's Performance Reward eligibility article)",
        () => {
            expect(plan.minQualifyingDayProfit).toBe(200);
            expect(plan.payoutBalanceShareCap).toBe(0.5);
            expect(plan.payoutRequestCap).toBe(1500);
        },
    );
});

describe('FundedNext Legacy/Rapid Pro contract limits (live-verified 2026-09-14)', () => {
    it('Legacy: 3 minis/30 micros eval, 5 minis/50 micros funded', () => {
        const plan = planFor(FundedNextVariant.Legacy);
        expect(plan.contractLimits?.evalMinis).toBe(3);
        expect(plan.contractLimits?.evalMicros).toBe(30);
        const funded = plan.contractLimits?.fundedMinis;
        if (funded?.kind !== ContractLimitKind.Flat) {
            throw new Error('expected a flat funded contract limit for Legacy');
        }
        expect(funded.maxContracts).toBe(5);
    });

    it('Rapid Pro: 4 minis/40 micros, identical eval and funded', () => {
        const plan = planFor(FundedNextVariant.RapidPro);
        expect(plan.contractLimits?.evalMinis).toBe(4);
        expect(plan.contractLimits?.evalMicros).toBe(40);
        const funded = plan.contractLimits?.fundedMinis;
        if (funded?.kind !== ContractLimitKind.Flat) {
            throw new Error(
                'expected a flat funded contract limit for Rapid Pro',
            );
        }
        expect(funded.maxContracts).toBe(4);
    });

    it('Rapid Daily: flat 4 minis/40 micros in both phases, the funded cap as published on fundednext.com/futures (re-fetched 2026-09-26) (N-82)', () => {
        const plan = planFor(FundedNextVariant.RapidDaily);
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
    });

    it('Rapid Daily sizes a funded account at no more than 4 minis or 40 micros (N-82)', () => {
        const plan = planFor(FundedNextVariant.RapidDaily);
        const state = plan.initialState();
        for (const [symbol, cap] of [
            [InstrumentSymbol.NQ, 4],
            [InstrumentSymbol.MNQ, 40],
        ] as const) {
            expect(
                contractLimitAt(
                    plan.contractLimits,
                    TradingPhase.Funded,
                    INSTRUMENTS[symbol].isMicro,
                    tierContextFromProfits(state.balance - plan.accountSize),
                ),
            ).toBe(cap);
        }
    });

    it('rewrites the Rapid Daily contract-limit note to the published funded cap, with its source and fetch date (N-82)', () => {
        const note = firm.notes.find((entry) =>
            entry.includes("Rapid Daily's contract limits"),
        );
        expect(note).toBeDefined();
        for (const fact of [
            'fundednext.com/futures',
            '2026-09-26',
            '4 Mini or 40 Micro',
            'FundedNext Account',
        ]) {
            expect(note).toContain(fact);
        }
        expect(note).not.toContain('left null');
        expect(note).not.toContain(String.fromCodePoint(0x20_14));
        expect(
            firm.notes.some((entry) => entry.includes('no funded cap')),
        ).toBe(false);
    });
});

describe('FundedNext Live note discloses the lock-keyed contract cap and the withdrawal floor (N-81)', () => {
    const liveNote = firm.notes.find((note) =>
        note.includes('FundedNext Live contract cap and withdrawal floor'),
    );

    it('states the 3/30 then 6/60 cap keyed on the MLL lock, with its source and fetch date', () => {
        expect(liveNote).toBeDefined();
        for (const fact of [
            '16522296',
            '2026-09-26',
            '3 minis / 30 micros',
            '6 minis / 60 micros',
            'MLL locks',
        ]) {
            expect(liveNote).toContain(fact);
        }
    });

    it('states the $2,000 withdrawal floor and the $1,000 trading floor (U25)', () => {
        for (const fact of [
            'automatically liquidated',
            'section 5',
            'section 6',
            '$2,000',
            '$1,000',
        ]) {
            expect(liveNote).toContain(fact);
        }
        expect(liveNote).not.toContain(String.fromCodePoint(0x20_14));
    });

    it('cites the 2026-09-27 revision, whose Section 5 floor is $1,000, and records the remaining Section 5 row against the $4,000 trigger (N-93)', () => {
        for (const fact of [
            '2026-09-27',
            'section 5 now shows a $1,000 floor',
            'MLL trails up with balance and locks',
            '$3,000',
            '$4,000',
        ]) {
            expect(liveNote).toContain(fact);
        }
        for (const stale of [
            'last updated 2026-09-03',
            'contradicts itself',
            'which section is current',
            "section 5's worked example locks the MLL at the $2,000 starting balance",
        ]) {
            expect(liveNote).not.toContain(stale);
        }
    });
});

describe("FundedNext notes cite today's articles instead of inferring (N-93)", () => {
    it('the Flex note cites 17230292, 17229829 and 17229848 for the +$100 lock and the first-payout reset, not an inference', () => {
        const note = noteStarting(
            'Flex is a fourth FundedNext Futures product',
        );
        for (const fact of [
            '17230292',
            '17229829',
            '17229848',
            '$50,100',
            'first withdrawal resets the MLL',
            '2026-10-02',
        ]) {
            expect(note).toContain(fact);
        }
        for (const stale of [
            'an inference, not a confirmed figure',
            'did not state the funded drawdown',
            'by analogy',
            'not independently re-confirmed for Flex',
        ]) {
            expect(note).not.toContain(stale);
        }
    });

    it('the Legacy note states the $500 cycle-profit gate on every withdrawal and cites 17229581', () => {
        const note = noteStarting(
            'helpfutures.fundednext.com/en/articles/14269280',
        );
        expect(note).toContain('17229581');
        expect(note).not.toContain('applies only after the first withdrawal');
    });

    it('the Rapid Daily note cites 17229779 and records 15878210 as superseded', () => {
        const note = noteStarting("Rapid Daily's minPayoutProfit");
        for (const fact of [
            '17229779',
            '15878210',
            'superseded',
            '2026-10-02',
        ]) {
            expect(note).toContain(fact);
        }
        expect(note).not.toContain('buffer delta + $500 = $2,600');
    });

    it('the FNL:003 note quotes the Labs card for the $1,000 daily loss limit and the 5-day wait', () => {
        const note = noteStarting('FNL:003 50K Instant Account (Labs');
        for (const fact of [
            'Daily Loss Limit $1,000',
            'Get Rewards In 5 Days',
            'The timeframe within which you can expect your rewards',
            'delivery time',
            '16847874',
            '16847913',
            "the tool's assumption",
            '2026-10-02',
        ]) {
            expect(note).toContain(fact);
        }
        for (const stale of [
            'genuinely unconfirmed for FNL:003',
            'minDaysAfterPassForPayout is left at 0',
        ]) {
            expect(note).not.toContain(stale);
        }
    });
});

describe('FundedNext FNL:003 50K Instant Account (Labs, no Challenge phase, 20% Perpetual Consistency Rule)', () => {
    const plan = planFor(FundedNextVariant.Fnl003);

    it('skips the Challenge phase entirely and starts the trader directly in the funded stage', () => {
        expect(plan.isInstantFunded).toBe(true);
    });

    it('is a single $50,000 tier with a $149.99 one-time account price and no reset fee', () => {
        expect(plan.accountSize).toBe(50_000);
        expect(plan.fees.oneTimeEval).toBe(149.99);
        expect(plan.fees.reset).toBe(0);
    });

    it('is marked discontinued: fundednext.com/labs shows FNL:003 50K Instant as Expired with no buy button (PT-71, 2026-09-26)', () => {
        expect(plan.availability).toBe(PlanAvailability.Discontinued);
        expect(plan.isPurchasable).toBe(false);
    });

    it('has a flat 3 mini / 30 micro contract limit', () => {
        expect(plan.contractLimits?.evalMinis).toBe(3);
        expect(plan.contractLimits?.evalMicros).toBe(30);
        const funded = plan.contractLimits?.fundedMinis;
        if (funded?.kind !== ContractLimitKind.Flat) {
            throw new Error(
                'expected a flat funded contract limit for FNL:003',
            );
        }
        expect(funded.maxContracts).toBe(3);
    });

    it('locks its $2,000 EOD-trailing drawdown at Initial Balance + $100 ($50,100), the same offset as Flex/Rapid Pro/Rapid Daily', () => {
        const state = plan.initialState();
        expect(state.threshold).toBe(48_000);

        state.balance = 52_100;
        plan.fundedDrawdown.onDayClose(state);

        expect(state.thresholdLocked).toBe(true);
        expect(state.threshold).toBe(50_100);
    });

    it('requires clearing the $2,100-profit buffer ($52,100 balance) before any payout, matching the source\'s own "$2,100 buffer" figure', () => {
        expect(
            plan.payoutBuffer?.requiredBalance(
                plan.accountSize,
                plan.fundedDrawdown.amount,
            ),
        ).toBe(52_100);
    });

    it('requires $2,900 first-cycle profit ($2,100 buffer + the confirmed $800-above-buffer gate) and $800 for every cycle after', () => {
        expect(plan.minPayoutProfit).toBe(2900);
        expect(plan.minPayoutProfitPerCycle).toBe(800);
    });

    it('caps withdrawals between $800 and $1,200, 90% Reward Share, 5 lifetime payouts', () => {
        expect(plan.minPayoutRequest).toBe(800);
        expect(plan.payoutRequestCap).toBe(1200);
        expect(plan.payoutTiers[0]?.traderShare).toBe(0.9);
        expect(plan.maxLifetimePayouts).toBe(5);
    });

    it("caps concurrent accounts at its own 3-account limit, distinct from the other four plans' shared 5-account allocation", () => {
        expect(plan.maxFundedAccounts).toBe(3);
        const legacy = planFor(FundedNextVariant.Legacy);
        expect(legacy.maxFundedAccounts).toBe(5);
    });

    it('applies the Labs card\'s "Daily Loss Limit $1,000" to the funded stage (fundednext.com/labs, re-fetched 2026-10-02)', () => {
        expect(plan.dailyLossLimitFor(TradingPhase.Funded)).toStrictEqual({
            amount: 1000,
            kind: DailyLossLimitKind.Flat,
        });

        const state = plan.initialState();
        state.todayPnL = -999.99;
        expect(plan.isDayLockedOut(state, TradingPhase.Funded)).toBe(false);
        state.todayPnL = -1000;
        expect(plan.isDayLockedOut(state, TradingPhase.Funded)).toBe(true);
    });

    describe('the Labs card\'s "Get Rewards In 5 Days"', () => {
        it('waits 5 days before the first reward', () => {
            expect(plan.minDaysAfterPassForPayout).toBe(5);
        });

        it('blocks the first reward on day gate at 4 days and releases it at 5', () => {
            const blocked = firstRewardAfterDays(plan, 4);
            expect(blocked.kind).toBe(PayoutEvaluationKind.Blocked);
            if (blocked.kind === PayoutEvaluationKind.Blocked) {
                expect(blocked.gate).toBe(PayoutGate.DayGateNotMet);
            }
            expect(firstRewardAfterDays(plan, 5).kind).toBe(
                PayoutEvaluationKind.Eligible,
            );
        });

        it('does not repeat the wait on later cycles, since the card gives no per-cycle figure', () => {
            expect(plan.minDaysAfterPassForPayoutPerCycle).toBe(0);
        });
    });

    it('applies a 20% Perpetual Consistency Rule to the funded stage', () => {
        const rule = plan.fundedConsistencyRule();
        expect(rule).not.toBeNull();
        expect(rule?.maxBestDayShare).toBe(0.2);
        expect(rule?.isPerpetual()).toBe(true);
        expect(plan.evalConsistencyRule()).toBeNull();
    });
});

describe('FundedNext Legacy payout profit gates (article 14269280, live-fetched 2026-09-23)', () => {
    const plan = planFor(FundedNextVariant.Legacy);

    function postMilestoneState(cycleProfit: number) {
        const state = plan.initialState();
        state.balance = plan.accountSize + 400;
        state.qualifyingDays = 31;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = state.balance - cycleProfit;
        return { state, tracker };
    }

    function requestPayout(cycleProfit: number, payoutsIssued: number) {
        const { state, tracker } = postMilestoneState(cycleProfit);
        tracker.payoutsIssued = payoutsIssued;
        tracker.qualifyingDaysAtLastPayout = payoutsIssued === 0 ? 0 : 26;
        tracker.recordSessionClose(state);
        return tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: 300,
            plan,
            state,
        });
    }

    it('gates every withdrawal, the first included, on $500 of current-cycle profit (article 17229581, "Minimum Profit (current cycle) $500", re-fetched 2026-10-02)', () => {
        expect(plan.minPayoutProfit).toBe(500);
        expect(plan.minPayoutProfitPerCycle).toBe(500);
        expect(plan.minDaysAfterPassForPayout).toBe(5);
        expect(plan.minQualifyingDayProfit).toBe(200);
        expect(plan.minPayoutRequest).toBe(250);
    });

    it('denies a first withdrawal from $400 of cycle profit even with the 5 Benchmark Days met (article 17229581)', () => {
        const { state } = postMilestoneState(400);
        expect(state.threshold).toBe(48_000);
        expect(state.thresholdLocked).toBe(false);

        expect(requestPayout(400, 0)).toBeNull();
    });

    it('denies a first withdrawal from $499.99 of cycle profit and pays it from $500 (article 17229581)', () => {
        expect(requestPayout(499.99, 0)).toBeNull();

        const result = requestPayout(500, 0);

        expect(result).not.toBeNull();
        expect(result?.debited).toBe(300);
        expect(result?.traderReceives).toBeCloseTo(240, 5);
        expect(result?.causesHardBreach).toBe(false);
    });

    it('pays a pre-milestone first withdrawal of 50% of $500 once the 5 Benchmark Days are met, and denies it at $400', () => {
        expect(legacyFirstPayoutAfterBenchmarkDays(plan, 400)).toBeNull();
        expect(legacyFirstPayoutAfterBenchmarkDays(plan, 500)?.debited).toBe(
            250,
        );
    });

    it('still denies a second withdrawal with only $400 of cycle profit', () => {
        expect(requestPayout(400, 1)).toBeNull();
    });

    it('pays a second withdrawal once cycle profit reaches $500', () => {
        const result = requestPayout(500, 1);

        expect(result).not.toBeNull();
        expect(result?.debited).toBe(300);
        expect(result?.causesHardBreach).toBe(false);
    });
});

describe('FundedNext Rapid Daily payout gates (article 17229779, current revision, re-fetched 2026-10-02)', () => {
    const plan = planFor(FundedNextVariant.RapidDaily);
    const bufferLevel = 52_100;

    function firstPayoutAt(balance: number) {
        const state = plan.initialState();
        state.balance = balance;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = plan.accountSize;
        tracker.recordSessionClose(state);
        const result = tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
        });
        return { result, state };
    }

    function laterPayoutAt(balance: number, lastPayoutBalance: number) {
        const state = plan.initialState();
        state.balance = balance;
        state.thresholdLocked = true;
        state.threshold = 50_100;
        const tracker = newFundedCycleTracker(state);
        tracker.lastPayoutBalance = lastPayoutBalance;
        tracker.payoutsIssued = 1;
        tracker.recordSessionClose(state);
        return tracker.tryPayout({
            minRetainedCushion: 0,
            payoutRequestSize: undefined,
            plan,
            state,
        });
    }

    it('states both gates separately: $500 of current-cycle profit and a $52,100 EOD buffer, not $500 above the buffer', () => {
        expect(plan.minPayoutProfit).toBe(500);
        expect(plan.minPayoutProfitPerCycle).toBe(500);
        expect(
            plan.payoutBuffer?.requiredBalance(
                plan.accountSize,
                plan.fundedDrawdown.amount,
            ),
        ).toBe(bufferLevel);
    });

    it('denies a payout just under the buffer', () => {
        expect(firstPayoutAt(bufferLevel - 0.01).result).toBeNull();
        expect(firstPayoutAt(52_050).result).toBeNull();
    });

    it('denies a payout at exactly the buffer, where no profit sits above it to withdraw', () => {
        expect(firstPayoutAt(bufferLevel).result).toBeNull();
    });

    it('pays the $250 minimum on a first payout once the balance is $250 above the buffer, without the old $2,600 of cycle profit', () => {
        const { result, state } = firstPayoutAt(bufferLevel + 250);

        expect(result?.debited).toBe(250);
        expect(result?.traderReceives).toBeCloseTo(225, 5);
        expect(state.balance).toBe(bufferLevel);
    });

    it('denies a first payout when under $250 sits above the buffer', () => {
        expect(firstPayoutAt(bufferLevel + 249.99).result).toBeNull();
    });

    it('never lets a payout take the balance below the buffer', () => {
        for (const balance of [52_350, 52_600, 53_000, 54_500, 60_000]) {
            const { result, state } = firstPayoutAt(balance);
            expect(result).not.toBeNull();
            expect(state.balance).toBeGreaterThanOrEqual(bufferLevel);
        }
    });

    it('caps a payout at $1,200 and leaves the balance at or above the buffer', () => {
        const { result, state } = firstPayoutAt(60_000);

        expect(result?.debited).toBe(1200);
        expect(state.balance).toBeGreaterThanOrEqual(bufferLevel);
    });

    it('gates a later payout on $500 of current-cycle profit as well as the buffer', () => {
        expect(laterPayoutAt(52_599, bufferLevel)).toBeNull();
        expect(laterPayoutAt(52_600, bufferLevel)?.debited).toBe(500);
    });
});

describe('FundedNext 50K fees are the no-code checkout price (api.fundednext.com checkout API, coupon null, live-called 2026-09-23)', () => {
    const rapidPro = planFor(FundedNextVariant.RapidPro);
    const rapidDaily = planFor(FundedNextVariant.RapidDaily);
    const dllAddOn = planFor(FundedNextVariant.RapidProDllAddOn);
    const flex = planFor(FundedNextVariant.Flex);

    it('prices the Rapid Pro 50K eval at the $299.98 no-code checkout price and keeps its reset at $174.99', () => {
        expect(rapidPro.fees.oneTimeEval).toBe(299.98);
        expect(rapidPro.fees.reset).toBe(174.99);
    });

    it('prices the Rapid Daily 50K eval at the $299.98 no-code checkout price and keeps its reset at $189.99', () => {
        expect(rapidDaily.fees.oneTimeEval).toBe(299.98);
        expect(rapidDaily.fees.reset).toBe(189.99);
    });

    it('prices the Rapid Pro Daily Loss Limit Add-On 50K at $259.98 ($299.98 base minus the $40 add-on) with a $134.99 reset', () => {
        expect(dllAddOn.fees.oneTimeEval).toBe(259.98);
        expect(dllAddOn.fees.reset).toBe(134.99);
        expect(dllAddOn.fees.oneTimeEval).toBeCloseTo(
            rapidPro.fees.oneTimeEval - 40,
            5,
        );
    });

    it('prices the Flex 50K eval at the $133.99 no-code checkout price and keeps its reset at $77.99', () => {
        expect(flex.fees.oneTimeEval).toBe(133.99);
        expect(flex.fees.reset).toBe(77.99);
    });

    it('prices every coupon-affected 50K eval above every RAPID or FNFLEX code price recorded for that plan', () => {
        const flexNoCodePrice = 133.99;
        const codePricesByPlan = [
            { codePrices: [159.99, 174.99], plan: rapidPro },
            { codePrices: [169.99, 189.99], plan: rapidDaily },
            { codePrices: [119.99, 134.99], plan: dllAddOn },
            {
                codePrices: [
                    flexNoCodePrice * (1 - 0.47),
                    flexNoCodePrice * (1 - 0.4),
                ],
                plan: flex,
            },
        ];
        for (const { codePrices, plan } of codePricesByPlan) {
            for (const codePrice of codePrices) {
                expect(plan.fees.oneTimeEval).toBeGreaterThan(codePrice);
            }
        }
    });

    it('keeps a reset cheaper than a no-code re-buy for every coupon-affected 50K plan', () => {
        for (const plan of [rapidPro, rapidDaily, dllAddOn, flex]) {
            expect(plan.fees.oneTimeEval).toBeGreaterThan(plan.fees.reset);
        }
    });

    it('leaves Legacy at $199.99 eval and $183.99 reset', () => {
        const legacy = planFor(FundedNextVariant.Legacy);
        expect(legacy.fees.oneTimeEval).toBe(199.99);
        expect(legacy.fees.reset).toBe(183.99);
    });
});

describe('FundedNext fee and coupon notes stay consistent with the no-code checkout prices', () => {
    const notes = firm.notes;
    const feeNote = notes.find((note) =>
        note.includes('FundedNext 50K fees are the no-code checkout price'),
    );
    const couponNote = notes.find((note) =>
        note.includes('RAPID and FNFLEX are typed coupon codes'),
    );
    const resetNote = notes.find((note) =>
        note.includes('The FundedNext reset fee is not the eval fee'),
    );

    it('cites the checkout API, its no-coupon basis and the call date in the fee note', () => {
        expect(feeNote).toBeDefined();
        expect(feeNote).toContain('api.fundednext.com/api/new-checkout');
        expect(feeNote).toContain('"coupon":null');
        expect(feeNote).toContain('2026-09-23');
        expect(feeNote).toContain('Rapid Pro 50K $299.98');
        expect(feeNote).toContain('Rapid Daily 50K $299.98');
        expect(feeNote).toContain('Flex 50K $133.99');
        expect(feeNote).toContain('$259.98');
    });

    it('explains the reset price ambiguity in the fee note', () => {
        expect(feeNote).toContain('14260538');
        expect(feeNote).toContain('repeat-purchase price');
        expect(feeNote).toContain('behind a login');
    });

    it("calls help article 15877643's $149.99 figure stale in the fee note", () => {
        expect(feeNote).toContain('15877643');
        expect(feeNote).toContain('$149.99');
        expect(feeNote).toContain('stale');
    });

    it('describes RAPID and FNFLEX as typed codes modeled with --eval-discount, citing the offer articles', () => {
        expect(couponNote).toBeDefined();
        expect(couponNote).toContain('16295692');
        expect(couponNote).toContain('first purchase $159.99');
        expect(couponNote).toContain('repeat purchase $174.99');
        expect(couponNote).toContain('15834431');
        expect(couponNote).toContain('--eval-discount');
    });

    it('pins the disclosure that one percentage cannot split the first and repeat purchase (N-47)', () => {
        expect(couponNote).toContain(
            'one discount percentage cannot model the first-purchase and repeat-purchase split exactly',
        );
    });

    it("gives the DLL Add-On's own first-purchase percentage, $119.99 against the modeled $259.98 (N-47)", () => {
        expect(couponNote).toContain(
            '--eval-discount 53.85 approximates it on the Rapid Pro with DLL Add-On 50K ($119.99 against the modeled $259.98)',
        );
    });

    it('says --eval-discount also prices every re-buy (T9), so each RAPID-modeled retry is under-priced, with the figures per plan (N-47)', () => {
        expect(couponNote).toContain(
            'Under decision T9 the --eval-discount percentage also prices every re-buy',
        );
        expect(couponNote).toContain(
            'Rapid Pro 50K $161.99 against $174.99 at 46%',
        );
        expect(couponNote).toContain(
            'Rapid Daily 50K $170.99 against $189.99 at 43%',
        );
        expect(couponNote).toContain(
            'Rapid Pro with DLL Add-On 50K $119.98 against $134.99 at 53.85%',
        );
        expect(couponNote).toContain('about $13 to $19 low per retry');
    });

    it.each([
        {
            firstPurchase: 161.99,
            percentOff: 46,
            repeatPurchase: 174.99,
            variant: FundedNextVariant.RapidPro,
        },
        {
            firstPurchase: 170.99,
            percentOff: 43,
            repeatPurchase: 189.99,
            variant: FundedNextVariant.RapidDaily,
        },
        {
            firstPurchase: 119.98,
            percentOff: 53.85,
            repeatPurchase: 134.99,
            variant: FundedNextVariant.RapidProDllAddOn,
        },
    ])(
        'prices a $variant retry at --eval-discount $percentOff like the note says: $firstPurchase, under the $repeatPurchase repeat price (N-47)',
        ({ firstPurchase, percentOff, repeatPurchase, variant }) => {
            const plan = planFor(variant);
            const discounts = {
                activationPercent: percent(0),
                evalPercent: percent(percentOff),
            };
            expect(initialEvalFee(plan.fees, discounts)).toBeCloseTo(
                firstPurchase,
                2,
            );
            expect(retryFee(plan.fees, discounts)).toBeCloseTo(
                firstPurchase,
                2,
            );
            expect(retryFee(plan.fees, discounts)).toBeLessThan(repeatPurchase);
        },
    );

    it('says --eval-discount 46 and 43 slightly over-price the RAPID first purchase, with the exact percentages (N-47)', () => {
        expect(couponNote).toContain(
            "--eval-discount 46 and 43 slightly over-price RAPID's first purchase: $161.99 against $159.99 on Rapid Pro 50K and $170.99 against $169.99 on Rapid Daily 50K (the exact percentages are 46.67 and 43.33)",
        );
    });

    it('extends the T9 retry consequence to FNFLEX: $71.01 per Flex retry at 47%, about $7 under the $77.99 reset from the 3rd purchase (N-47)', () => {
        expect(couponNote).toContain(
            "FNFLEX has the same first-vs-repeat split: article 14878751 prices the Flex 50K with the code at $69.99 for the 'First 2 Purchases' and $79.99 from '3 Purchases Onward'",
        );
        expect(couponNote).toContain(
            'with --eval-discount 47 the first purchase and every Flex retry are priced at $71.01 (the discounted re-buy is cheaper than the $77.99 reset), about $1 above the $69.99 code price of the first 2 purchases (the exact percentage is 47.76), while from the 3rd purchase the cheapest real retry is the $77.99 reset, so each of those retries is about $7 low',
        );
    });

    it.each([
        {
            codePrice: 159.99,
            exactPercentOff: 46.67,
            modeledPrice: 161.99,
            percentOff: 46,
            variant: FundedNextVariant.RapidPro,
        },
        {
            codePrice: 169.99,
            exactPercentOff: 43.33,
            modeledPrice: 170.99,
            percentOff: 43,
            variant: FundedNextVariant.RapidDaily,
        },
        {
            codePrice: 69.99,
            exactPercentOff: 47.76,
            modeledPrice: 71.01,
            percentOff: 47,
            variant: FundedNextVariant.Flex,
        },
    ])(
        'prices the $variant first purchase at --eval-discount $percentOff like the note says: $modeledPrice, above the $codePrice code price, whose exact percentage is $exactPercentOff (N-47)',
        ({ codePrice, exactPercentOff, modeledPrice, percentOff, variant }) => {
            const plan = planFor(variant);
            const discounts = {
                activationPercent: percent(0),
                evalPercent: percent(percentOff),
            };
            expect(initialEvalFee(plan.fees, discounts)).toBeCloseTo(
                modeledPrice,
                2,
            );
            expect(initialEvalFee(plan.fees, discounts)).toBeGreaterThan(
                codePrice,
            );
            expect((1 - codePrice / plan.fees.oneTimeEval) * 100).toBeCloseTo(
                exactPercentOff,
                2,
            );
        },
    );

    it('prices every Flex retry at --eval-discount 47 as the $71.01 re-buy, about $1 high on the 2nd purchase and about $7 low from the 3rd like the note says (N-47)', () => {
        const flex = planFor(FundedNextVariant.Flex);
        const discounts = {
            activationPercent: percent(0),
            evalPercent: percent(47),
        };
        const firstTwoCodePrice = 69.99;
        const fromThirdCodePrice = 79.99;
        const publishedReset = resetFee(flex.fees);
        const modeledRetry = retryFee(flex.fees, discounts);

        expect(retryPath(flex.fees, discounts)).toBe(RetryKind.Rebuy);
        expect(modeledRetry).toBeCloseTo(71.01, 2);
        expect(publishedReset).toBe(77.99);
        expect(
            Math.round(
                modeledRetry - Math.min(firstTwoCodePrice, publishedReset),
            ),
        ).toBe(1);
        expect(
            Math.round(
                Math.min(fromThirdCodePrice, publishedReset) - modeledRetry,
            ),
        ).toBe(7);
    });

    it('drops every claim that a coupon is already inside the modeled price', () => {
        for (const note of notes) {
            expect(note).not.toMatch(/already inside/);
            expect(note).not.toContain('non-transactable');
            expect(note).not.toContain('modeled $149.99');
            expect(note).not.toContain('modeled at $149.99');
            expect(note).not.toContain('$69.99 eval fee');
            expect(note).not.toContain('Modeled as $139.99 eval');
        }
    });

    it('points the fee note at the modeled basket discount instead of calling it unmodeled (N-32 review)', () => {
        expect(feeNote).toContain('basketDiscount');
        for (const note of notes) {
            expect(note).not.toContain(
                'it is not modeled (every purchase is charged the single-account price)',
            );
            expect(note).not.toMatch(
                /(bundle|basket) discount[^.]*\bnot modeled\b/,
            );
        }
    });

    it('keeps dollar figures out of the reset-mechanism note so it cannot contradict the fee note', () => {
        expect(resetNote).toBeDefined();
        expect(resetNote).not.toMatch(/\$\d/);
    });
});

describe('FundedNext automatic basket discount: 15% off the 5th and 30% off the 10th account in one basket of up to 10 (checkout API bundle_list, no code, live-called 2026-09-24) (N-32)', () => {
    const basketVariants = [
        FundedNextVariant.Flex,
        FundedNextVariant.Legacy,
        FundedNextVariant.RapidPro,
        FundedNextVariant.RapidProDllAddOn,
        FundedNextVariant.RapidDaily,
    ];

    it.each(basketVariants)(
        '%s carries the per-position basket discount',
        (variant) => {
            expect(planFor(variant).basketDiscount).toStrictEqual({
                basketSize: 10,
                positions: [
                    { percent: 0.15, position: 5 },
                    { percent: 0.3, position: 10 },
                ],
            });
            expect(planFor(variant).bulkDiscount).toBeNull();
        },
    );

    it('FNL:003 has no basket list in the checkout API, so no basket discount', () => {
        expect(planFor(FundedNextVariant.Fnl003).basketDiscount).toBeNull();
    });

    it('averages the 5th-account 15% over the accounts bought, and nothing below 5', () => {
        const rapidPro = planFor(FundedNextVariant.RapidPro);
        expect(rapidPro.purchaseDiscounts(undefined, 4)).toBeUndefined();
        expect(
            rapidPro.purchaseDiscounts(undefined, 5)?.bundlePercent,
        ).toBeCloseTo(3, 12);
        const fiveAccounts =
            5 *
            initialEvalFee(
                rapidPro.fees,
                rapidPro.purchaseDiscounts(undefined, 5),
            );
        expect(fiveAccounts).toBeCloseTo(4 * 299.98 + 299.98 * 0.85, 9);
    });

    it('keeps a typed coupon alongside the basket discount', () => {
        const coupon = {
            activationPercent: percent(0),
            evalPercent: percent(40),
        };
        const discounts = planFor(FundedNextVariant.Flex).purchaseDiscounts(
            coupon,
            5,
        );
        expect(discounts?.evalPercent).toBe(40);
        expect(discounts?.activationPercent).toBe(0);
        expect(discounts?.bundlePercent).toBeCloseTo(3, 12);
    });

    it('notes the basket discount with its source, the 10-account basket, the rounding and the unconfirmed add-on base', () => {
        const basketNote = firm.notes.find((note) =>
            note.includes('bundle_list'),
        );
        expect(basketNote).toBeDefined();
        for (const fact of [
            '15% OFF',
            '30% OFF',
            'purchase_limit',
            '2026-09-24',
            'FNL:003',
            'maxFundedAccounts',
            'Daily Loss Limit Add-On',
            'unconfirmed',
        ]) {
            expect(basketNote).toContain(fact);
        }
        expect(basketNote).not.toContain(String.fromCodePoint(0x20_14));
    });
});
