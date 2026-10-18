import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountTracking,
    firmKeyId,
} from '~/lib/prop-accounts/core';
import {
    firmRosterOf,
    liveTransferRate,
    recordedAtLiveText,
} from '~/lib/prop-accounts/firms';

import {
    account,
    EVAL_PLAN,
    event,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    purchased,
} from '../metrics/ledgerFixtures';

const EXTERNAL_FIRM_ID = '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b';

function externalLedgerOnly(stage: AccountStage) {
    return account(EVAL_PLAN, {
        externalFirmId: EXTERNAL_FIRM_ID,
        firmId: null,
        planLabel: 'Imported',
        planSerial: null,
        stage,
        tracking: AccountTracking.LedgerOnly,
    });
}

function fixtureLedger() {
    const first = movedLive(EVAL_PLAN, '2026-01-01', '2026-03-10');
    const second = movedLive(EVAL_PLAN, '2026-01-02', '2026-03-12');
    const other = movedLive(OTHER_FIRM_EVAL_PLAN, '2026-01-03', '2026-03-14');
    const modeledLedgerOnlyLive = modeledLedgerOnly(AccountStage.Live);
    const modeledLedgerOnlyFunded = modeledLedgerOnly(AccountStage.Funded);
    const externalLive = externalLedgerOnly(AccountStage.Live);
    const externalLiveToo = externalLedgerOnly(AccountStage.Live);
    return ledger({
        accounts: [
            first.moved,
            second.moved,
            other.moved,
            modeledLedgerOnlyLive,
            modeledLedgerOnlyFunded,
            externalLive,
            externalLiveToo,
        ],
        events: [...first.events, ...second.events, ...other.events],
    });
}

function modeledLedgerOnly(stage: AccountStage) {
    return account(EVAL_PLAN, {
        planLabel: 'Imported',
        planSerial: null,
        stage,
        tracking: AccountTracking.LedgerOnly,
    });
}

function movedLive(plan: typeof EVAL_PLAN, purchasedOn: string, on: string) {
    const moved = account(plan, { purchasedOn, stage: AccountStage.Funded });
    return {
        events: [
            purchased(moved),
            event(moved, AccountEventKind.EvalPassed, purchasedOn),
            event(moved, AccountEventKind.MovedLive, on),
        ],
        moved,
    };
}

describe('the roster and the live transfer rate count moved-live accounts the same way', () => {
    it('gives every firm the same moved-live count in both, ledger-only Live accounts included', () => {
        const built = fixtureLedger();
        const roster = firmRosterOf(built).firms;
        const rates = liveTransferRate(built, '2026-04-01').perFirm;
        expect(roster.length).toBeGreaterThanOrEqual(3);
        expect(roster).toHaveLength(rates.length);
        for (const entry of roster) {
            const key = firmKeyId(entry.firmKey);
            const rate = rates.find((row) => firmKeyId(row.firmKey) === key);
            expect(rate).toBeDefined();
            expect(entry.movedLiveCount).toBe(rate?.movedLiveCount);
        }
        expect(
            roster
                .map((entry) => entry.movedLiveCount)
                .toSorted((a, b) => a - b),
        ).toStrictEqual([1, 2, 3]);
    });

    it('keeps the last moved-live date on the MovedLive transitions only', () => {
        const roster = firmRosterOf(fixtureLedger()).firms;
        const dates = roster.map((entry) => entry.lastMovedLiveOn);
        expect(dates.filter((on) => on === null)).toHaveLength(1);
        expect(dates).toContain('2026-03-12');
        expect(dates).toContain('2026-03-14');
    });
});

describe('the roster carries the count of accounts recorded straight at Live (QF-7)', () => {
    it('counts the ledger-only Live accounts of each firm, and no moved or ledger-only non-Live account', () => {
        const roster = firmRosterOf(fixtureLedger()).firms;
        expect(
            roster
                .map((entry) => entry.recordedAtLiveCount)
                .toSorted((a, b) => a - b),
        ).toStrictEqual([0, 1, 2]);
        for (const entry of roster) {
            expect(entry.recordedAtLiveCount).toBeLessThanOrEqual(
                entry.movedLiveCount,
            );
        }
    });

    it('words the disclosure once for the Firms page and the rulebook', () => {
        expect(recordedAtLiveText(1)).toBe(
            'includes 1 account recorded straight at Live',
        );
        expect(recordedAtLiveText(2)).toBe(
            'includes 2 accounts recorded straight at Live',
        );
    });
});
