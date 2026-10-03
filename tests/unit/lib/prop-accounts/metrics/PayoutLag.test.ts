import { describe, expect, it } from 'vitest';

import {
    AccountStage,
    AccountTracking,
    firmKeyId,
    FirmKeyKind,
} from '~/lib/prop-accounts/core';
import { payoutLag } from '~/lib/prop-accounts/metrics';
import { meanStandardError } from '~/lib/prop-calculator/stats';

import {
    account,
    EVAL_PLAN,
    ledger,
    meanInterval,
    payout,
    purchased,
} from './ledgerFixtures';

describe('payoutLag', () => {
    it('gives request-to-approval and request-to-paid days per firm, with n and the mean SE', () => {
        const owner = account(EVAL_PLAN);
        const result = payoutLag(
            ledger({
                accounts: [owner],
                events: [purchased(owner)],
                payouts: [
                    payout(owner, 40_000, {
                        approvedOn: '2026-09-12',
                        paidOn: '2026-09-20',
                        requestedOn: '2026-09-10',
                    }),
                    payout(owner, 40_000, {
                        approvedOn: '2026-09-22',
                        paidOn: '2026-09-30',
                        requestedOn: '2026-09-20',
                    }),
                ],
            }),
        );
        const firm = result.perFirm.find(
            (row) => row.firmKey.kind === FirmKeyKind.Modeled,
        );
        const approvalSe = meanStandardError(4, 8, 2);
        const paidSe = meanStandardError(20, 200, 2);
        expect(firm?.requestToApproval).toEqual({
            interval: meanInterval(2, approvalSe, 2),
            n: 2,
            standardError: approvalSe,
            value: 2,
        });
        expect(firm?.requestToPaid).toEqual({
            interval: meanInterval(10, paidSe, 2),
            n: 2,
            standardError: paidSe,
            value: 10,
        });
    });

    it('leaves out payouts with no approval date or no paid date from that measure', () => {
        const owner = account(EVAL_PLAN);
        const result = payoutLag(
            ledger({
                accounts: [owner],
                events: [purchased(owner)],
                payouts: [
                    payout(owner, 40_000, {
                        approvedOn: null,
                        paidOn: '2026-09-20',
                        requestedOn: '2026-09-10',
                    }),
                ],
            }),
        );
        const firm = result.perFirm[0];
        expect(firm?.requestToApproval).toBeNull();
        expect(firm?.requestToPaid).toEqual({
            interval: null,
            n: 1,
            standardError: null,
            value: 10,
        });
    });

    it('is empty for an empty ledger', () => {
        expect(payoutLag(ledger({})).perFirm).toEqual([]);
    });

    it('counts a ledger-only account payout under its firm key', () => {
        const external = account(EVAL_PLAN, {
            externalFirmId: '0b8c7f0e-6f3a-4f55-9a3e-8f4c1d2e3a4b',
            firmId: null,
            planLabel: 'Hola Prime 100K',
            planSerial: null,
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const atModeledFirm = account(EVAL_PLAN, {
            planLabel: 'Rapid 150K',
            planSerial: null,
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const result = payoutLag(
            ledger({
                accounts: [external, atModeledFirm],
                payouts: [
                    payout(external, 40_000, {
                        approvedOn: '2026-09-12',
                        paidOn: '2026-09-20',
                        requestedOn: '2026-09-10',
                    }),
                    payout(atModeledFirm, 40_000, {
                        approvedOn: '2026-09-14',
                        paidOn: '2026-09-18',
                        requestedOn: '2026-09-10',
                    }),
                ],
            }),
        );
        expect(result.perFirm).toHaveLength(2);
        const externalRow = result.perFirm.find(
            (row) => row.firmKey.kind === FirmKeyKind.External,
        );
        expect(externalRow?.requestToApproval).toMatchObject({
            n: 1,
            value: 2,
        });
        expect(externalRow?.requestToPaid).toMatchObject({ n: 1, value: 10 });
        const modeledRow = result.perFirm.find(
            (row) =>
                firmKeyId(row.firmKey) ===
                firmKeyId({
                    firmId: EVAL_PLAN.firm.id,
                    kind: FirmKeyKind.Modeled,
                }),
        );
        expect(modeledRow?.requestToApproval).toMatchObject({ n: 1, value: 4 });
        expect(modeledRow?.requestToPaid).toMatchObject({ n: 1, value: 8 });
    });

    it('pools a ledger-only and a modeled payout of the same firm', () => {
        const modeled = account(EVAL_PLAN);
        const atSameFirm = account(EVAL_PLAN, {
            planLabel: 'Rapid 150K',
            planSerial: null,
            stage: AccountStage.Funded,
            tracking: AccountTracking.LedgerOnly,
        });
        const [row] = payoutLag(
            ledger({
                accounts: [modeled, atSameFirm],
                events: [purchased(modeled)],
                payouts: [
                    payout(modeled, 40_000, {
                        paidOn: '2026-09-20',
                        requestedOn: '2026-09-10',
                    }),
                    payout(atSameFirm, 40_000, {
                        paidOn: '2026-09-14',
                        requestedOn: '2026-09-10',
                    }),
                ],
            }),
        ).perFirm;
        expect(row?.requestToPaid).toMatchObject({ n: 2, value: 7 });
    });
});
