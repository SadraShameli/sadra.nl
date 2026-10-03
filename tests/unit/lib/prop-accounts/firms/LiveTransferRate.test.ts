import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountTracking,
    compareText,
    firmKeyId,
    FirmKeyKind,
} from '~/lib/prop-accounts/core';
import {
    firmRosterOf,
    liveTransferRate,
    LiveTransferRateUnavailable,
    liveTransferUnavailableText,
    movedLiveCountOf,
} from '~/lib/prop-accounts/firms';

import {
    account,
    EVAL_PLAN,
    event,
    ledger,
    payout,
    purchased,
} from '../metrics/ledgerFixtures';

const EXTERNAL_FIRM_ID = '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b';

function movedLiveAccount(purchasedOn: string, movedOn: string) {
    const moved = account(EVAL_PLAN, {
        purchasedOn,
        stage: AccountStage.Funded,
    });
    return {
        events: [
            purchased(moved),
            event(moved, AccountEventKind.EvalPassed, purchasedOn),
            event(moved, AccountEventKind.MovedLive, movedOn),
        ],
        moved,
    };
}

describe('liveTransferRate', () => {
    it('gives moved-live events per paid payout and per funded account-month, with n and a Wilson interval', () => {
        const moved = account(EVAL_PLAN, {
            purchasedOn: '2026-01-01',
            stage: AccountStage.Funded,
        });
        const stillFunded = account(EVAL_PLAN, {
            purchasedOn: '2026-02-01',
            stage: AccountStage.Funded,
        });
        const result = liveTransferRate(
            ledger({
                accounts: [moved, stillFunded],
                events: [
                    purchased(moved),
                    event(moved, AccountEventKind.EvalPassed, '2026-01-05'),
                    event(moved, AccountEventKind.MovedLive, '2026-03-10'),
                    purchased(stillFunded),
                    event(
                        stillFunded,
                        AccountEventKind.EvalPassed,
                        '2026-02-05',
                    ),
                ],
                payouts: [
                    payout(moved, 5000, { paidOn: '2026-02-01' }),
                    payout(moved, 5000, { paidOn: '2026-02-20' }),
                ],
            }),
            '2026-04-01',
        );
        const firm = result.perFirm.find(
            (row) => row.firmKey.kind === FirmKeyKind.Modeled,
        );
        expect(firm?.movedLiveCount).toBe(1);
        expect(firm?.perPaidPayout).toMatchObject({ n: 2, value: 0.5 });
        expect(firm?.perFundedAccountMonth?.n).toBe(6);
        expect(firm?.perFundedAccountMonth?.value).toBeCloseTo(1 / 6, 6);
        expect(firm?.perFundedAccountMonth?.interval).not.toBeNull();
    });

    it('gives a null rate with no paid payouts or no funded months', () => {
        const neverFunded = account(EVAL_PLAN);
        const result = liveTransferRate(
            ledger({
                accounts: [neverFunded],
                events: [purchased(neverFunded)],
            }),
            '2026-04-01',
        );
        const firm = result.perFirm.find(
            (row) => row.firmKey.kind === FirmKeyKind.Modeled,
        );
        expect(firm?.perPaidPayout).toBeNull();
        expect(firm?.perFundedAccountMonth).toBeNull();
        expect(firm?.movedLiveCount).toBe(0);
    });

    it('gives a null rate with a typed reason instead of throwing when more accounts moved live than paid payouts exist', () => {
        const first = movedLiveAccount('2026-01-01', '2026-03-10');
        const second = movedLiveAccount('2026-01-02', '2026-03-12');
        const built = ledger({
            accounts: [first.moved, second.moved],
            events: [...first.events, ...second.events],
            payouts: [payout(first.moved, 5000, { paidOn: '2026-02-01' })],
        });
        expect(() => liveTransferRate(built, '2026-04-01')).not.toThrow();
        const [firm] = liveTransferRate(built, '2026-04-01').perFirm;
        expect(firm?.movedLiveCount).toBe(2);
        expect(firm?.paidPayoutCount).toBe(1);
        expect(firm?.perPaidPayout).toBeNull();
        expect(firm?.perPaidPayoutUnavailable).toBe(
            LiveTransferRateUnavailable.MoreTransfersThanPayouts,
        );
        expect(firm?.perFundedAccountMonth).toMatchObject({ n: 6 });
        expect(firm?.perFundedAccountMonth?.value).toBeCloseTo(2 / 6, 6);
        expect(firm?.perFundedAccountMonthUnavailable).toBeNull();
    });

    it('names no paid payouts and no funded months as the reasons for a null rate, and no reason for a rate', () => {
        const neverFunded = account(EVAL_PLAN);
        const never = liveTransferRate(
            ledger({
                accounts: [neverFunded],
                events: [purchased(neverFunded)],
            }),
            '2026-04-01',
        ).perFirm[0];
        expect(never?.perPaidPayoutUnavailable).toBe(
            LiveTransferRateUnavailable.NoPaidPayouts,
        );
        expect(never?.perFundedAccountMonthUnavailable).toBe(
            LiveTransferRateUnavailable.NoFundedMonths,
        );
        expect(never?.paidPayoutCount).toBe(0);
        expect(never?.fundedAccountMonths).toBe(0);

        const funded = movedLiveAccount('2026-01-01', '2026-03-10');
        const measured = liveTransferRate(
            ledger({
                accounts: [funded.moved],
                events: funded.events,
                payouts: [payout(funded.moved, 5000, { paidOn: '2026-02-01' })],
            }),
            '2026-04-01',
        ).perFirm[0];
        expect(measured?.perPaidPayoutUnavailable).toBeNull();
        expect(measured?.perFundedAccountMonthUnavailable).toBeNull();
        expect(measured?.paidPayoutCount).toBe(1);
        expect(measured?.fundedAccountMonths).toBe(3);
    });

    it('gives a firm with only a ledger-only account that is Live a row, counting it as moved live with no funded-month rate', () => {
        const liveOnly = account(EVAL_PLAN, {
            externalFirmId: EXTERNAL_FIRM_ID,
            firmId: null,
            planLabel: 'Hola Prime 100K',
            planSerial: null,
            stage: AccountStage.Live,
            tracking: AccountTracking.LedgerOnly,
        });
        const built = ledger({ accounts: [liveOnly] });
        const result = liveTransferRate(built, '2026-04-01');
        const key = firmKeyId({
            externalFirmId: EXTERNAL_FIRM_ID,
            kind: FirmKeyKind.External,
        });
        const firm = result.perFirm.find(
            (row) => firmKeyId(row.firmKey) === key,
        );
        expect(firm?.movedLiveCount).toBe(1);
        expect(firm?.perFundedAccountMonth).toBeNull();
        expect(firm?.perFundedAccountMonthUnavailable).toBe(
            LiveTransferRateUnavailable.NoFundedMonths,
        );
        expect(firm?.perPaidPayoutUnavailable).toBe(
            LiveTransferRateUnavailable.NoPaidPayouts,
        );
    });

    it('does not count a ledger-only transfer in a funded-month rate that has no exposure for it, and a ledger-only account that is not Live is not a transfer', () => {
        const modeled = movedLiveAccount('2026-01-01', '2026-03-10');
        const stillFunded = account(EVAL_PLAN, {
            purchasedOn: '2026-01-01',
            stage: AccountStage.Funded,
        });
        const liveOnly = account(EVAL_PLAN, {
            planLabel: 'Rapid 150K',
            planSerial: null,
            stage: AccountStage.Live,
            tracking: AccountTracking.LedgerOnly,
        });
        const fundedOnly = account(EVAL_PLAN, {
            planLabel: 'Rapid 150K',
            planSerial: null,
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const built = ledger({
            accounts: [modeled.moved, stillFunded, liveOnly, fundedOnly],
            events: [
                ...modeled.events,
                purchased(stillFunded),
                event(stillFunded, AccountEventKind.EvalPassed, '2026-01-01'),
            ],
            payouts: [
                payout(modeled.moved, 5000, { paidOn: '2026-02-01' }),
                payout(liveOnly, 5000, { paidOn: '2026-02-02' }),
            ],
        });
        const [firm] = liveTransferRate(built, '2026-04-01').perFirm;
        expect(firm?.movedLiveCount).toBe(2);
        expect(firm?.perPaidPayout).toMatchObject({ n: 2, value: 1 });
        expect(firm?.fundedAccountMonths).toBe(7);
        expect(firm?.perFundedAccountMonth).toMatchObject({ n: 7 });
        expect(firm?.perFundedAccountMonth?.value).toBeCloseTo(1 / 7, 6);
    });

    it('gives every firm the roster lists a row, including an unresolvable modeled account', () => {
        const unresolved = account(EVAL_PLAN, { planSerial: 'no-such-plan' });
        const external = account(EVAL_PLAN, {
            externalFirmId: EXTERNAL_FIRM_ID,
            firmId: null,
            planLabel: 'Hola Prime 100K',
            planSerial: null,
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const built = ledger({
            accounts: [unresolved, external],
            payouts: [payout(unresolved, 5000, { paidOn: '2026-02-01' })],
        });
        const rows = liveTransferRate(built, '2026-04-01').perFirm.map((row) =>
            firmKeyId(row.firmKey),
        );
        const roster = firmRosterOf(built).firms.map((entry) =>
            firmKeyId(entry.firmKey),
        );
        expect(roster).toHaveLength(2);
        expect(rows.toSorted(compareText)).toStrictEqual(
            roster.toSorted(compareText),
        );
    });

    it('describes each reason in plain words with the counts that caused it', () => {
        const first = movedLiveAccount('2026-01-01', '2026-03-10');
        const second = movedLiveAccount('2026-01-02', '2026-03-12');
        const [firm] = liveTransferRate(
            ledger({
                accounts: [first.moved, second.moved],
                events: [...first.events, ...second.events],
                payouts: [payout(first.moved, 5000, { paidOn: '2026-02-01' })],
            }),
            '2026-04-01',
        ).perFirm;
        if (firm === undefined) throw new Error('no firm row');
        expect(
            liveTransferUnavailableText(
                LiveTransferRateUnavailable.MoreTransfersThanPayouts,
                firm,
            ),
        ).toBe('2 transfers against 1 paid payout');
        expect(
            liveTransferUnavailableText(
                LiveTransferRateUnavailable.NoPaidPayouts,
                firm,
            ),
        ).toBe('no paid payouts yet');
        expect(
            liveTransferUnavailableText(
                LiveTransferRateUnavailable.NoFundedMonths,
                firm,
            ),
        ).toBe('no funded account-months yet');
        expect(
            liveTransferUnavailableText(
                LiveTransferRateUnavailable.MoreTransfersThanPayouts,
                { ...firm, movedLiveCount: 1, paidPayoutCount: 0 },
            ),
        ).toBe('1 transfer against 0 paid payouts');
        expect(
            liveTransferUnavailableText(
                LiveTransferRateUnavailable.MoreTransfersThanFundedMonths,
                { ...firm, fundedAccountMonths: 1, movedLiveCount: 2 },
            ),
        ).toBe('2 transfers against 1 funded account-month');
    });

    it('is empty for an empty ledger', () => {
        expect(liveTransferRate(ledger({}), '2026-04-01').perFirm).toEqual([]);
    });
});

describe('movedLiveCountOf', () => {
    it('counts MovedLive transitions of a modeled account and one transfer for a ledger-only account whose stage is Live', () => {
        const { events, moved } = movedLiveAccount('2026-01-01', '2026-03-10');
        const liveOnly = account(EVAL_PLAN, {
            planLabel: 'Imported live',
            planSerial: null,
            stage: AccountStage.Live,
            tracking: AccountTracking.LedgerOnly,
        });
        const fundedOnly = account(EVAL_PLAN, {
            planLabel: 'Imported funded',
            planSerial: null,
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const built = ledger({
            accounts: [moved, liveOnly, fundedOnly],
            events,
        });
        const counts = built.accounts.map((entry) => movedLiveCountOf(entry));
        expect(counts).toStrictEqual([1, 1, 0]);
    });

    it('agrees with the roster moved-live count and the transfer-rate count for a modeled firm', () => {
        const { events, moved } = movedLiveAccount('2026-01-01', '2026-03-10');
        const built = ledger({ accounts: [moved], events });
        const [rosterRow] = firmRosterOf(built).firms;
        const [rateRow] = liveTransferRate(built, '2026-04-01').perFirm;
        expect(
            built.accounts.map((entry) => movedLiveCountOf(entry)),
        ).toStrictEqual([1]);
        expect(rosterRow?.movedLiveCount).toBe(1);
        expect(rateRow?.movedLiveCount).toBe(1);
    });
});
