import { describe, expect, it } from 'vitest';

import { AccountEventKind } from '~/lib/prop-accounts/core';
import { attemptsOf } from '~/lib/prop-accounts/metrics';

import {
    account,
    EVAL_PLAN,
    event,
    INSTANT_PLAN,
    ledger,
    purchased,
} from './ledgerFixtures';

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
