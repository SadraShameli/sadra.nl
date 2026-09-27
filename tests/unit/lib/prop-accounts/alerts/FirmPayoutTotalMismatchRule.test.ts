import { describe, expect, it } from 'vitest';

import {
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    FirmPayoutTotalMismatchRule,
} from '~/lib/prop-accounts/alerts';
import {
    FirmKeyKind,
    ReportedPayoutBasis,
    usdCents,
} from '~/lib/prop-accounts/core';
import { FirmId } from '~/lib/prop-calculator';

import { accountFor, alertsOf, ANY_EVAL_PLAN } from './alertFixtures';

const rule = new FirmPayoutTotalMismatchRule();

const FIRM_KEY = { firmId: FirmId.Mffu, kind: FirmKeyKind.Modeled } as const;

describe('FirmPayoutTotalMismatchRule', () => {
    it('is silent within tolerance and unchanged from the previous statement', () => {
        expect(
            alertsOf(rule, {
                firmReconciliation: [
                    {
                        asOf: '2026-09-15',
                        basis: ReportedPayoutBasis.Net,
                        changeFromPreviousCents: 0,
                        decreasedFromPrevious: false,
                        differenceCents: 50,
                        firmKey: FIRM_KEY,
                        grossOnlyCount: 0,
                        id: 'statement-1',
                        ledgerPaidCents: usdCents(80_000),
                        reportedPayoutCents: usdCents(80_050),
                        withinTolerance: true,
                    },
                ],
            }),
        ).toEqual([]);
    });

    it('fires a Warning beyond tolerance, naming the ledger and reported totals', () => {
        const account = accountFor(ANY_EVAL_PLAN, { firmId: FirmId.Mffu });
        const alerts = alertsOf(rule, {
            accounts: [account],
            firmReconciliation: [
                {
                    asOf: '2026-09-15',
                    basis: ReportedPayoutBasis.Net,
                    changeFromPreviousCents: null,
                    decreasedFromPrevious: false,
                    differenceCents: 5000,
                    firmKey: FIRM_KEY,
                    grossOnlyCount: 0,
                    id: 'statement-1',
                    ledgerPaidCents: usdCents(75_000),
                    reportedPayoutCents: usdCents(80_000),
                    withinTolerance: false,
                },
            ],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.kind).toBe(AlertKind.FirmPayoutTotalMismatch);
        expect(alerts[0]?.severity).toBe(AlertSeverity.Warning);
        expect(alerts[0]?.subject).toMatchObject({
            accountIds: [account.id],
            kind: AlertSubjectKind.Portfolio,
        });
        expect(alerts[0]?.message).toContain('$800.00');
        expect(alerts[0]?.message).toContain('$750.00');
    });

    it('fires a Warning when the reported figure went down, even within tolerance', () => {
        const alerts = alertsOf(rule, {
            firmReconciliation: [
                {
                    asOf: '2026-09-20',
                    basis: ReportedPayoutBasis.Net,
                    changeFromPreviousCents: -1000,
                    decreasedFromPrevious: true,
                    differenceCents: 0,
                    firmKey: FIRM_KEY,
                    grossOnlyCount: 0,
                    id: 'statement-2',
                    ledgerPaidCents: usdCents(80_000),
                    reportedPayoutCents: usdCents(80_000),
                    withinTolerance: true,
                },
            ],
        });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.message).toContain('went down');
    });
});
