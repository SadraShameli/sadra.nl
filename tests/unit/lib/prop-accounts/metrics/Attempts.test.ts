import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountTracking,
    PayoutStatus,
} from '~/lib/prop-accounts/core';
import { attemptsOf, isFundedAccount } from '~/lib/prop-accounts/metrics';

import {
    account,
    EVAL_PLAN,
    event,
    INSTANT_PLAN,
    ledger,
    payout,
    purchased,
} from './ledgerFixtures';

function ledgerOnly(stage: AccountStage) {
    return account(EVAL_PLAN, {
        planLabel: 'Rapid 150K',
        planSerial: null,
        stage,
        tracking: AccountTracking.LedgerOnly,
    });
}

describe('attemptsOf', () => {
    it('counts a funded instant account as one attempt', () => {
        const funded = account(INSTANT_PLAN);
        const portfolio = ledger({
            accounts: [funded],
            events: [purchased(funded)],
        });
        const entry = portfolio.accounts.find((a) => a.row.id === funded.id);
        expect(entry && attemptsOf(entry)).toBe(1);
    });

    it('counts an account whose plan does not resolve as zero attempts', () => {
        const lost = account(EVAL_PLAN, { planSerial: 'retired-plan' });
        const portfolio = ledger({ accounts: [lost] });
        const entry = portfolio.accounts.find((a) => a.row.id === lost.id);
        expect(entry && attemptsOf(entry)).toBe(0);
    });

    it('sums the decided passes and fails on an eval plan, open attempts excluded', () => {
        const twoFails = account(EVAL_PLAN);
        const portfolio = ledger({
            accounts: [twoFails],
            events: [
                purchased(twoFails),
                event(twoFails, AccountEventKind.Busted, '2026-09-05'),
                event(twoFails, AccountEventKind.Reopened, '2026-09-06'),
                event(twoFails, AccountEventKind.Busted, '2026-09-10'),
                event(twoFails, AccountEventKind.Reopened, '2026-09-11'),
            ],
        });
        const entry = portfolio.accounts.find((a) => a.row.id === twoFails.id);
        expect(entry && attemptsOf(entry)).toBe(2);
    });
});

describe('attemptsOf for a ledger-only account', () => {
    it('counts one attempt whatever its stage', () => {
        const stages = [
            AccountStage.Eval,
            AccountStage.Funded,
            AccountStage.Live,
        ];
        const rows = stages.map((stage) => ledgerOnly(stage));
        const portfolio = ledger({ accounts: rows });
        expect(portfolio.accounts.map((entry) => attemptsOf(entry))).toEqual([
            1, 1, 1,
        ]);
    });
});

describe('isFundedAccount', () => {
    it('follows the funded date for a modeled account', () => {
        const passed = account(EVAL_PLAN, { stage: AccountStage.Funded });
        const open = account(EVAL_PLAN);
        const portfolio = ledger({
            accounts: [passed, open],
            events: [
                purchased(passed),
                event(passed, AccountEventKind.EvalPassed, '2026-09-10'),
                purchased(open),
            ],
        });
        expect(
            portfolio.accounts.map((entry) => isFundedAccount(entry)),
        ).toEqual([true, false]);
    });

    it('reads a ledger-only account from its stage or a paid payout', () => {
        const funded = ledgerOnly(AccountStage.Funded);
        const live = ledgerOnly(AccountStage.Live);
        const evalWithPayout = ledgerOnly(AccountStage.Eval);
        const evalPlain = ledgerOnly(AccountStage.Eval);
        const portfolio = ledger({
            accounts: [funded, live, evalWithPayout, evalPlain],
            payouts: [payout(evalWithPayout, 10_000, { netCents: 9000 })],
        });
        expect(
            portfolio.accounts.map((entry) => isFundedAccount(entry)),
        ).toEqual([true, true, true, false]);
    });

    it('does not count an unpaid payout row as funding an eval ledger-only account', () => {
        const pending = ledgerOnly(AccountStage.Eval);
        const portfolio = ledger({
            accounts: [pending],
            payouts: [
                payout(pending, 10_000, {
                    paidOn: null,
                    status: PayoutStatus.Requested,
                }),
            ],
        });
        const [entry] = portfolio.accounts;
        expect(entry && isFundedAccount(entry)).toBe(false);
    });

    it('does not count an unresolvable modeled account as funded', () => {
        const lost = account(EVAL_PLAN, { planSerial: 'retired-plan' });
        const portfolio = ledger({ accounts: [lost] });
        const [entry] = portfolio.accounts;
        expect(entry && isFundedAccount(entry)).toBe(false);
    });
});
