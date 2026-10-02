import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    PayoutReadyWithdrawableDropRule,
} from '~/lib/prop-accounts/alerts';
import {
    AccountEventKind,
    AccountStage,
    formatUsdCents,
    PayoutStatus,
    usdCents,
} from '~/lib/prop-accounts/core';
import { fundedWithdrawableDollarsOf } from '~/lib/prop-accounts/metrics';
import {
    E8FuturesVariant,
    findFirm,
    FirmId,
    type Plan,
    type PlanId,
    TopStepVariant,
    TradeifyVariant,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';

import {
    fundedReconstructed,
    mffProPlan,
    reconstructedEntry,
} from '../reconstructionFixtures';
import { accountFor, alertsOf, paidPayout } from './alertFixtures';

const rule = new PayoutReadyWithdrawableDropRule();

function capBoundFixtures(id: PlanId, isTradingLoss: boolean) {
    const plan = planOf(id);
    const account = accountFor(
        { firmId: plan.id.firm, plan },
        { stage: AccountStage.Funded },
    );
    const previous = eligiblePreviousFunded(plan, plan.accountSize + 12_000);
    const rulebook = rulebookWithLossFraction(0.2);
    const withdrawable = fundedWithdrawableDollarsOf(rulebook, previous);
    const latestBalance = isTradingLoss
        ? plan.accountSize
        : plan.accountSize + 12_000 - withdrawable;
    const latest = fundedReconstructed(plan, {
        balance: latestBalance,
        cumulativePayout: withdrawable,
        cycleBestDayProfit: 0,
        lastPayoutBalance: plan.accountSize + 12_000 - withdrawable,
        payoutsIssued: 2,
    });
    const paidCents = Math.round(withdrawable * 100);
    return {
        account,
        latest,
        payouts: [
            paidPayout(account, {
                grossCents: usdCents(paidCents),
                netCents: usdCents(paidCents),
                paidOn: '2026-09-10',
            }),
        ],
        plan,
        previous,
        rulebook,
    };
}

function eligiblePreviousFunded(
    plan: ReturnType<typeof mffProPlan>,
    balance: number,
) {
    const funded = fundedReconstructed(plan, {
        balance,
        cumulativePayout: 0,
        cycleBestDayProfit: balance - plan.accountSize,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    if (funded.fundedTracker === null)
        throw new Error('expected a funded tracker');
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    funded.state.qualifyingDays = 999;
    return funded;
}

function paidBetweenFixtures() {
    const plan = mffProPlan();
    const account = accountFor(
        { firmId: plan.id.firm, plan },
        { stage: AccountStage.Funded },
    );
    const previous = eligiblePreviousFunded(plan, plan.accountSize + 20_000);
    const latest = fundedReconstructed(plan, {
        balance: plan.accountSize + 1000,
        cumulativePayout: 0,
        cycleBestDayProfit: 1000,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    const rulebook = rulebookWithLossFraction(0.2);
    const droppedCents = Math.round(
        (fundedWithdrawableDollarsOf(rulebook, previous) -
            fundedWithdrawableDollarsOf(rulebook, latest)) *
            100,
    );
    return { account, droppedCents, latest, plan, previous, rulebook };
}

function planOf(id: PlanId): Plan {
    const plan = findFirm(id.firm)?.findPlan(id);
    if (!plan) throw new Error('fixture plan missing from the registry');
    return plan;
}

function resetFixtures() {
    const plan = mffProPlan();
    const account = accountFor(
        { firmId: plan.id.firm, plan },
        { stage: AccountStage.Funded },
    );
    const previous = eligiblePreviousFunded(plan, plan.accountSize + 20_000);
    const latest = fundedReconstructed(plan, {
        balance: plan.accountSize + 1000,
        cumulativePayout: 0,
        cycleBestDayProfit: 1000,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    return { account, latest, plan, previous };
}

function rulebookWithLossFraction(fraction: null | number): RulebookParameters {
    return {
        ...DEFAULT_RULEBOOK,
        alerts: {
            ...DEFAULT_RULEBOOK.alerts,
            payoutReadyLossFraction: fraction,
        },
    };
}

describe('PayoutReadyWithdrawableDropRule', () => {
    it('is off entirely when payoutReadyLossFraction is null', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const previous = eligiblePreviousFunded(
            plan,
            plan.accountSize + 20_000,
        );
        const latest = fundedReconstructed(plan, {
            balance: plan.accountSize + 1000,
            cumulativePayout: 0,
            cycleBestDayProfit: 1000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [
                reconstructedEntry(account.id, plan, latest, { previous }),
            ],
            rulebook: rulebookWithLossFraction(null),
        });
        expect(alerts).toEqual([]);
    });

    it('fires Critical when the previous snapshot was payout-eligible and the withdrawable fell too far', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const previous = eligiblePreviousFunded(
            plan,
            plan.accountSize + 20_000,
        );
        const latest = fundedReconstructed(plan, {
            balance: plan.accountSize + 1000,
            cumulativePayout: 0,
            cycleBestDayProfit: 1000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [
                reconstructedEntry(account.id, plan, latest, { previous }),
            ],
            rulebook: rulebookWithLossFraction(0.2),
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.PayoutReadyWithdrawableDrop);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
    });

    it('is silent when the previous snapshot was not payout-eligible', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const previous = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
        });
        const latest = fundedReconstructed(plan, {
            balance: plan.accountSize + 1000,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [
                reconstructedEntry(account.id, plan, latest, { previous }),
            ],
            rulebook: rulebookWithLossFraction(0.2),
        });
        expect(alerts).toEqual([]);
    });

    it('is silent when the drop is within the loss fraction', () => {
        const plan = mffProPlan();
        const account = accountFor(
            { firmId: plan.id.firm, plan },
            { stage: AccountStage.Funded },
        );
        const previous = eligiblePreviousFunded(
            plan,
            plan.accountSize + 20_000,
        );
        const latest = fundedReconstructed(plan, {
            balance: plan.accountSize + 19_500,
            cumulativePayout: 0,
            cycleBestDayProfit: 19_500,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        const alerts = alertsOf(rule, {
            accounts: [account],
            accountStates: [
                reconstructedEntry(account.id, plan, latest, { previous }),
            ],
            rulebook: rulebookWithLossFraction(0.2),
        });
        expect(alerts).toEqual([]);
    });

    describe('a payout paid between the two snapshots', () => {
        it('gives no alert when the whole drop is a payout paid in between', () => {
            const { account, droppedCents, latest, plan, previous, rulebook } =
                paidBetweenFixtures();
            expect(droppedCents).toBeGreaterThan(0);
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [
                    reconstructedEntry(account.id, plan, latest, { previous }),
                ],
                payouts: [
                    paidPayout(account, {
                        grossCents: usdCents(droppedCents),
                        netCents: usdCents(droppedCents),
                        paidOn: '2026-09-10',
                    }),
                ],
                rulebook,
            });
            expect(alerts).toEqual([]);
        });

        it('still fires when the loss left after netting the payout is over the fraction', () => {
            const { account, droppedCents, latest, plan, previous, rulebook } =
                paidBetweenFixtures();
            const paidCents = Math.round(droppedCents / 4);
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [
                    reconstructedEntry(account.id, plan, latest, { previous }),
                ],
                payouts: [
                    paidPayout(account, {
                        grossCents: usdCents(paidCents),
                        netCents: usdCents(paidCents),
                        paidOn: '2026-09-10',
                    }),
                ],
                rulebook,
            });
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.kind).toBe(AlertKind.PayoutReadyWithdrawableDrop);
            expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
        });

        it('is silent when a loss larger than the withdrawable follows a payout of the whole withdrawable on an uncapped plan', () => {
            const plan = mffProPlan();
            const account = accountFor(
                { firmId: plan.id.firm, plan },
                { stage: AccountStage.Funded },
            );
            const previous = eligiblePreviousFunded(
                plan,
                plan.accountSize + 20_000,
            );
            const rulebook = rulebookWithLossFraction(0.2);
            const withdrawable = fundedWithdrawableDollarsOf(
                rulebook,
                previous,
            );
            const tradingLoss = 5000;
            expect(withdrawable).toBeGreaterThan(tradingLoss);
            const latest = fundedReconstructed(plan, {
                balance: plan.accountSize + 20_000 - withdrawable - tradingLoss,
                cumulativePayout: withdrawable,
                cycleBestDayProfit: 0,
                lastPayoutBalance: plan.accountSize + 20_000 - withdrawable,
                payoutsIssued: 2,
            });
            expect(fundedWithdrawableDollarsOf(rulebook, latest)).toBe(0);
            const paidCents = Math.round(withdrawable * 100);
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [
                    reconstructedEntry(account.id, plan, latest, { previous }),
                ],
                payouts: [
                    paidPayout(account, {
                        grossCents: usdCents(paidCents),
                        netCents: usdCents(paidCents),
                        paidOn: '2026-09-10',
                    }),
                ],
                rulebook,
            });
            expect(alerts).toEqual([]);
        });

        it('does not net a payout paid before the previous snapshot', () => {
            const { account, droppedCents, latest, plan, previous, rulebook } =
                paidBetweenFixtures();
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [
                    reconstructedEntry(account.id, plan, latest, { previous }),
                ],
                payouts: [
                    paidPayout(account, {
                        grossCents: usdCents(droppedCents),
                        netCents: usdCents(droppedCents),
                        paidOn: '2026-08-20',
                    }),
                ],
                rulebook,
            });
            expect(alerts).toHaveLength(1);
        });

        it('does not net a payout that was only requested', () => {
            const { account, droppedCents, latest, plan, previous, rulebook } =
                paidBetweenFixtures();
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [
                    reconstructedEntry(account.id, plan, latest, { previous }),
                ],
                payouts: [
                    paidPayout(account, {
                        grossCents: usdCents(droppedCents),
                        netCents: usdCents(droppedCents),
                        paidOn: null,
                        status: PayoutStatus.Requested,
                    }),
                ],
                rulebook,
            });
            expect(alerts).toHaveLength(1);
        });
    });

    describe('a funded reset between the two snapshots', () => {
        it('fires Critical and names the reset, because the unpaid withdrawable was lost', () => {
            const { account, latest, plan, previous } = resetFixtures();
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [
                    reconstructedEntry(account.id, plan, latest, { previous }),
                ],
                events: [
                    {
                        accountId: account.id,
                        kind: AccountEventKind.FundedReset,
                        occurredOn: '2026-09-10',
                    },
                ],
                rulebook: rulebookWithLossFraction(0.2),
            });
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.kind).toBe(AlertKind.PayoutReadyWithdrawableDrop);
            expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
            expect(alerts[0]?.message).toContain('was reset');
        });

        it('is silent when the whole withdrawable was paid out before the reset', () => {
            const { account, latest, plan, previous } = resetFixtures();
            const rulebook = rulebookWithLossFraction(0.2);
            const withdrawableCents = Math.round(
                fundedWithdrawableDollarsOf(rulebook, previous) * 100,
            );
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [
                    reconstructedEntry(account.id, plan, latest, { previous }),
                ],
                events: [
                    {
                        accountId: account.id,
                        kind: AccountEventKind.FundedReset,
                        occurredOn: '2026-09-12',
                    },
                ],
                payouts: [
                    paidPayout(account, {
                        grossCents: usdCents(withdrawableCents),
                        netCents: usdCents(withdrawableCents),
                        paidOn: '2026-09-10',
                    }),
                ],
                rulebook,
            });
            expect(alerts).toEqual([]);
        });

        it('fires when the whole withdrawable was paid only after the reset, because that payout belongs to the new cycle', () => {
            const { account, latest, plan, previous } = resetFixtures();
            const rulebook = rulebookWithLossFraction(0.2);
            const withdrawableCents = Math.round(
                fundedWithdrawableDollarsOf(rulebook, previous) * 100,
            );
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [
                    reconstructedEntry(account.id, plan, latest, { previous }),
                ],
                events: [
                    {
                        accountId: account.id,
                        kind: AccountEventKind.FundedReset,
                        occurredOn: '2026-09-10',
                    },
                ],
                payouts: [
                    paidPayout(account, {
                        grossCents: usdCents(withdrawableCents),
                        netCents: usdCents(withdrawableCents),
                        paidOn: '2026-09-12',
                    }),
                ],
                rulebook,
            });
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
            expect(alerts[0]?.message).toContain('was reset');
            expect(alerts[0]?.message).not.toContain('paid out in between');
        });

        it('nets only the payout paid on or before the reset day when payouts fall on both sides of it', () => {
            const { account, latest, plan, previous } = resetFixtures();
            const rulebook = rulebookWithLossFraction(0.2);
            const withdrawableCents = Math.round(
                fundedWithdrawableDollarsOf(rulebook, previous) * 100,
            );
            const beforeCents = Math.round(withdrawableCents / 4);
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [
                    reconstructedEntry(account.id, plan, latest, { previous }),
                ],
                events: [
                    {
                        accountId: account.id,
                        kind: AccountEventKind.FundedReset,
                        occurredOn: '2026-09-10',
                    },
                ],
                payouts: [
                    paidPayout(account, {
                        grossCents: usdCents(beforeCents),
                        netCents: usdCents(beforeCents),
                        paidOn: '2026-09-10',
                    }),
                    paidPayout(account, {
                        grossCents: usdCents(withdrawableCents),
                        netCents: usdCents(withdrawableCents),
                        paidOn: '2026-09-12',
                    }),
                ],
                rulebook,
            });
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.message).toContain(
                `${formatUsdCents(usdCents(withdrawableCents - beforeCents))} of the`,
            );
            expect(alerts[0]?.message).toContain(
                `after the ${formatUsdCents(usdCents(beforeCents))} paid out in between`,
            );
        });

        it('ignores a reset that happened before the previous snapshot', () => {
            const { account, plan, previous } = resetFixtures();
            const latest = fundedReconstructed(plan, {
                balance: plan.accountSize + 19_500,
                cumulativePayout: 0,
                cycleBestDayProfit: 19_500,
                lastPayoutBalance: plan.accountSize,
                payoutsIssued: 1,
            });
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [
                    reconstructedEntry(account.id, plan, latest, { previous }),
                ],
                events: [
                    {
                        accountId: account.id,
                        kind: AccountEventKind.FundedReset,
                        occurredOn: '2026-08-20',
                    },
                ],
                rulebook: rulebookWithLossFraction(0.2),
            });
            expect(alerts).toEqual([]);
        });
    });

    describe('a payout starts a new cycle between the two snapshots', () => {
        it('is silent after a partial payout with no trading loss', () => {
            const plan = mffProPlan();
            const account = accountFor(
                { firmId: plan.id.firm, plan },
                { stage: AccountStage.Funded },
            );
            const previous = eligiblePreviousFunded(
                plan,
                plan.accountSize + 20_000,
            );
            const rulebook = rulebookWithLossFraction(0.2);
            const paidDollars =
                fundedWithdrawableDollarsOf(rulebook, previous) / 4;
            const latestBalance = plan.accountSize + 20_000 - paidDollars;
            const latest = fundedReconstructed(plan, {
                balance: latestBalance,
                cumulativePayout: paidDollars,
                cycleBestDayProfit: 0,
                lastPayoutBalance: latestBalance,
                payoutsIssued: 2,
            });
            const paidCents = Math.round(paidDollars * 100);
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [
                    reconstructedEntry(account.id, plan, latest, { previous }),
                ],
                payouts: [
                    paidPayout(account, {
                        grossCents: usdCents(paidCents),
                        netCents: usdCents(paidCents),
                        paidOn: '2026-09-10',
                    }),
                ],
                rulebook,
            });
            expect(alerts).toEqual([]);
        });
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
        it('was payout-eligible with a withdrawable before the payout, so the same loss fires without it', () => {
            const { account, latest, plan, previous, rulebook } =
                capBoundFixtures(id, true);
            expect(
                fundedWithdrawableDollarsOf(rulebook, previous),
            ).toBeGreaterThan(0);
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [
                    reconstructedEntry(account.id, plan, latest, { previous }),
                ],
                rulebook,
            });
            expect(alerts).toHaveLength(1);
        });

        it('is silent when the payout is the only change', () => {
            const { account, latest, payouts, plan, previous, rulebook } =
                capBoundFixtures(id, false);
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [
                    reconstructedEntry(account.id, plan, latest, { previous }),
                ],
                payouts,
                rulebook,
            });
            expect(alerts).toEqual([]);
        });

        it('fires when the account is reset after the payout, because the withdrawable still available after the payout was lost', () => {
            const { account, payouts, plan, previous, rulebook } =
                capBoundFixtures(id, false);
            const afterReset = fundedReconstructed(plan, {
                balance: plan.accountSize,
                cumulativePayout: 0,
                cycleBestDayProfit: 0,
                lastPayoutBalance: plan.accountSize,
                payoutsIssued: 0,
            });
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [
                    reconstructedEntry(account.id, plan, afterReset, {
                        previous,
                    }),
                ],
                events: [
                    {
                        accountId: account.id,
                        kind: AccountEventKind.FundedReset,
                        occurredOn: '2026-09-12',
                    },
                ],
                payouts,
                rulebook,
            });
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
            expect(alerts[0]?.message).toContain('was reset');
        });

        it('still fires when the remaining profit was then lost', () => {
            const { account, latest, payouts, plan, previous, rulebook } =
                capBoundFixtures(id, true);
            expect(fundedWithdrawableDollarsOf(rulebook, latest)).toBe(0);
            const alerts = alertsOf(rule, {
                accounts: [account],
                accountStates: [
                    reconstructedEntry(account.id, plan, latest, { previous }),
                ],
                payouts,
                rulebook,
            });
            expect(alerts).toHaveLength(1);
            expect(alerts[0]?.severity).toBe(AlertSeverity.Critical);
        });
    });
});
