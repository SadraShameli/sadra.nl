import { describe, expect, it } from 'vitest';

import {
    AccountTracking,
    FeeKind,
    PayoutStatus,
    ReportedPayoutBasis,
} from '~/lib/prop-accounts/core';
import { firmColumnsOf, firmReconciliation } from '~/lib/prop-accounts/metrics';

import {
    account,
    EVAL_PLAN,
    fee,
    firmStatement,
    ledger,
    OTHER_USER_ID,
    payout,
    purchased,
} from './ledgerFixtures';

describe('firmReconciliation', () => {
    it('is empty with no statements', () => {
        expect(firmReconciliation(ledger({}))).toEqual([]);
    });

    it('matches the ledger paid total on the net basis within tolerance', () => {
        const acc = account(EVAL_PLAN, {
            externalFirmId: 'lucid-1',
            firmId: null,
            planLabel: 'External plan',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const paid = payout(acc, 100_000, {
            netCents: 80_000,
            paidOn: '2026-09-10',
        });
        const statement = firmStatement(
            'lucid-1',
            '2026-09-15',
            ReportedPayoutBasis.Net,
            80_050,
        );
        const result = firmReconciliation(
            ledger({
                accounts: [acc],
                events: [purchased(acc)],
                firmStatements: [statement],
                payouts: [paid],
            }),
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            asOf: '2026-09-15',
            differenceCents: 50,
            withinTolerance: true,
        });
    });

    it('flags a difference beyond the shared tolerance', () => {
        const acc = account(EVAL_PLAN, {
            externalFirmId: 'lucid-1',
            firmId: null,
            planLabel: 'External plan',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const paid = payout(acc, 100_000, {
            netCents: 80_000,
            paidOn: '2026-09-10',
        });
        const statement = firmStatement(
            'lucid-1',
            '2026-09-15',
            ReportedPayoutBasis.Net,
            80_500,
        );
        const result = firmReconciliation(
            ledger({
                accounts: [acc],
                events: [purchased(acc)],
                firmStatements: [statement],
                payouts: [paid],
            }),
        );
        expect(result[0]?.differenceCents).toBe(500);
        expect(result[0]?.withinTolerance).toBe(false);
    });

    it('sums the gross basis instead of net when the statement is gross', () => {
        const acc = account(EVAL_PLAN, {
            externalFirmId: 'lucid-1',
            firmId: null,
            planLabel: 'External plan',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const paid = payout(acc, 100_000, {
            netCents: 80_000,
            paidOn: '2026-09-10',
        });
        const statement = firmStatement(
            'lucid-1',
            '2026-09-15',
            ReportedPayoutBasis.Gross,
            100_000,
        );
        const result = firmReconciliation(
            ledger({
                accounts: [acc],
                events: [purchased(acc)],
                firmStatements: [statement],
                payouts: [paid],
            }),
        );
        expect(result[0]?.differenceCents).toBe(0);
    });

    it('excludes payouts paid after the statement date', () => {
        const acc = account(EVAL_PLAN, {
            externalFirmId: 'lucid-1',
            firmId: null,
            planLabel: 'External plan',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const early = payout(acc, 50_000, {
            netCents: 50_000,
            paidOn: '2026-09-05',
        });
        const late = payout(acc, 50_000, {
            netCents: 50_000,
            paidOn: '2026-09-20',
        });
        const statement = firmStatement(
            'lucid-1',
            '2026-09-15',
            ReportedPayoutBasis.Net,
            50_000,
        );
        const result = firmReconciliation(
            ledger({
                accounts: [acc],
                events: [purchased(acc)],
                firmStatements: [statement],
                payouts: [early, late],
            }),
        );
        expect(result[0]?.differenceCents).toBe(0);
    });

    it('marks the disclosure count when a payout has no recorded net figure', () => {
        const acc = account(EVAL_PLAN, {
            externalFirmId: 'lucid-1',
            firmId: null,
            planLabel: 'External plan',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const paid = payout(acc, 80_000, {
            netCents: null,
            paidOn: '2026-09-10',
        });
        const statement = firmStatement(
            'lucid-1',
            '2026-09-15',
            ReportedPayoutBasis.Net,
            80_000,
        );
        const result = firmReconciliation(
            ledger({
                accounts: [acc],
                events: [purchased(acc)],
                firmStatements: [statement],
                payouts: [paid],
            }),
        );
        expect(result[0]?.grossOnlyCount).toBe(1);
    });

    it('computes the change and decrease from the previous statement', () => {
        const acc = account(EVAL_PLAN, {
            externalFirmId: 'lucid-1',
            firmId: null,
            planLabel: 'External plan',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const first = firmStatement(
            'lucid-1',
            '2026-09-10',
            ReportedPayoutBasis.Net,
            80_000,
        );
        const second = firmStatement(
            'lucid-1',
            '2026-09-20',
            ReportedPayoutBasis.Net,
            75_000,
        );
        const result = firmReconciliation(
            ledger({
                accounts: [acc],
                events: [purchased(acc)],
                firmStatements: [first, second],
            }),
        );
        expect(result[0]?.changeFromPreviousCents).toBeNull();
        expect(result[0]?.decreasedFromPrevious).toBe(false);
        expect(result[1]?.changeFromPreviousCents).toBe(-5000);
        expect(result[1]?.decreasedFromPrevious).toBe(true);
    });

    it('compares a statement only with the previous statement of the same basis', () => {
        const acc = account(EVAL_PLAN, {
            externalFirmId: 'lucid-1',
            firmId: null,
            planLabel: 'External plan',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const gross = firmStatement(
            'lucid-1',
            '2026-09-10',
            ReportedPayoutBasis.Gross,
            1_000_000,
        );
        const net = firmStatement(
            'lucid-1',
            '2026-09-20',
            ReportedPayoutBasis.Net,
            900_000,
        );
        const result = firmReconciliation(
            ledger({
                accounts: [acc],
                events: [purchased(acc)],
                firmStatements: [gross, net],
            }),
        );
        expect(result[1]?.changeFromPreviousCents).toBeNull();
        expect(result[1]?.decreasedFromPrevious).toBe(false);
    });

    it('still flags a decrease between two statements of the same basis around a statement of the other basis', () => {
        const acc = account(EVAL_PLAN, {
            externalFirmId: 'lucid-1',
            firmId: null,
            planLabel: 'External plan',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const result = firmReconciliation(
            ledger({
                accounts: [acc],
                events: [purchased(acc)],
                firmStatements: [
                    firmStatement(
                        'lucid-1',
                        '2026-09-10',
                        ReportedPayoutBasis.Net,
                        900_000,
                    ),
                    firmStatement(
                        'lucid-1',
                        '2026-09-15',
                        ReportedPayoutBasis.Gross,
                        2_000_000,
                    ),
                    firmStatement(
                        'lucid-1',
                        '2026-09-20',
                        ReportedPayoutBasis.Net,
                        800_000,
                    ),
                ],
            }),
        );
        expect(result.map((entry) => entry.decreasedFromPrevious)).toEqual([
            false,
            false,
            true,
        ]);
        expect(result[2]?.changeFromPreviousCents).toBe(-100_000);
    });

    it('scopes statements and payouts to the ledger owner', () => {
        const acc = account(EVAL_PLAN, {
            externalFirmId: 'lucid-1',
            firmId: null,
            planLabel: 'External plan',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const statement = firmStatement(
            'lucid-1',
            '2026-09-15',
            ReportedPayoutBasis.Net,
            1,
            { userId: OTHER_USER_ID },
        );
        const result = firmReconciliation(
            ledger({
                accounts: [acc],
                events: [purchased(acc)],
                firmStatements: [statement],
            }),
        );
        expect(result).toEqual([]);
    });

    it('does not confuse two different external firms', () => {
        const accA = account(EVAL_PLAN, {
            externalFirmId: 'lucid-1',
            firmId: null,
            planLabel: 'External plan',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const accB = account(EVAL_PLAN, {
            externalFirmId: 'lucid-2',
            firmId: null,
            planLabel: 'External plan',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const paidA = payout(accA, 10_000, {
            netCents: 10_000,
            paidOn: '2026-09-10',
        });
        const paidB = payout(accB, 20_000, {
            netCents: 20_000,
            paidOn: '2026-09-10',
        });
        const statement = firmStatement(
            'lucid-1',
            '2026-09-15',
            ReportedPayoutBasis.Net,
            10_000,
        );
        const result = firmReconciliation(
            ledger({
                accounts: [accA, accB],
                events: [purchased(accA), purchased(accB)],
                firmStatements: [statement],
                payouts: [paidA, paidB],
            }),
        );
        expect(result).toHaveLength(1);
        expect(result[0]?.differenceCents).toBe(0);
        expect(firmColumnsOf(statement)).toEqual(firmColumnsOf(accA));
    });

    it('ignores a requested but unpaid payout', () => {
        const acc = account(EVAL_PLAN, {
            externalFirmId: 'lucid-1',
            firmId: null,
            planLabel: 'External plan',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const requested = payout(acc, 10_000, {
            paidOn: null,
            status: PayoutStatus.Requested,
        });
        const statement = firmStatement(
            'lucid-1',
            '2026-09-15',
            ReportedPayoutBasis.Net,
            0,
        );
        const result = firmReconciliation(
            ledger({
                accounts: [acc],
                events: [purchased(acc)],
                firmStatements: [statement],
                payouts: [requested],
            }),
        );
        expect(result[0]?.differenceCents).toBe(0);
    });

    it('nets refund fees out of nothing (statements never read fees)', () => {
        const acc = account(EVAL_PLAN, {
            externalFirmId: 'lucid-1',
            firmId: null,
            planLabel: 'External plan',
            planSerial: null,
            tracking: AccountTracking.LedgerOnly,
        });
        const paid = payout(acc, 10_000, {
            netCents: 10_000,
            paidOn: '2026-09-10',
        });
        const statement = firmStatement(
            'lucid-1',
            '2026-09-15',
            ReportedPayoutBasis.Net,
            10_000,
        );
        const result = firmReconciliation(
            ledger({
                accounts: [acc],
                events: [purchased(acc)],
                fees: [fee(acc, FeeKind.EvalPurchase, 5000, '2026-09-01')],
                firmStatements: [statement],
                payouts: [paid],
            }),
        );
        expect(result[0]?.differenceCents).toBe(0);
    });
});
