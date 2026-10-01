import { describe, expect, it, vi } from 'vitest';

import { usdCentsFromDollars } from '~/lib/prop-accounts/core';
import {
    AccountStateUnavailableKind,
    payoutReadinessBoardOf,
    PayoutReadinessNotApplicableKind,
    PayoutReadinessRowKind,
} from '~/lib/prop-accounts/metrics';
import {
    findFirm,
    FirmId,
    FundedCycleTracker,
    TradeifyVariant,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    PayoutBlockReasonKind,
} from '~/lib/prop-calculator/advisor';

import {
    evalReconstructed,
    fundedReconstructed,
    mffProPlan,
    reconstructedEntry,
    unavailableEntry,
} from '../reconstructionFixtures';

function tradeifyLightningPlan() {
    const plan = findFirm(FirmId.Tradeify)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Tradeify,
        variant: TradeifyVariant.Lightning,
    });
    if (!plan) throw new Error('Tradeify Lightning plan missing');
    return plan;
}

describe('payoutReadinessBoardOf', () => {
    it('is not eligible while the day gate blocks it, and never reads closeoutCredit', () => {
        const plan = mffProPlan();
        const spy = vi.spyOn(FundedCycleTracker.prototype, 'closeoutCredit');
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
        });
        expect(
            funded.fundedTracker?.closeoutCredit({
                minRetainedCushion: 0,
                payoutRequestSize: 20_000,
                plan,
                state: funded.state,
            }),
        ).toBeGreaterThan(0);
        spy.mockClear();

        const board = payoutReadinessBoardOf(DEFAULT_RULEBOOK, [
            reconstructedEntry('a1', plan, funded),
        ]);

        expect(spy).not.toHaveBeenCalled();
        expect(board.rows).toEqual([
            expect.objectContaining({
                accountId: 'a1',
                kind: PayoutReadinessRowKind.Blocked,
            }),
        ]);
        spy.mockRestore();
    });

    it('shows the firm minimum notice for MFF Pro, above the $500 rulebook default', () => {
        const plan = mffProPlan();
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
            cumulativePayout: 0,
            cycleBestDayProfit: 20_000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        if (funded.fundedTracker === null) {
            throw new Error('expected a funded tracker');
        }
        funded.fundedTracker.sessionDaysSinceAnchor = 999;
        const board = payoutReadinessBoardOf(DEFAULT_RULEBOOK, [
            reconstructedEntry('a1', plan, funded),
        ]);
        const [row] = board.rows;
        if (row?.kind !== PayoutReadinessRowKind.Eligible) {
            throw new Error(`expected eligible, got ${JSON.stringify(row)}`);
        }
        expect(row.firmMinimumNotice).toEqual({
            minimumRequestAmountCents: usdCentsFromDollars(1000),
            requestedAmountCents: usdCentsFromDollars(500),
        });
        expect(row.requestedAmountCents).toEqual(usdCentsFromDollars(1000));
        expect(row.traderReceivesCents).toEqual(
            usdCentsFromDollars(plan.payoutFromProfit(1000, 1)),
        );
    });

    it('shows the firm minimum notice for a second above-$500 plan (Tradeify Lightning)', () => {
        const plan = tradeifyLightningPlan();
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
            cumulativePayout: 0,
            cycleBestDayProfit: 2000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        if (funded.fundedTracker === null) {
            throw new Error('expected a funded tracker');
        }
        funded.fundedTracker.sessionDaysSinceAnchor = 999;
        const board = payoutReadinessBoardOf(DEFAULT_RULEBOOK, [
            reconstructedEntry('a1', plan, funded),
        ]);
        const [row] = board.rows;
        if (row?.kind !== PayoutReadinessRowKind.Eligible) {
            throw new Error(`expected eligible, got ${JSON.stringify(row)}`);
        }
        expect(row.firmMinimumNotice?.minimumRequestAmountCents).toEqual(
            usdCentsFromDollars(1000),
        );
    });

    it('takes a personal request override through effectivePayoutRequest', () => {
        const plan = mffProPlan();
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
            cumulativePayout: 0,
            cycleBestDayProfit: 20_000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        if (funded.fundedTracker === null) {
            throw new Error('expected a funded tracker');
        }
        funded.fundedTracker.sessionDaysSinceAnchor = 999;
        const board = payoutReadinessBoardOf(
            DEFAULT_RULEBOOK,
            [reconstructedEntry('a1', plan, funded)],
            new Map([['a1', { personalRequestOverride: 5000 }]]),
        );
        const [row] = board.rows;
        if (row?.kind !== PayoutReadinessRowKind.Eligible) {
            throw new Error(`expected eligible, got ${JSON.stringify(row)}`);
        }
        expect(row.firmMinimumNotice).toBeNull();
        expect(row.requestedAmountCents).toEqual(usdCentsFromDollars(5000));
    });

    it('lists eval and live accounts as not applicable, and unavailable ones separately', () => {
        const plan = mffProPlan();
        const board = payoutReadinessBoardOf(DEFAULT_RULEBOOK, [
            reconstructedEntry('eval', plan, evalReconstructed(plan)),
            unavailableEntry('missing', {
                kind: AccountStateUnavailableKind.NoSnapshot,
            }),
        ]);
        expect(board.rows).toEqual([]);
        expect(board.notApplicable).toEqual([
            {
                accountId: 'eval',
                notApplicable: { kind: PayoutReadinessNotApplicableKind.NotFunded },
            },
            {
                accountId: 'missing',
                notApplicable: {
                    kind: PayoutReadinessNotApplicableKind.Unavailable,
                    reason: { kind: AccountStateUnavailableKind.NoSnapshot },
                },
            },
        ]);
    });

    it('shows PayoutPending with the raw pending amount when a pending payout is the only thing blocking it', () => {
        const plan = mffProPlan();
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 3000,
            cumulativePayout: 0,
            cycleBestDayProfit: 3000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
            pendingPayouts: 2500,
        });
        if (funded.fundedTracker === null) {
            throw new Error('expected a funded tracker');
        }
        funded.fundedTracker.sessionDaysSinceAnchor = 999;
        const board = payoutReadinessBoardOf(DEFAULT_RULEBOOK, [
            reconstructedEntry('a1', plan, funded),
        ]);
        const [row] = board.rows;
        if (row?.kind !== PayoutReadinessRowKind.Blocked) {
            throw new Error(`expected blocked, got ${JSON.stringify(row)}`);
        }
        expect(row.reason.kind).toBe(PayoutBlockReasonKind.PayoutPending);
        expect(row.pendingAmountCents).toBe(usdCentsFromDollars(2500));
    });

    it('carries no pending amount when blocked for another reason', () => {
        const plan = mffProPlan();
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
        });
        const board = payoutReadinessBoardOf(DEFAULT_RULEBOOK, [
            reconstructedEntry('a1', plan, funded),
        ]);
        const [row] = board.rows;
        if (row?.kind !== PayoutReadinessRowKind.Blocked) {
            throw new Error(`expected blocked, got ${JSON.stringify(row)}`);
        }
        expect(row.reason.kind).not.toBe(PayoutBlockReasonKind.PayoutPending);
        expect(row.pendingAmountCents).toBeNull();
    });

    it('never returns an amount above the balance minus post-payout floor minus retained cushion', () => {
        const plan = mffProPlan();
        const funded = fundedReconstructed(plan, {
            balance: plan.accountSize + 20_000,
            cumulativePayout: 0,
            cycleBestDayProfit: 20_000,
            lastPayoutBalance: plan.accountSize,
            payoutsIssued: 1,
        });
        if (funded.fundedTracker === null) {
            throw new Error('expected a funded tracker');
        }
        funded.fundedTracker.sessionDaysSinceAnchor = 999;
        const board = payoutReadinessBoardOf(
            DEFAULT_RULEBOOK,
            [reconstructedEntry('a1', plan, funded)],
            new Map([['a1', { personalRequestOverride: 1_000_000 }]]),
        );
        const [row] = board.rows;
        expect(row?.kind).not.toBe(PayoutReadinessRowKind.Eligible);
        if (row?.kind === PayoutReadinessRowKind.Blocked) {
            expect(row.reason.kind).toBe(PayoutBlockReasonKind.Gate);
        }
    });
});
