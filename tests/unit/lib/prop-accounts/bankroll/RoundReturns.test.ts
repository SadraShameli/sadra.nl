import { describe, expect, it } from 'vitest';

import { roundReturns } from '~/lib/prop-accounts/bankroll';
import {
    AccountEventKind,
    FeeKind,
    PayoutStatus,
    RoundStatus,
    SampleLevel,
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
            isSpent: false,
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
        const accounts = Array.from({ length: 3 }, () =>
            account(INSTANT_PLAN, { roundId: r.id }),
        );
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
        expect(
            result.rounds[0]?.likeThisEndsNetNegativeClosedForm,
        ).not.toBeNull();
    });

    it("states the round's own realized outcome as a plain fact, not a probability", () => {
        const r = round(
            EVAL_PLAN,
            'Round 1',
            '2026-01-01',
            RoundStatus.Closed,
            {
                closedOn: '2026-02-01',
            },
        );
        const member = account(EVAL_PLAN, { roundId: r.id });
        const result = roundReturns({
            draws: 200,
            ledger: ledger({
                accounts: [member],
                fees: [
                    fee(member, FeeKind.EvalPurchase, 100_000, '2026-01-01'),
                ],
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
        const roundA = round(
            EVAL_PLAN,
            'Round A',
            '2026-01-01',
            RoundStatus.Closed,
            { closedOn: '2026-02-01' },
        );
        const roundB = round(
            EVAL_PLAN,
            'Round B',
            '2026-03-01',
            RoundStatus.Closed,
            { closedOn: '2026-04-01' },
        );
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
        expect(summary?.closedRounds).toBe(2);
        expect(summary?.min).toBe(0.5);
        expect(summary?.max).toBe(2);
        expect(summary?.sharePositive?.value).toBe(0.5);
        expect(summary?.sharePositive?.n).toBe(2);
        expect(summary?.sampleLevel).toBeNull();
    });

    it('never throws on a round with no firm assigned, and excludes it from perFirm', () => {
        const r = round(
            EVAL_PLAN,
            'Round unassigned',
            '2026-01-01',
            RoundStatus.Open,
            {
                externalFirmId: null,
                firmId: null,
            },
        );
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

    it('counts only closed rounds toward the firm closed-rounds sample badge', () => {
        const closedRound = round(
            EVAL_PLAN,
            'Closed round',
            '2026-01-01',
            RoundStatus.Closed,
            { closedOn: '2026-02-01' },
        );
        const openRound = round(
            EVAL_PLAN,
            'Open round',
            '2026-03-01',
            RoundStatus.Open,
        );
        const result = roundReturns({
            draws: 200,
            ledger: ledger({ rounds: [closedRound, openRound] }),
            poolNetValuesDollars: [10, -10],
            sampleThresholds: { ...THRESHOLDS, minClosedRounds: 2 },
            seed: 1,
        });
        expect(result.perFirm[0]?.rounds).toBe(2);
        expect(result.perFirm[0]?.sampleLevel).toBe(SampleLevel.Low);
    });

    it('is adequate once enough closed rounds exist at the firm, ignoring open ones', () => {
        const closedRounds = [1, 2].map((index) =>
            round(
                EVAL_PLAN,
                `Closed ${String(index)}`,
                '2026-01-01',
                RoundStatus.Closed,
                { closedOn: '2026-02-01' },
            ),
        );
        const openRound = round(
            EVAL_PLAN,
            'Open round',
            '2026-03-01',
            RoundStatus.Open,
        );
        const result = roundReturns({
            draws: 200,
            ledger: ledger({ rounds: [...closedRounds, openRound] }),
            poolNetValuesDollars: [10, -10],
            sampleThresholds: { ...THRESHOLDS, minClosedRounds: 2 },
            seed: 1,
        });
        expect(result.perFirm[0]?.sampleLevel).toBe(SampleLevel.Adequate);
    });

    it('gives no realized multiple for a round whose ended members spent nothing', () => {
        const r = round(EVAL_PLAN, 'Round 1', '2026-01-01', RoundStatus.Open);
        const busted = account(EVAL_PLAN, { roundId: r.id });
        const result = roundReturns({
            draws: 200,
            ledger: ledger({
                accounts: [busted],
                events: [
                    event(busted, AccountEventKind.Purchased, '2026-01-01'),
                    event(busted, AccountEventKind.Busted, '2026-01-05'),
                ],
                rounds: [r],
            }),
            poolNetValuesDollars: [10, -10],
            sampleThresholds: THRESHOLDS,
            seed: 1,
        });
        expect(result.rounds[0]?.realizedMultiple).toBeNull();
    });

    it('drops a resample with no spend instead of scoring it as a zero multiple', () => {
        const r = round(EVAL_PLAN, 'Round 1', '2026-01-01', RoundStatus.Open);
        const paying = account(EVAL_PLAN, { roundId: r.id });
        const free = account(EVAL_PLAN, { roundId: r.id });
        const result = roundReturns({
            draws: 200,
            ledger: ledger({
                accounts: [paying, free],
                events: [
                    event(paying, AccountEventKind.Purchased, '2026-01-01'),
                    event(paying, AccountEventKind.Busted, '2026-01-05'),
                    event(free, AccountEventKind.Purchased, '2026-01-01'),
                    event(free, AccountEventKind.Busted, '2026-01-05'),
                ],
                fees: [
                    fee(paying, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
                ],
                payouts: [
                    payout(paying, 30_000, {
                        netCents: 30_000,
                        paidOn: '2026-01-04',
                    }),
                ],
                rounds: [r],
            }),
            poolNetValuesDollars: [10, -10],
            sampleThresholds: THRESHOLDS,
            seed: 1,
        });
        const multiple = result.rounds[0]?.realizedMultiple;
        expect(multiple?.value).toBe(3);
        expect(multiple?.interval).toEqual({ lower: 3, upper: 3 });
    });

    it('states the share of positive rounds as a sampled rate with its 95% Wilson interval', () => {
        const rounds = ['A', 'B', 'C'].map((name, index) =>
            round(
                EVAL_PLAN,
                `Round ${name}`,
                `2026-0${String(index + 1)}-01`,
                RoundStatus.Closed,
                { closedOn: `2026-0${String(index + 1)}-20` },
            ),
        );
        const members = rounds.map((r) =>
            account(EVAL_PLAN, { roundId: r.id }),
        );
        const payoutCents = [100_000, 25_000, 100_000];
        const result = roundReturns({
            draws: 200,
            ledger: ledger({
                accounts: members,
                fees: members.map((member, index) =>
                    fee(
                        member,
                        FeeKind.EvalPurchase,
                        50_000,
                        `2026-0${String(index + 1)}-01`,
                    ),
                ),
                payouts: members.map((member, index) =>
                    payout(member, payoutCents[index] ?? 0, {
                        netCents: payoutCents[index] ?? 0,
                        paidOn: `2026-0${String(index + 1)}-10`,
                    }),
                ),
                rounds,
            }),
            poolNetValuesDollars: [10, -10],
            sampleThresholds: THRESHOLDS,
            seed: 1,
        });
        const share = result.perFirm[0]?.sharePositive;
        expect(share?.n).toBe(3);
        expect(share?.value).toBeCloseTo(2 / 3, 12);
        expect(share?.interval?.lower).toBeCloseTo(0.2077, 3);
        expect(share?.interval?.upper).toBeCloseTo(0.9385, 3);
    });

    it('builds the spread, share positive and its n from closed rounds only, so open rounds neither score as zero nor widen the sample', () => {
        const closedWinner = round(
            EVAL_PLAN,
            'Closed winner',
            '2026-01-01',
            RoundStatus.Closed,
            { closedOn: '2026-02-01' },
        );
        const openRounds = ['A', 'B'].map((name, index) =>
            round(
                EVAL_PLAN,
                `Open ${name}`,
                `2026-0${String(index + 3)}-01`,
                RoundStatus.Open,
            ),
        );
        const winnerMember = account(EVAL_PLAN, { roundId: closedWinner.id });
        const openMembers = openRounds.map((r) =>
            account(EVAL_PLAN, { roundId: r.id }),
        );
        const result = roundReturns({
            draws: 200,
            ledger: ledger({
                accounts: [winnerMember, ...openMembers],
                fees: [
                    fee(winnerMember, FeeKind.EvalPurchase, 50_000, '2026-01-01'),
                    ...openMembers.map((member, index) =>
                        fee(
                            member,
                            FeeKind.EvalPurchase,
                            50_000,
                            `2026-0${String(index + 3)}-01`,
                        ),
                    ),
                ],
                payouts: [
                    payout(winnerMember, 100_000, {
                        netCents: 100_000,
                        paidOn: '2026-01-10',
                    }),
                ],
                rounds: [closedWinner, ...openRounds],
            }),
            poolNetValuesDollars: [10, -10],
            sampleThresholds: { ...THRESHOLDS, minClosedRounds: 2 },
            seed: 1,
        });
        const summary = result.perFirm[0];
        expect(summary?.rounds).toBe(3);
        expect(summary?.closedRounds).toBe(1);
        expect(summary?.min).toBe(2);
        expect(summary?.mean).toBe(2);
        expect(summary?.max).toBe(2);
        expect(summary?.sharePositive?.n).toBe(1);
        expect(summary?.sharePositive?.value).toBe(1);
        expect(summary?.sampleLevel).toBe(SampleLevel.Low);
    });

    it('has no spread while a firm has only open rounds, however much they spent', () => {
        const openRound = round(
            EVAL_PLAN,
            'Open round',
            '2026-01-01',
            RoundStatus.Open,
        );
        const member = account(EVAL_PLAN, { roundId: openRound.id });
        const result = roundReturns({
            draws: 200,
            ledger: ledger({
                accounts: [member],
                fees: [fee(member, FeeKind.EvalPurchase, 50_000, '2026-01-01')],
                rounds: [openRound],
            }),
            poolNetValuesDollars: [10, -10],
            sampleThresholds: THRESHOLDS,
            seed: 1,
        });
        const summary = result.perFirm[0];
        expect(summary?.rounds).toBe(1);
        expect(summary?.closedRounds).toBe(0);
        expect(summary?.min).toBeNull();
        expect(summary?.mean).toBeNull();
        expect(summary?.max).toBeNull();
        expect(summary?.sharePositive).toBeNull();
    });

    it('has no share of positive rounds when no round has a multiple yet', () => {
        const r = round(EVAL_PLAN, 'Round 1', '2026-01-01', RoundStatus.Open);
        const result = roundReturns({
            draws: 200,
            ledger: ledger({ rounds: [r] }),
            poolNetValuesDollars: [10, -10],
            sampleThresholds: THRESHOLDS,
            seed: 1,
        });
        expect(result.perFirm[0]?.sharePositive).toBeNull();
    });

    it('measures a closed round cycle from its first fee to its last Paid payout, and leaves it null otherwise', () => {
        const closedRound = round(
            EVAL_PLAN,
            'Closed',
            '2026-01-01',
            RoundStatus.Closed,
            { closedOn: '2026-03-01' },
        );
        const openRound = round(
            EVAL_PLAN,
            'Open',
            '2026-01-01',
            RoundStatus.Open,
        );
        const unpaidRound = round(
            EVAL_PLAN,
            'Closed unpaid',
            '2026-01-01',
            RoundStatus.Closed,
            { closedOn: '2026-03-01' },
        );
        const closedMember = account(EVAL_PLAN, { roundId: closedRound.id });
        const openMember = account(EVAL_PLAN, { roundId: openRound.id });
        const unpaidMember = account(EVAL_PLAN, { roundId: unpaidRound.id });
        const result = roundReturns({
            draws: 200,
            ledger: ledger({
                accounts: [closedMember, openMember, unpaidMember],
                fees: [
                    fee(
                        closedMember,
                        FeeKind.EvalPurchase,
                        10_000,
                        '2026-01-05',
                    ),
                    fee(
                        openMember,
                        FeeKind.EvalPurchase,
                        10_000,
                        '2026-01-05',
                    ),
                    fee(
                        unpaidMember,
                        FeeKind.EvalPurchase,
                        10_000,
                        '2026-01-05',
                    ),
                ],
                payouts: [
                    payout(closedMember, 30_000, {
                        netCents: 30_000,
                        paidOn: '2026-02-15',
                    }),
                    payout(openMember, 30_000, {
                        netCents: 30_000,
                        paidOn: '2026-02-15',
                    }),
                    payout(unpaidMember, 30_000, {
                        paidOn: null,
                        status: PayoutStatus.Requested,
                    }),
                ],
                rounds: [closedRound, openRound, unpaidRound],
            }),
            poolNetValuesDollars: [10, -10],
            sampleThresholds: THRESHOLDS,
            seed: 1,
        });
        const cycleOf = (id: string) =>
            result.rounds.find((row) => row.id === id)?.cycleDays;
        expect(cycleOf(closedRound.id)).toBe(41);
        expect(cycleOf(openRound.id)).toBeNull();
        expect(cycleOf(unpaidRound.id)).toBeNull();
    });
});
