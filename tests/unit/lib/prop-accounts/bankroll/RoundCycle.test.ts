import { describe, expect, it } from 'vitest';

import { roundCycle } from '~/lib/prop-accounts/bankroll';
import { roundCycleDaysOf } from '~/lib/prop-accounts/bankroll/RoundCycle';
import { FeeKind, RoundStatus, SampleLevel } from '~/lib/prop-accounts/core';

import {
    account,
    EVAL_PLAN,
    fee,
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

describe('roundCycle', () => {
    it('measures cycle days from the first fee to the last attributed payout', () => {
        const r = round(
            EVAL_PLAN,
            'Round 1',
            '2026-01-01',
            RoundStatus.Closed,
            {
                closedOn: '2026-03-01',
            },
        );
        const acc = account(EVAL_PLAN, { roundId: r.id });
        const fees = [
            fee(acc, FeeKind.EvalPurchase, 10_000, '2026-01-05'),
            fee(acc, FeeKind.Rebuy, 10_000, '2026-01-20'),
        ];
        const payouts = [
            payout(acc, 20_000, { netCents: 20_000, paidOn: '2026-02-01' }),
            payout(acc, 30_000, { netCents: 30_000, paidOn: '2026-02-15' }),
        ];
        const result = roundCycle(
            ledger({ accounts: [acc], fees, payouts, rounds: [r] }),
            THRESHOLDS,
        );
        expect(result.cycleDays?.value).toBe(41);
        expect(result.cycleDays?.n).toBe(1);
    });

    it('computes days to 50% and 90% of cumulative payout dollars', () => {
        const r = round(
            EVAL_PLAN,
            'Round 1',
            '2026-01-01',
            RoundStatus.Closed,
            {
                closedOn: '2026-03-01',
            },
        );
        const acc = account(EVAL_PLAN, { roundId: r.id });
        const fees = [fee(acc, FeeKind.EvalPurchase, 10_000, '2026-01-01')];
        const payouts = [
            payout(acc, 50_000, { netCents: 50_000, paidOn: '2026-01-11' }),
            payout(acc, 50_000, { netCents: 50_000, paidOn: '2026-01-21' }),
        ];
        const result = roundCycle(
            ledger({ accounts: [acc], fees, payouts, rounds: [r] }),
            THRESHOLDS,
        );
        expect(result.daysTo50Percent?.value).toBe(10);
        expect(result.daysTo90Percent?.value).toBe(20);
    });

    it('excludes open rounds and rounds with no payouts yet', () => {
        const openRound = round(
            EVAL_PLAN,
            'Open round',
            '2026-01-01',
            RoundStatus.Open,
        );
        const closedNoPayouts = round(
            EVAL_PLAN,
            'Closed, no payouts',
            '2026-01-01',
            RoundStatus.Closed,
            { closedOn: '2026-02-01' },
        );
        const accOpen = account(EVAL_PLAN, { roundId: openRound.id });
        const accClosed = account(EVAL_PLAN, { roundId: closedNoPayouts.id });
        const result = roundCycle(
            ledger({
                accounts: [accOpen, accClosed],
                fees: [
                    fee(accOpen, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
                    fee(accClosed, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
                ],
                rounds: [openRound, closedNoPayouts],
            }),
            THRESHOLDS,
        );
        expect(result.cycleDays).toBeNull();
        expect(result.sampleLevel).toBeNull();
    });

    it('is null threshold level when no minimum is set even with samples', () => {
        const r = round(
            EVAL_PLAN,
            'Round 1',
            '2026-01-01',
            RoundStatus.Closed,
            {
                closedOn: '2026-03-01',
            },
        );
        const acc = account(EVAL_PLAN, { roundId: r.id });
        const result = roundCycle(
            ledger({
                accounts: [acc],
                fees: [fee(acc, FeeKind.EvalPurchase, 10_000, '2026-01-01')],
                payouts: [
                    payout(acc, 10_000, {
                        netCents: 10_000,
                        paidOn: '2026-01-05',
                    }),
                ],
                rounds: [r],
            }),
            THRESHOLDS,
        );
        expect(result.sampleLevel).toBeNull();
    });

    it('is adequate once the closed-round minimum is met', () => {
        const rounds = Array.from({ length: 3 }, (_, index) =>
            round(
                EVAL_PLAN,
                `Round ${index}`,
                '2026-01-01',
                RoundStatus.Closed,
                {
                    closedOn: '2026-03-01',
                },
            ),
        );
        const accounts = rounds.map((r) =>
            account(EVAL_PLAN, { roundId: r.id }),
        );
        const fees = accounts.map((acc) =>
            fee(acc, FeeKind.EvalPurchase, 10_000, '2026-01-01'),
        );
        const payouts = accounts.map((acc) =>
            payout(acc, 10_000, { netCents: 10_000, paidOn: '2026-01-05' }),
        );
        const result = roundCycle(ledger({ accounts, fees, payouts, rounds }), {
            ...THRESHOLDS,
            minClosedRounds: 3,
        });
        expect(result.sampleLevel).toBe(SampleLevel.Adequate);
    });

    it('measures one closed round by its own id, matching the pooled mean for a single round', () => {
        const r = round(
            EVAL_PLAN,
            'Round 1',
            '2026-01-01',
            RoundStatus.Closed,
            { closedOn: '2026-03-01' },
        );
        const acc = account(EVAL_PLAN, { roundId: r.id });
        const built = ledger({
            accounts: [acc],
            fees: [fee(acc, FeeKind.EvalPurchase, 10_000, '2026-01-05')],
            payouts: [
                payout(acc, 30_000, {
                    netCents: 30_000,
                    paidOn: '2026-02-15',
                }),
            ],
            rounds: [r],
        });
        expect(roundCycleDaysOf(built, r)).toBe(41);
        expect(roundCycleDaysOf(built, r)).toBe(
            roundCycle(built, THRESHOLDS).cycleDays?.value,
        );
    });

    it('has no cycle for an open round even when a payout was already paid', () => {
        const r = round(EVAL_PLAN, 'Open', '2026-01-01', RoundStatus.Open);
        const acc = account(EVAL_PLAN, { roundId: r.id });
        const built = ledger({
            accounts: [acc],
            fees: [fee(acc, FeeKind.EvalPurchase, 10_000, '2026-01-05')],
            payouts: [
                payout(acc, 30_000, {
                    netCents: 30_000,
                    paidOn: '2026-02-15',
                }),
            ],
            rounds: [r],
        });
        expect(roundCycleDaysOf(built, r)).toBeNull();
    });
});
