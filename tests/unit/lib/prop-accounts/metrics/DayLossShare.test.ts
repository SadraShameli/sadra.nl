import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    PayoutStatus,
    usdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';
import {
    AccountStateKind,
    AccountStateUnavailableKind,
    type DayLossAccount,
    DayLossBasis,
    dayLossShareOf,
    DayLossUnmeasuredReason,
    fundedWithdrawableDollarsOf,
} from '~/lib/prop-accounts/metrics';
import {
    E8FuturesVariant,
    findFirm,
    FirmId,
    type Plan,
    type PlanId,
    TopStepVariant,
    TradeifyVariant,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

import {
    evalReconstructed,
    fundedReconstructed,
    liveReconstructed,
    mffProPlan,
    notReconstructed,
    reconstructedEntry,
} from '../reconstructionFixtures';

const AVAILABLE = usdCents(1_000_000);

function capBoundAccount(id: PlanId, paidFraction: number) {
    const plan = findFirm(id.firm)?.findPlan(id);
    if (!plan) throw new Error('fixture plan missing from the registry');
    const previous = eligibleFundedOf(plan, plan.accountSize + 12_000);
    const withdrawable = fundedWithdrawableDollarsOf(
        DEFAULT_RULEBOOK,
        previous,
    );
    const paid = withdrawable * paidFraction;
    const latest = fundedReconstructed(plan, {
        balance: plan.accountSize,
        cumulativePayout: paid,
        cycleBestDayProfit: 0,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 2,
    });
    return {
        account: {
            accountId: 'capped',
            events: [],
            paidPayouts: [payoutOf(usdCentsFromDollars(paid))],
            state: reconstructedEntry('capped', plan, latest, {
                asOf: '2026-09-23',
                previous,
                previousAsOf: '2026-09-22',
            }).state,
        } satisfies DayLossAccount,
        paid,
        withdrawable,
    };
}

function eligibleFundedOf(plan: Plan, balance: number) {
    const funded = fundedReconstructed(plan, {
        balance,
        cumulativePayout: 0,
        cycleBestDayProfit: balance - plan.accountSize,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    if (funded.fundedTracker === null) throw new Error('expected a tracker');
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    funded.state.qualifyingDays = 999;
    return funded;
}

function evalAccount(
    accountId: string,
    previousBalanceDelta: number,
    latestBalanceDelta: number,
    asOf = '2026-09-23',
    previousAsOf = '2026-09-22',
): DayLossAccount {
    const plan = mffProPlan();
    return {
        accountId,
        events: [],
        paidPayouts: [],
        state: reconstructedEntry(
            accountId,
            plan,
            evalReconstructed(plan, {
                balance: plan.accountSize + latestBalanceDelta,
            }),
            {
                asOf,
                previous: evalReconstructed(plan, {
                    balance: plan.accountSize + previousBalanceDelta,
                }),
                previousAsOf,
            },
        ).state,
    };
}

function fundedAccount(
    accountId: string,
    previousProfit: number,
    latestProfit: number,
    overrides: Partial<DayLossAccount> & {
        readonly asOf?: string;
        readonly previousAsOf?: string;
    } = {},
): DayLossAccount {
    const { asOf, previousAsOf, ...rest } = overrides;
    const plan = mffProPlan();
    return {
        accountId,
        events: [],
        paidPayouts: [],
        state: reconstructedEntry(accountId, plan, fundedAt(latestProfit), {
            asOf: asOf ?? '2026-09-23',
            previous: fundedAt(previousProfit),
            previousAsOf: previousAsOf ?? '2026-09-22',
        }).state,
        ...rest,
    };
}

function fundedAt(extraProfit: number) {
    const plan = mffProPlan();
    const funded = fundedReconstructed(plan, {
        balance: plan.accountSize + extraProfit,
        cumulativePayout: 0,
        cycleBestDayProfit: Math.max(0, extraProfit),
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    if (funded.fundedTracker === null) throw new Error('expected a tracker');
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    return funded;
}

function payoutOf(grossCents: number) {
    return {
        grossCents: usdCents(grossCents),
        paidOn: '2026-09-23',
        status: PayoutStatus.Paid,
    };
}

function withdrawableDropCents(
    previousProfit: number,
    latestProfit: number,
): number {
    return (
        usdCentsFromDollars(
            fundedWithdrawableDollarsOf(
                DEFAULT_RULEBOOK,
                fundedAt(previousProfit),
            ),
        ) -
        usdCentsFromDollars(
            fundedWithdrawableDollarsOf(
                DEFAULT_RULEBOOK,
                fundedAt(latestProfit),
            ),
        )
    );
}

const BASE = { availableBankrollCents: AVAILABLE, rulebook: DEFAULT_RULEBOOK };

describe('dayLossShareOf', () => {
    it('is empty for no accounts', () => {
        expect(dayLossShareOf({ ...BASE, accounts: [] })).toEqual({
            availableBankrollCents: AVAILABLE,
            days: [],
            measuredAccounts: 0,
            unmeasured: [],
            worstDay: null,
        });
    });

    it('prices a funded account as the withdrawable it lost since its previous snapshot', () => {
        const result = dayLossShareOf({
            ...BASE,
            accounts: [fundedAccount('f1', 20_000, 1000)],
        });
        const expected = withdrawableDropCents(20_000, 1000);
        expect(expected).toBeGreaterThan(0);
        expect(result.days).toHaveLength(1);
        const [day] = result.days;
        expect(day?.date).toBe('2026-09-23');
        expect(day?.lossCents).toBe(expected);
        expect(day?.entries).toEqual([
            {
                accountId: 'f1',
                basis: DayLossBasis.FundedWithdrawable,
                lossCents: expected,
            },
        ]);
        expect(day?.share).toBeCloseTo(expected / AVAILABLE, 12);
        expect(result.worstDay).toBe(day);
    });

    it('does not count a payout paid between the snapshots as a loss', () => {
        const plan = mffProPlan();
        const previous = fundedAt(20_000);
        const withdrawable = fundedWithdrawableDollarsOf(
            DEFAULT_RULEBOOK,
            previous,
        );
        expect(withdrawable).toBeGreaterThan(0);
        const afterPayout = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000 - withdrawable,
            cumulativePayout: withdrawable,
            cycleBestDayProfit: 0,
            lastPayoutBalance: plan.accountSize + 20_000 - withdrawable,
            payoutsIssued: 2,
        });
        const result = dayLossShareOf({
            ...BASE,
            accounts: [
                {
                    accountId: 'f1',
                    events: [],
                    paidPayouts: [payoutOf(usdCentsFromDollars(withdrawable))],
                    state: reconstructedEntry('f1', plan, afterPayout, {
                        asOf: '2026-09-23',
                        previous,
                        previousAsOf: '2026-09-22',
                    }).state,
                },
            ],
        });
        expect(result.days).toEqual([]);
        expect(result.worstDay).toBeNull();
    });

    it('does not count the banked payout as a loss when a loss larger than the withdrawable follows it on an uncapped plan', () => {
        const plan = mffProPlan();
        const previous = fundedAt(20_000);
        const withdrawable = fundedWithdrawableDollarsOf(
            DEFAULT_RULEBOOK,
            previous,
        );
        const tradingLoss = 3000;
        expect(withdrawable).toBeGreaterThan(tradingLoss);
        const balance = plan.accountSize + 20_000 - withdrawable - tradingLoss;
        const afterLoss = fundedReconstructed(plan, {
            balance,
            cumulativePayout: withdrawable,
            cycleBestDayProfit: 0,
            lastPayoutBalance: plan.accountSize + 20_000 - withdrawable,
            payoutsIssued: 2,
        });
        expect(fundedWithdrawableDollarsOf(DEFAULT_RULEBOOK, afterLoss)).toBe(
            0,
        );
        const result = dayLossShareOf({
            ...BASE,
            accounts: [
                {
                    accountId: 'f1',
                    events: [],
                    paidPayouts: [payoutOf(usdCentsFromDollars(withdrawable))],
                    state: reconstructedEntry('f1', plan, afterLoss, {
                        asOf: '2026-09-23',
                        previous,
                        previousAsOf: '2026-09-22',
                    }).state,
                },
            ],
        });
        expect(result.days).toEqual([]);
    });

    it('counts only the withdrawable that was left after a partial payout when the rest is then lost on an uncapped plan', () => {
        const plan = mffProPlan();
        const previous = fundedAt(20_000);
        const withdrawable = fundedWithdrawableDollarsOf(
            DEFAULT_RULEBOOK,
            previous,
        );
        const paid = withdrawable / 2;
        const balance = plan.accountSize + 20_000 - paid - withdrawable;
        const afterLoss = fundedReconstructed(plan, {
            balance,
            cumulativePayout: paid,
            cycleBestDayProfit: 0,
            lastPayoutBalance: plan.accountSize + 20_000 - paid,
            payoutsIssued: 2,
        });
        expect(fundedWithdrawableDollarsOf(DEFAULT_RULEBOOK, afterLoss)).toBe(
            0,
        );
        const result = dayLossShareOf({
            ...BASE,
            accounts: [
                {
                    accountId: 'f1',
                    events: [],
                    paidPayouts: [payoutOf(usdCentsFromDollars(paid))],
                    state: reconstructedEntry('f1', plan, afterLoss, {
                        asOf: '2026-09-23',
                        previous,
                        previousAsOf: '2026-09-22',
                    }).state,
                },
            ],
        });
        expect(result.days[0]?.lossCents).toBe(
            usdCentsFromDollars(withdrawable - paid),
        );
    });

    it('does not count a gain as a loss but still counts the account as measured', () => {
        const result = dayLossShareOf({
            ...BASE,
            accounts: [fundedAccount('f1', 1000, 20_000)],
        });
        expect(result.days).toEqual([]);
        expect(result.measuredAccounts).toBe(1);
        expect(result.unmeasured).toEqual([]);
    });

    it('counts measured accounts apart from the unmeasured ones', () => {
        const plan = mffProPlan();
        const result = dayLossShareOf({
            ...BASE,
            accounts: [
                fundedAccount('lose', 20_000, 1000),
                fundedAccount('gain', 1000, 20_000),
                {
                    accountId: 'none',
                    events: [],
                    paidPayouts: [],
                    state: reconstructedEntry('none', plan, fundedAt(1000))
                        .state,
                },
            ],
        });
        expect(result.measuredAccounts).toBe(2);
        expect(result.unmeasured).toHaveLength(1);
    });

    it('prices an eval balance drop through the fee-equivalent heuristic scaled to the retry fee, never the fees already paid', () => {
        const plan = mffProPlan();
        const result = dayLossShareOf({
            ...BASE,
            accounts: [evalAccount('e1', 0, -500)],
        });
        const expected = usdCentsFromDollars(
            Math.min(500 / plan.drawdown.amount, 1) * plan.retryFee(),
        );
        expect(expected).toBeGreaterThan(0);
        expect(result.days[0]?.entries).toEqual([
            {
                accountId: 'e1',
                basis: DayLossBasis.EvalFeeHeuristic,
                lossCents: expected,
            },
        ]);
    });

    it('caps the eval heuristic at the retry fee when the drop exceeds the drawdown', () => {
        const plan = mffProPlan();
        const result = dayLossShareOf({
            ...BASE,
            accounts: [evalAccount('e1', 0, -(plan.drawdown.amount * 3))],
        });
        expect(result.days[0]?.lossCents).toBe(
            usdCentsFromDollars(plan.retryFee()),
        );
    });

    it('uses the from-state value change for an eval when the engine supplied one', () => {
        const result = dayLossShareOf({
            ...BASE,
            accounts: [evalAccount('e1', 0, -500)],
            evalValueLossDollars: new Map([['e1', 42.5]]),
        });
        expect(result.days[0]?.entries).toEqual([
            {
                accountId: 'e1',
                basis: DayLossBasis.EvalFromStateValue,
                lossCents: usdCents(4250),
            },
        ]);
    });

    it('treats a negative from-state value loss as no loss', () => {
        const result = dayLossShareOf({
            ...BASE,
            accounts: [evalAccount('e1', 0, -500)],
            evalValueLossDollars: new Map([['e1', -10]]),
        });
        expect(result.days).toEqual([]);
    });

    it('adds the accounts that share a snapshot date into one day', () => {
        const result = dayLossShareOf({
            ...BASE,
            accounts: [
                fundedAccount('f1', 20_000, 1000),
                fundedAccount('f2', 20_000, 1000),
            ],
        });
        expect(result.days).toHaveLength(1);
        const [day] = result.days;
        expect(day?.entries).toHaveLength(2);
        const [first] = day?.entries ?? [];
        expect(day?.lossCents).toBe((first?.lossCents ?? 0) * 2);
    });

    it('keeps separate dates apart, newest first, and names the worst by share', () => {
        const result = dayLossShareOf({
            ...BASE,
            accounts: [
                fundedAccount('f1', 20_000, 1000, { asOf: '2026-09-23' }),
                fundedAccount('f2', 20_000, 15_000, {
                    asOf: '2026-09-21',
                    previousAsOf: '2026-09-18',
                }),
            ],
        });
        expect(result.days.map((day) => day.date)).toEqual([
            '2026-09-23',
            '2026-09-21',
        ]);
        expect(result.worstDay?.date).toBe('2026-09-23');
    });

    it('has no share when the available bankroll is null or not positive, and ranks the worst day by dollars', () => {
        for (const available of [null, usdCents(0), usdCents(-5000)]) {
            const result = dayLossShareOf({
                accounts: [
                    fundedAccount('f1', 20_000, 1000, { asOf: '2026-09-23' }),
                    fundedAccount('f2', 20_000, 15_000, {
                        asOf: '2026-09-21',
                        previousAsOf: '2026-09-18',
                    }),
                ],
                availableBankrollCents: available,
                rulebook: DEFAULT_RULEBOOK,
            });
            expect(result.days.every((day) => day.share === null)).toBe(true);
            expect(result.worstDay?.date).toBe('2026-09-23');
        }
    });

    it('lists snapshots more than one trading day apart as unmeasured, never as a one-day loss', () => {
        const result = dayLossShareOf({
            ...BASE,
            accounts: [
                fundedAccount('funded', 20_000, 1000, {
                    previousAsOf: '2026-09-02',
                }),
                evalAccount('eval', 0, -500, '2026-09-23', '2026-09-02'),
            ],
        });
        expect(result.days).toEqual([]);
        expect(result.worstDay).toBeNull();
        expect(result.measuredAccounts).toBe(0);
        expect(result.unmeasured).toEqual([
            {
                accountId: 'funded',
                reason: DayLossUnmeasuredReason.SpansSeveralDays,
            },
            {
                accountId: 'eval',
                reason: DayLossUnmeasuredReason.SpansSeveralDays,
            },
        ]);
    });

    it('counts a Friday to Monday pair and a same-day pair as one trading day at most', () => {
        const result = dayLossShareOf({
            ...BASE,
            accounts: [
                fundedAccount('weekend', 20_000, 1000, {
                    asOf: '2026-09-21',
                    previousAsOf: '2026-09-18',
                }),
                fundedAccount('same-day', 20_000, 1000, {
                    asOf: '2026-09-23',
                    previousAsOf: '2026-09-23',
                }),
            ],
        });
        expect(result.unmeasured).toEqual([]);
        expect(result.measuredAccounts).toBe(2);
        expect(result.days.map((day) => day.date)).toEqual([
            '2026-09-23',
            '2026-09-21',
        ]);
    });

    it('refuses a pair two trading days apart', () => {
        const result = dayLossShareOf({
            ...BASE,
            accounts: [
                fundedAccount('two', 20_000, 1000, {
                    asOf: '2026-09-23',
                    previousAsOf: '2026-09-21',
                }),
            ],
        });
        expect(result.days).toEqual([]);
        expect(result.unmeasured[0]?.reason).toBe(
            DayLossUnmeasuredReason.SpansSeveralDays,
        );
    });

    it('lists an account with no previous snapshot as unmeasured, not as zero', () => {
        const plan = mffProPlan();
        const result = dayLossShareOf({
            ...BASE,
            accounts: [
                {
                    accountId: 'f1',
                    events: [],
                    paidPayouts: [],
                    state: reconstructedEntry('f1', plan, fundedAt(1000)).state,
                },
            ],
        });
        expect(result.days).toEqual([]);
        expect(result.unmeasured).toEqual([
            {
                accountId: 'f1',
                reason: DayLossUnmeasuredReason.NoPreviousSnapshot,
            },
        ]);
    });

    it('lists a funded reset between the snapshots, a live account and an unreconstructed account as unmeasured', () => {
        const plan = mffProPlan();
        const result = dayLossShareOf({
            ...BASE,
            accounts: [
                fundedAccount('reset', 20_000, 1000, {
                    events: [
                        {
                            kind: AccountEventKind.FundedReset,
                            occurredOn: '2026-09-23',
                        },
                    ],
                }),
                {
                    accountId: 'live',
                    events: [],
                    paidPayouts: [],
                    state: reconstructedEntry(
                        'live',
                        plan,
                        liveReconstructed(plan),
                        { previous: liveReconstructed(plan) },
                    ).state,
                },
                {
                    accountId: 'none',
                    events: [],
                    paidPayouts: [],
                    state: notReconstructed({
                        kind: AccountStateUnavailableKind.NoSnapshot,
                    }),
                },
            ],
        });
        expect(result.days).toEqual([]);
        expect(
            result.unmeasured.map((entry) => [entry.accountId, entry.reason]),
        ).toEqual([
            ['reset', DayLossUnmeasuredReason.FundedReset],
            ['live', DayLossUnmeasuredReason.LiveNotModeled],
            ['none', DayLossUnmeasuredReason.NoReconstruction],
        ]);
    });

    it('lists an account that changed stage between the snapshots as unmeasured', () => {
        const plan = mffProPlan();
        const result = dayLossShareOf({
            ...BASE,
            accounts: [
                {
                    accountId: 'moved',
                    events: [],
                    paidPayouts: [],
                    state: reconstructedEntry('moved', plan, fundedAt(1000), {
                        previous: evalReconstructed(plan),
                    }).state,
                },
            ],
        });
        expect(result.unmeasured).toEqual([
            {
                accountId: 'moved',
                reason: DayLossUnmeasuredReason.StageChange,
            },
        ]);
    });

    it('never attributes a loss to a day with no loss: a gaining account leaves its date out', () => {
        const result = dayLossShareOf({
            ...BASE,
            accounts: [
                evalAccount('gain', -500, 500),
                fundedAccount('lose', 20_000, 1000, { asOf: '2026-09-20' }),
            ],
        });
        expect(result.days.map((day) => day.date)).toEqual(['2026-09-20']);
    });

    describe.each([
        {
            id: {
                accountSize: 50_000,
                firm: FirmId.TopStep,
                variant: TopStepVariant.StandardStandard,
            } satisfies PlanId,
            name: 'TopStep standard',
        },
        {
            id: {
                accountSize: 50_000,
                firm: FirmId.E8Futures,
                variant: E8FuturesVariant.ZeroMax80,
            } satisfies PlanId,
            name: 'E8 zero max 80',
        },
        {
            id: {
                accountSize: 50_000,
                firm: FirmId.Tradeify,
                variant: TradeifyVariant.SelectDaily,
            } satisfies PlanId,
            name: 'Tradeify select daily',
        },
    ])('a payout on the cap-bound $name plan', ({ id }) => {
        it('counts the withdrawable lost after the payout as a loss, not the drop net of the payout', () => {
            const { account, paid, withdrawable } = capBoundAccount(id, 1);
            expect(withdrawable).toBeGreaterThan(0);
            const result = dayLossShareOf({ ...BASE, accounts: [account] });
            const lostTradingProfit = 12_000 - paid;
            expect(result.days).toHaveLength(1);
            expect(result.days[0]?.lossCents).toBe(
                usdCentsFromDollars(Math.min(withdrawable, lostTradingProfit)),
            );
        });

        it('counts nothing when the payout is the only change', () => {
            const { account } = capBoundAccount(id, 1);
            const { state } = account;
            if (state.kind !== AccountStateKind.Reconstructed)
                throw new Error('expected a reconstructed state');
            const plan = state.plan;
            const kept = eligibleFundedOf(plan, plan.accountSize + 12_000);
            const withdrawable = fundedWithdrawableDollarsOf(
                DEFAULT_RULEBOOK,
                kept,
            );
            const afterPayout = fundedReconstructed(plan, {
                balance: plan.accountSize + 12_000 - withdrawable,
                cumulativePayout: withdrawable,
                cycleBestDayProfit: 0,
                lastPayoutBalance: plan.accountSize + 12_000 - withdrawable,
                payoutsIssued: 2,
            });
            const result = dayLossShareOf({
                ...BASE,
                accounts: [
                    {
                        accountId: 'capped',
                        events: [],
                        paidPayouts: [
                            payoutOf(usdCentsFromDollars(withdrawable)),
                        ],
                        state: reconstructedEntry('capped', plan, afterPayout, {
                            asOf: '2026-09-23',
                            previous: kept,
                            previousAsOf: '2026-09-22',
                        }).state,
                    },
                ],
            });
            expect(result.days).toEqual([]);
        });
    });
});
