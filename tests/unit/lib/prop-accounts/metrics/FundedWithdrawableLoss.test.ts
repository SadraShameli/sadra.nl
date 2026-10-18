import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    compareText,
    usdCents,
    usdCentsFromDollars,
} from '~/lib/prop-accounts/core';
import {
    fundedWithdrawableDollarsOf,
    fundedWithdrawableLossCents,
    fundedWithdrawableLostToResetCents,
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

import { posixPath } from '../../../posixPath';
import { fundedReconstructed, mffProPlan } from '../reconstructionFixtures';

const SOURCE_ROOT = path.join(import.meta.dirname, '../../../../../src');

const CAP_BOUND_PLANS = [
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
];

const LOSS_MEASURE_CONSUMERS: readonly string[] = [
    'lib/prop-accounts/alerts/PayoutReadyWithdrawableDropRule.ts',
    'lib/prop-accounts/metrics/DayLossShare.ts',
];

function filesMatching(pattern: RegExp): string[] {
    return sourceFiles(SOURCE_ROOT)
        .filter((file) => pattern.test(readFileSync(file, 'utf8')))
        .map((file) => posixPath(path.relative(SOURCE_ROOT, file)))
        .toSorted(compareText);
}

function planOf(id: PlanId): Plan {
    const plan = findFirm(id.firm)?.findPlan(id);
    if (!plan) throw new Error('fixture plan missing from the registry');
    return plan;
}

function previousOf(plan: Plan, profit: number) {
    const funded = fundedReconstructed(plan, {
        balance: plan.accountSize + profit,
        cumulativePayout: 0,
        cycleBestDayProfit: profit,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    if (funded.fundedTracker === null) throw new Error('expected a tracker');
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    funded.state.qualifyingDays = 999;
    return funded;
}

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const child = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(child);
        return /\.tsx?$/.test(entry.name) ? child : [];
    });
}

function withdrawableCentsOf(account: ReturnType<typeof previousOf>) {
    return usdCentsFromDollars(
        fundedWithdrawableDollarsOf(DEFAULT_RULEBOOK, account),
    );
}

describe('fundedWithdrawableLossCents on an uncapped plan', () => {
    const plan = mffProPlan();

    it('is the whole withdrawable drop when no payout was paid in between', () => {
        const previous = previousOf(plan, 20_000);
        const latest = previousOf(plan, 1000);
        expect(
            fundedWithdrawableLossCents({
                latestWithdrawableCents: withdrawableCentsOf(latest),
                payoutsPaidGrossCents: usdCents(0),
                previous,
                profitSinceSnapshotDollars: -19_000,
                rulebook: DEFAULT_RULEBOOK,
            }),
        ).toBe(withdrawableCentsOf(previous) - withdrawableCentsOf(latest));
    });

    it('is zero when the whole withdrawable was paid out and a larger loss followed, because the payout is banked', () => {
        const previous = previousOf(plan, 20_000);
        const withdrawableCents = withdrawableCentsOf(previous);
        expect(withdrawableCents).toBeGreaterThan(500_000);
        expect(
            fundedWithdrawableLossCents({
                latestWithdrawableCents: usdCents(0),
                payoutsPaidGrossCents: withdrawableCents,
                previous,
                profitSinceSnapshotDollars: -5000,
                rulebook: DEFAULT_RULEBOOK,
            }),
        ).toBe(0);
    });

    it('is the withdrawable left after a partial payout when it was then lost', () => {
        const previous = previousOf(plan, 20_000);
        const withdrawableCents = withdrawableCentsOf(previous);
        const paidCents = usdCents(Math.round(withdrawableCents / 4));
        expect(
            fundedWithdrawableLossCents({
                latestWithdrawableCents: usdCents(0),
                payoutsPaidGrossCents: paidCents,
                previous,
                profitSinceSnapshotDollars: -20_000,
                rulebook: DEFAULT_RULEBOOK,
            }),
        ).toBe(withdrawableCents - paidCents);
    });

    it('is capped at the lost trading profit when a payout was paid in between', () => {
        const previous = previousOf(plan, 20_000);
        const withdrawableCents = withdrawableCentsOf(previous);
        const paidCents = usdCents(Math.round(withdrawableCents / 4));
        expect(
            fundedWithdrawableLossCents({
                latestWithdrawableCents: usdCents(0),
                payoutsPaidGrossCents: paidCents,
                previous,
                profitSinceSnapshotDollars: -1500,
                rulebook: DEFAULT_RULEBOOK,
            }),
        ).toBe(150_000);
    });

    it('is zero when the payout was the only change', () => {
        const previous = previousOf(plan, 20_000);
        const withdrawableCents = withdrawableCentsOf(previous);
        expect(
            fundedWithdrawableLossCents({
                latestWithdrawableCents: usdCents(0),
                payoutsPaidGrossCents: withdrawableCents,
                previous,
                profitSinceSnapshotDollars: 0,
                rulebook: DEFAULT_RULEBOOK,
            }),
        ).toBe(0);
    });

    it('never goes negative when the withdrawable grew', () => {
        const previous = previousOf(plan, 4000);
        const latest = previousOf(plan, 20_000);
        const latestWithdrawableCents = withdrawableCentsOf(latest);
        expect(
            fundedWithdrawableLossCents({
                latestWithdrawableCents,
                payoutsPaidGrossCents: usdCents(0),
                previous,
                profitSinceSnapshotDollars: 16_000,
                rulebook: DEFAULT_RULEBOOK,
            }),
        ).toBe(0);
    });
});

describe('fundedWithdrawableLostToResetCents', () => {
    it('is the whole withdrawable when nothing was paid out', () => {
        const previous = previousOf(mffProPlan(), 20_000);
        expect(
            fundedWithdrawableLostToResetCents({
                payoutsPaidGrossCents: usdCents(0),
                previous,
                rulebook: DEFAULT_RULEBOOK,
            }),
        ).toBe(withdrawableCentsOf(previous));
    });

    it('never goes negative when the payout was larger than the withdrawable', () => {
        const previous = previousOf(mffProPlan(), 20_000);
        const paidCents = usdCents(withdrawableCentsOf(previous) + 5_000_000);
        expect(
            fundedWithdrawableLostToResetCents({
                payoutsPaidGrossCents: paidCents,
                previous,
                rulebook: DEFAULT_RULEBOOK,
            }),
        ).toBe(0);
    });
});

describe.each(CAP_BOUND_PLANS)(
    'the withdrawable after a payout on the cap-bound $name plan',
    ({ id }) => {
        it('is still above zero after a payout of the whole capped withdrawable, so a reset then loses it', () => {
            const previous = previousOf(planOf(id), 12_000);
            const withdrawableCents = withdrawableCentsOf(previous);
            expect(withdrawableCents).toBeGreaterThan(0);
            const lost = fundedWithdrawableLostToResetCents({
                payoutsPaidGrossCents: withdrawableCents,
                previous,
                rulebook: DEFAULT_RULEBOOK,
            });
            expect(lost).toBeGreaterThan(0);
            expect(lost).toBeLessThanOrEqual(withdrawableCents);
        });

        it('is counted as lost when the remaining profit is then lost', () => {
            const plan = planOf(id);
            const previous = previousOf(plan, 12_000);
            const withdrawableCents = withdrawableCentsOf(previous);
            const lostTradingProfit = 12_000 - withdrawableCents / 100;
            expect(
                fundedWithdrawableLossCents({
                    latestWithdrawableCents: usdCents(0),
                    payoutsPaidGrossCents: withdrawableCents,
                    previous,
                    profitSinceSnapshotDollars: -lostTradingProfit,
                    rulebook: DEFAULT_RULEBOOK,
                }),
            ).toBeGreaterThan(0);
        });
    },
);

describe('the payout-netted funded loss', () => {
    it('is defined once and used by the day-loss metric and the withdrawable-drop rule', () => {
        expect(filesMatching(/function fundedWithdrawableLossCents\(/)).toEqual(
            ['lib/prop-accounts/metrics/FundedWithdrawableLoss.ts'],
        );
        expect(filesMatching(/\bfundedWithdrawableLossCents\(/)).toEqual(
            [
                ...LOSS_MEASURE_CONSUMERS,
                'lib/prop-accounts/metrics/FundedWithdrawableLoss.ts',
            ].toSorted(compareText),
        );
        expect(filesMatching(/\bfundedWithdrawableLostToResetCents\(/)).toEqual(
            [
                'lib/prop-accounts/alerts/PayoutReadyWithdrawableDropRule.ts',
                'lib/prop-accounts/metrics/FundedWithdrawableLoss.ts',
            ],
        );
    });

    it('is not netted by hand in either consumer', () => {
        for (const consumer of LOSS_MEASURE_CONSUMERS) {
            const source = readFileSync(
                path.join(SOURCE_ROOT, consumer),
                'utf8',
            );
            expect(source).not.toMatch(/Math\.min\(/);
            expect(source).not.toMatch(/before - after - paid/);
            expect(source).not.toMatch(/previousCents - paid/);
            expect(source).not.toMatch(/\bpaid\w* - /);
            expect(source).not.toMatch(/ - paid\w*/);
        }
    });
});
