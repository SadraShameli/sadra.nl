import { describe, expect, it } from 'vitest';

import { roundReturns } from '~/lib/prop-accounts/bankroll';
import {
    AccountEventKind,
    FeeKind,
    RoundStatus,
    usdCents,
} from '~/lib/prop-accounts/core';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    INSTANT_PLAN,
    ledger,
    payout,
    round,
} from '../metrics/ledgerFixtures';

const THRESHOLDS = {
    minClosedRounds: null,
    minEndedAccounts: null,
    minEvalAttempts: null,
    minFundedAccounts: null,
    minTrades: null,
};

describe('roundReturns', () => {
    it('sums spend and payouts of member accounts only', () => {
        const r = round(EVAL_PLAN, 'Round 1', '2026-01-01', RoundStatus.Open, {
            budgetCents: usdCents(100_000),
        });
        const member = account(EVAL_PLAN, { roundId: r.id });
        const nonMember = account(EVAL_PLAN, { roundId: null });
        const result = roundReturns({
            draws: 200,
            ledger: ledger({
                accounts: [member, nonMember],
                fees: [
                    fee(member, FeeKind.EvalPurchase, 40_000, '2026-01-01'),
                    fee(nonMember, FeeKind.EvalPurchase, 40_000, '2026-01-01'),
                ],
                payouts: [
                    payout(member, 60_000, {
                        netCents: 60_000,
                        paidOn: '2026-01-10',
                    }),
                ],
                rounds: [r],
            }),
            poolNetValuesDollars: [10, -10, 20],
            sampleThresholds: THRESHOLDS,
            seed: 1,
        });
        expect(result.rounds).toHaveLength(1);
        expect(result.rounds[0]).toMatchObject({
            netCents: 20_000,
            payoutsCents: 60_000,
            spendCents: 40_000,
        });
    });

    it('nets refund fees out of the spend', () => {
        const r = round(EVAL_PLAN, 'Round 1', '2026-01-01', RoundStatus.Open);
        const member = account(EVAL_PLAN, { roundId: r.id });
        const result = roundReturns({
            draws: 200,
            ledger: ledger({
                accounts: [member],
                fees: [
                    fee(member, FeeKind.EvalPurchase, 40_000, '2026-01-01'),
                    fee(member, FeeKind.Refund, 40_000, '2026-01-02'),
                ],
                rounds: [r],
            }),
            poolNetValuesDollars: [10, -10],
            sampleThresholds: THRESHOLDS,
            seed: 1,
        });
        expect(result.rounds[0]?.spendCents).toBe(0);
    });

    it('reports the budget used against the round budget', () => {
        const r = round(EVAL_PLAN, 'Round 1', '2026-01-01', RoundStatus.Open, {
            budgetCents: usdCents(100_000),
        });
        const member = account(EVAL_PLAN, { roundId: r.id });
        const result = roundReturns({
            draws: 200,
            ledger: ledger({
                accounts: [member],
                fees: [fee(member, FeeKind.EvalPurchase, 40_000, '2026-01-01')],
                rounds: [r],
            }),
            poolNetValuesDollars: [10, -10],
            sampleThresholds: THRESHOLDS,
            seed: 1,
        });
        expect(result.rounds[0]?.budget).toEqual({
            budgetCents: usdCents(100_000),
            remainingCents: 60_000,
            spentCents: 40_000,
        });
    });

    it('counts open members as in progress and excludes them from the realized multiple', () => {
        const r = round(EVAL_PLAN, 'Round 1', '2026-01-01', RoundStatus.Open);
        const busted = account(EVAL_PLAN, { roundId: r.id });
        const open = account(EVAL_PLAN, { roundId: r.id });
        const result = roundReturns({
            draws: 200,
            ledger: ledger({
                accounts: [busted, open],
                events: [
                    event(busted, AccountEventKind.Purchased, '2026-01-01'),
                    event(busted, AccountEventKind.Busted, '2026-01-05'),
                    event(open, AccountEventKind.Purchased, '2026-01-01'),
                ],
                fees: [
                    fee(busted, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
                    fee(open, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
                ],
                rounds: [r],
            }),
            poolNetValuesDollars: [10, -10],
            sampleThresholds: THRESHOLDS,
            seed: 1,
        });
        expect(result.rounds[0]?.openMemberCount).toBe(1);
        expect(result.rounds[0]?.realizedMultiple?.n).toBe(1);
    });

    it('computes a to-date multiple over all member cash regardless of status', () => {
        const r = round(EVAL_PLAN, 'Round 1', '2026-01-01', RoundStatus.Open);
        const member = account(EVAL_PLAN, { roundId: r.id });
        const result = roundReturns({
            draws: 200,
            ledger: ledger({
                accounts: [member],
                fees: [fee(member, FeeKind.EvalPurchase, 50_000, '2026-01-01')],
                payouts: [
                    payout(member, 100_000, {
                        netCents: 100_000,
                        paidOn: '2026-01-10',
                    }),
                ],
                rounds: [r],
            }),
            poolNetValuesDollars: [10, -10],
            sampleThresholds: THRESHOLDS,
            seed: 1,
        });
        expect(result.rounds[0]?.toDateMultiple).toBe(2);
    });

    it('produces a bootstrap probability and a closed-form cross-check bounded in [0,1]', () => {
        const r = round(EVAL_PLAN, 'Round 1', '2026-01-01', RoundStatus.Open);
        const accounts = Array.from({ length: 3 }, () => account(INSTANT_PLAN, { roundId: r.id }));
        const events = accounts.map((acc) =>
            event(acc, AccountEventKind.Purchased, '2026-01-01'),
        );
        const fees = accounts.map((acc) =>
            fee(acc, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
        );
        const result = roundReturns({
            draws: 500,
            ledger: ledger({ accounts, events, fees, rounds: [r] }),
            poolNetValuesDollars: [50, -100, 200, -50, 30],
            sampleThresholds: THRESHOLDS,
            seed: 42,
        });
        const negative = result.rounds[0]?.likeThisEndsNetNegative;
        expect(negative?.value.value).toBeGreaterThanOrEqual(0);
        expect(negative?.value.value).toBeLessThanOrEqual(1);
        expect(result.rounds[0]?.likeThisEndsNetNegativeClosedForm).not.toBeNull();
    });

    it('states the round\'s own realized outcome as a plain fact, not a probability', () => {
        const r = round(EVAL_PLAN, 'Round 1', '2026-01-01', RoundStatus.Closed, {
            closedOn: '2026-02-01',
        });
        const member = account(EVAL_PLAN, { roundId: r.id });
        const result = roundReturns({
            draws: 200,
            ledger: ledger({
                accounts: [member],
                fees: [fee(member, FeeKind.EvalPurchase, 100_000, '2026-01-01')],
                payouts: [
                    payout(member, 20_000, {
                        netCents: 20_000,
                        paidOn: '2026-01-10',
                    }),
                ],
                rounds: [r],
            }),
            poolNetValuesDollars: [10, -10],
            sampleThresholds: THRESHOLDS,
            seed: 1,
        });
        expect(result.rounds[0]?.ownOutcomeNetNegative).toBe(true);
    });

    it('groups rounds by firm with count, min, max, mean and share positive', () => {
        const roundA = round(EVAL_PLAN, 'Round A', '2026-01-01', RoundStatus.Open);
        const roundB = round(EVAL_PLAN, 'Round B', '2026-03-01', RoundStatus.Open);
        const memberA = account(EVAL_PLAN, { roundId: roundA.id });
        const memberB = account(EVAL_PLAN, { roundId: roundB.id });
        const result = roundReturns({
            draws: 200,
            ledger: ledger({
                accounts: [memberA, memberB],
                fees: [
                    fee(memberA, FeeKind.EvalPurchase, 50_000, '2026-01-01'),
                    fee(memberB, FeeKind.EvalPurchase, 50_000, '2026-03-01'),
                ],
                payouts: [
                    payout(memberA, 100_000, {
                        netCents: 100_000,
                        paidOn: '2026-01-10',
                    }),
                    payout(memberB, 25_000, {
                        netCents: 25_000,
                        paidOn: '2026-03-10',
                    }),
                ],
                rounds: [roundA, roundB],
            }),
            poolNetValuesDollars: [10, -10],
            sampleThresholds: THRESHOLDS,
            seed: 1,
        });
        expect(result.perFirm).toHaveLength(1);
        const summary = result.perFirm[0];
        expect(summary?.rounds).toBe(2);
        expect(summary?.min).toBe(0.5);
        expect(summary?.max).toBe(2);
        expect(summary?.sharePositive).toBe(0.5);
        expect(summary?.sampleLevel).toBeNull();
    });

    it('never throws on a round with no firm assigned, and excludes it from perFirm', () => {
        const r = round(EVAL_PLAN, 'Round unassigned', '2026-01-01', RoundStatus.Open, {
            externalFirmId: null,
            firmId: null,
        });
        const member = account(EVAL_PLAN, { roundId: r.id });
        const result = roundReturns({
            draws: 200,
            ledger: ledger({
                accounts: [member],
                fees: [fee(member, FeeKind.EvalPurchase, 40_000, '2026-01-01')],
                rounds: [r],
            }),
            poolNetValuesDollars: [10, -10],
            sampleThresholds: THRESHOLDS,
            seed: 1,
        });
        expect(result.rounds[0]?.firmKey).toBeNull();
        expect(result.unassignedRoundCount).toBe(1);
        expect(result.perFirm).toHaveLength(0);
    });
});
