import { describe, expect, it } from 'vitest';

import {
    PayoutStatus,
    usdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';
import {
    AccountStateUnavailableKind,
    type ConcentrationAccount,
    firmProfitConcentrationOf,
    fundedWithdrawableDollarsOf,
} from '~/lib/prop-accounts/metrics';
import {
    findFirm,
    FirmId,
    type PlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    ruleCappedWithdrawable,
} from '~/lib/prop-calculator/advisor';

import {
    evalReconstructed,
    fundedReconstructed,
    liveReconstructed,
    mffProPlan,
    notReconstructed,
    reconstructedEntry,
} from '../reconstructionFixtures';

const TODAY = '2026-09-23';
const OPTIONS = { recentDays: 30, rulebook: DEFAULT_RULEBOOK, today: TODAY };

function accountOf(
    accountId: string,
    firmId: FirmId,
    extraProfit: number,
    overrides: Partial<ConcentrationAccount> = {},
): ConcentrationAccount {
    const { funded, plan } = inProfitFunded(extraProfit);
    return {
        accountId,
        firmId,
        isActive: true,
        isStale: false,
        movedLiveOn: null,
        paidPayouts: [],
        state: reconstructedEntry(accountId, plan, funded).state,
        ...overrides,
    };
}

function inProfitFunded(extraProfit: number) {
    const plan = mffProPlan();
    const funded = fundedReconstructed(plan, {
        balance: plan.accountSize + extraProfit,
        cumulativePayout: 0,
        cycleBestDayProfit: extraProfit,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    if (funded.fundedTracker === null) throw new Error('expected a tracker');
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    return { funded, plan };
}

function paid(
    grossCents: number,
    paidOn: null | string,
    netCents: null | number = null,
) {
    return {
        grossCents: usdCents(grossCents),
        netCents: netCents === null ? null : usdCents(netCents),
        paidOn,
        status: PayoutStatus.Paid,
    };
}

const TOPSTEP_STANDARD_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.TopStep,
    variant: TopStepVariant.StandardStandard,
};

function topStepFundedAt(extraProfit: number) {
    const plan = findFirm(FirmId.TopStep)?.findPlan(TOPSTEP_STANDARD_ID);
    if (!plan) throw new Error('the TopStep plan is missing from the registry');
    const funded = fundedReconstructed(plan, {
        balance: plan.accountSize + extraProfit,
        cumulativePayout: 0,
        cycleBestDayProfit: extraProfit,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    if (funded.fundedTracker === null) throw new Error('expected a tracker');
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    return funded;
}

describe('fundedWithdrawableDollarsOf', () => {
    it.each([
        [1000, 0],
        [2500, 500],
        [4000, 2000],
    ])(
        'caps a release-floor plan at the rule-capped withdrawable (TopStep, $%i profit gives $%i)',
        (extraProfit, expected) => {
            const funded = topStepFundedAt(extraProfit);
            const { fundedTracker } = funded;
            if (fundedTracker === null) throw new Error('expected a tracker');
            expect(
                ruleCappedWithdrawable(
                    funded.plan,
                    fundedTracker,
                    funded.state,
                    2000,
                ),
            ).toBe(expected);
            expect(fundedWithdrawableDollarsOf(DEFAULT_RULEBOOK, funded)).toBe(
                expected,
            );
        },
    );

    it('is zero for an eval account that has no funded tracker', () => {
        const account = evalReconstructed(mffProPlan());
        expect(fundedWithdrawableDollarsOf(DEFAULT_RULEBOOK, account)).toBe(0);
    });

    it('is the tracker withdrawable for a funded account in profit', () => {
        const { funded } = inProfitFunded(20_000);
        expect(
            fundedWithdrawableDollarsOf(DEFAULT_RULEBOOK, funded),
        ).toBeGreaterThan(0);
    });

    it('is never negative for a funded account under water', () => {
        const plan = mffProPlan();
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize - 500,
        });
        expect(
            fundedWithdrawableDollarsOf(DEFAULT_RULEBOOK, funded),
        ).toBeGreaterThanOrEqual(0);
    });
});

describe('firmProfitConcentrationOf', () => {
    it('is empty for no accounts', () => {
        expect(firmProfitConcentrationOf([], OPTIONS)).toEqual({
            firms: [],
            recentDays: 30,
            retainedCushionDollars: null,
            totalInProfitAccounts: 0,
            totalWithdrawableCents: 0,
        });
    });

    it('counts funded accounts in profit per firm and their withdrawable, and ranks the biggest firm first', () => {
        const result = firmProfitConcentrationOf(
            [
                accountOf('a1', FirmId.Mffu, 20_000),
                accountOf('a2', FirmId.Mffu, 20_000),
                accountOf('a3', FirmId.Apex, 20_000),
            ],
            OPTIONS,
        );
        const [first, second] = result.firms;
        expect(first?.firmId).toBe(FirmId.Mffu);
        expect(first?.fundedAccounts).toBe(2);
        expect(first?.inProfitAccounts).toBe(2);
        expect(first?.inProfitAccountIds).toEqual(['a1', 'a2']);
        expect(second?.firmId).toBe(FirmId.Apex);
        expect(second?.inProfitAccounts).toBe(1);
        const oneAccount = usdCentsFromDollars(
            fundedWithdrawableDollarsOf(
                DEFAULT_RULEBOOK,
                inProfitFunded(20_000).funded,
            ),
        );
        expect(oneAccount).toBeGreaterThan(0);
        expect(first?.withdrawableCents).toBe(oneAccount * 2);
        expect(second?.withdrawableCents).toBe(oneAccount);
        expect(result.totalWithdrawableCents).toBe(oneAccount * 3);
        expect(result.totalInProfitAccounts).toBe(3);
        expect(first?.withdrawableShare).toBeCloseTo(2 / 3, 10);
        expect(second?.withdrawableShare).toBeCloseTo(1 / 3, 10);
    });

    it('does not count a funded account at or below its starting profit as in profit', () => {
        const plan = mffProPlan();
        const flat = fundedReconstructed(plan, { balance: plan.accountSize });
        const result = firmProfitConcentrationOf(
            [
                {
                    accountId: 'flat',
                    firmId: FirmId.Mffu,
                    isActive: true,
                    isStale: false,
                    movedLiveOn: null,
                    paidPayouts: [],
                    state: reconstructedEntry('flat', plan, flat).state,
                },
            ],
            OPTIONS,
        );
        expect(result.firms[0]?.fundedAccounts).toBe(1);
        expect(result.firms[0]?.inProfitAccounts).toBe(0);
        expect(result.firms[0]?.withdrawableShare).toBeNull();
        expect(result.totalWithdrawableCents).toBe(0);
    });

    it('leaves eval, live and unreconstructed accounts out of the funded counts', () => {
        const plan = mffProPlan();
        const result = firmProfitConcentrationOf(
            [
                {
                    accountId: 'eval',
                    firmId: FirmId.Mffu,
                    isActive: true,
                    isStale: false,
                    movedLiveOn: null,
                    paidPayouts: [],
                    state: reconstructedEntry(
                        'eval',
                        plan,
                        evalReconstructed(plan),
                    ).state,
                },
                {
                    accountId: 'live',
                    firmId: FirmId.Mffu,
                    isActive: true,
                    isStale: false,
                    movedLiveOn: null,
                    paidPayouts: [],
                    state: reconstructedEntry(
                        'live',
                        plan,
                        liveReconstructed(plan),
                    ).state,
                },
                {
                    accountId: 'none',
                    firmId: FirmId.Mffu,
                    isActive: true,
                    isStale: false,
                    movedLiveOn: null,
                    paidPayouts: [],
                    state: notReconstructed({
                        kind: AccountStateUnavailableKind.NoSnapshot,
                    }),
                },
            ],
            OPTIONS,
        );
        expect(result.firms[0]?.fundedAccounts).toBe(0);
        expect(result.firms[0]?.inProfitAccounts).toBe(0);
    });

    it('counts the active accounts it could not read and the funded accounts whose snapshot is stale, never silently', () => {
        const plan = mffProPlan();
        const result = firmProfitConcentrationOf(
            [
                accountOf('fresh', FirmId.Mffu, 20_000),
                accountOf('stale', FirmId.Mffu, 20_000, { isStale: true }),
                accountOf('ended-stale', FirmId.Mffu, 20_000, {
                    isActive: false,
                    isStale: true,
                }),
                {
                    accountId: 'unread',
                    firmId: FirmId.Mffu,
                    isActive: true,
                    isStale: false,
                    movedLiveOn: null,
                    paidPayouts: [],
                    state: notReconstructed({
                        kind: AccountStateUnavailableKind.NoSnapshot,
                    }),
                },
                {
                    accountId: 'ended-unread',
                    firmId: FirmId.Mffu,
                    isActive: false,
                    isStale: false,
                    movedLiveOn: null,
                    paidPayouts: [],
                    state: notReconstructed({
                        kind: AccountStateUnavailableKind.NoSnapshot,
                    }),
                },
                {
                    accountId: 'stale-eval',
                    firmId: FirmId.Mffu,
                    isActive: true,
                    isStale: true,
                    movedLiveOn: null,
                    paidPayouts: [],
                    state: reconstructedEntry(
                        'stale-eval',
                        plan,
                        evalReconstructed(plan),
                    ).state,
                },
            ],
            OPTIONS,
        );
        const [firm] = result.firms;
        expect(firm?.fundedAccounts).toBe(2);
        expect(firm?.staleAccounts).toBe(1);
        expect(firm?.unreadableAccounts).toBe(1);
    });

    it('names the retained cushion it assumed, the larger of Hard Rule 2 and the rulebook size', () => {
        const accounts = [accountOf('a1', FirmId.Mffu, 20_000)];
        expect(
            firmProfitConcentrationOf(accounts, OPTIONS)
                .retainedCushionDollars,
        ).toBe(2000);
        expect(
            firmProfitConcentrationOf(accounts, {
                ...OPTIONS,
                rulebook: {
                    ...DEFAULT_RULEBOOK,
                    payout: {
                        ...DEFAULT_RULEBOOK.payout,
                        retainedCushionCents: 350_000,
                    },
                },
            }).retainedCushionDollars,
        ).toBe(3500);
    });

    it('keeps an ended account out of the profit counts while its payouts and move live still count for the firm', () => {
        const result = firmProfitConcentrationOf(
            [
                accountOf('ended', FirmId.Mffu, 20_000, {
                    isActive: false,
                    movedLiveOn: '2026-07-01',
                    paidPayouts: [paid(100_000, '2026-09-10', 90_000)],
                }),
            ],
            OPTIONS,
        );
        const [firm] = result.firms;
        expect(firm?.fundedAccounts).toBe(0);
        expect(firm?.inProfitAccounts).toBe(0);
        expect(firm?.withdrawableCents).toBe(0);
        expect(firm?.recentPayouts).toEqual({ cents: 90_000, count: 1 });
        expect(firm?.payoutsSinceLastMovedLive.since).toBe('2026-07-01');
    });

    it('counts paid payouts inside the recent window and none outside it', () => {
        const result = firmProfitConcentrationOf(
            [
                accountOf('a1', FirmId.Mffu, 20_000, {
                    paidPayouts: [
                        paid(100_000, '2026-09-10', 90_000),
                        paid(50_000, '2026-08-24', null),
                        paid(70_000, '2026-08-23', 60_000),
                    ],
                }),
            ],
            OPTIONS,
        );
        const [firm] = result.firms;
        expect(firm?.recentPayouts).toEqual({ cents: 140_000, count: 2 });
    });

    it('counts only paid payouts with a paid date', () => {
        const result = firmProfitConcentrationOf(
            [
                accountOf('a1', FirmId.Mffu, 20_000, {
                    paidPayouts: [
                        paid(100_000, null, 90_000),
                        {
                            grossCents: usdCents(40_000),
                            netCents: usdCents(36_000),
                            paidOn: '2026-09-20',
                            status: PayoutStatus.Requested,
                        },
                    ],
                }),
            ],
            OPTIONS,
        );
        expect(result.firms[0]?.recentPayouts).toEqual({ cents: 0, count: 0 });
    });

    it('counts payouts since the latest move live of any account at the firm', () => {
        const result = firmProfitConcentrationOf(
            [
                accountOf('a1', FirmId.Mffu, 20_000, {
                    movedLiveOn: '2026-07-01',
                    paidPayouts: [
                        paid(100_000, '2026-06-20', 90_000),
                        paid(80_000, '2026-08-01', 70_000),
                    ],
                }),
                accountOf('a2', FirmId.Mffu, 20_000, {
                    movedLiveOn: '2026-07-15',
                    paidPayouts: [
                        paid(60_000, '2026-07-10', 50_000),
                        paid(30_000, '2026-09-01', 25_000),
                    ],
                }),
            ],
            OPTIONS,
        );
        const [firm] = result.firms;
        expect(firm?.payoutsSinceLastMovedLive).toEqual({
            cents: 95_000,
            count: 2,
            since: '2026-07-15',
        });
    });

    it('counts every paid payout and reports no date when the firm never moved live', () => {
        const result = firmProfitConcentrationOf(
            [
                accountOf('a1', FirmId.Mffu, 20_000, {
                    paidPayouts: [
                        paid(100_000, '2026-06-20', 90_000),
                        paid(80_000, '2026-08-01', 70_000),
                    ],
                }),
            ],
            OPTIONS,
        );
        expect(result.firms[0]?.payoutsSinceLastMovedLive).toEqual({
            cents: 160_000,
            count: 2,
            since: null,
        });
    });

    it('is separate per firm: another firm moving live does not reset this firm', () => {
        const result = firmProfitConcentrationOf(
            [
                accountOf('a1', FirmId.Mffu, 20_000, {
                    paidPayouts: [paid(100_000, '2026-06-20', 90_000)],
                }),
                accountOf('a2', FirmId.Apex, 20_000, {
                    movedLiveOn: '2026-09-01',
                }),
            ],
            OPTIONS,
        );
        const mffu = result.firms.find((firm) => firm.firmId === FirmId.Mffu);
        expect(mffu?.payoutsSinceLastMovedLive.since).toBeNull();
        expect(mffu?.payoutsSinceLastMovedLive.count).toBe(1);
    });

    it('refuses a non-positive recent window', () => {
        expect(() =>
            firmProfitConcentrationOf([], { ...OPTIONS, recentDays: 0 }),
        ).toThrow(RangeError);
    });
});
