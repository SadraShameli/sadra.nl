import { describe, expect, it } from 'vitest';

import {
    NOT_PATH_ADJUSTED_DISCLOSURE,
    tiltVarianceSplitOf,
} from '~/lib/prop-accounts/conduct';
import {
    type FirmKey,
    FirmKeyKind,
    RuleViolationKind,
    usdCents,
    ViolationSource,
} from '~/lib/prop-accounts/core';
import { FirmId } from '~/lib/prop-calculator';

const ACCOUNT = 'account-alpha';
const FIRM: FirmKey = { firmId: FirmId.Apex, kind: FirmKeyKind.Modeled };

describe('tiltVarianceSplitOf', () => {
    it('adds violation cost back onto net cash to give the net without violations, on a cash basis', () => {
        const split = tiltVarianceSplitOf({
            netCashByBucket: [
                {
                    accountId: ACCOUNT,
                    firmKey: FIRM,
                    month: '2026-09',
                    netCashCents: usdCents(-10_000),
                },
            ],
            violations: [
                {
                    accountId: ACCOUNT,
                    costCents: usdCents(4000),
                    kind: RuleViolationKind.Oversize,
                    occurredOn: '2026-09-05',
                    source: ViolationSource.Manual,
                },
            ],
        });
        expect(split.rows).toEqual([
            {
                accountId: ACCOUNT,
                firmKey: FIRM,
                month: '2026-09',
                netCashCents: -10_000,
                netWithoutViolationsCents: -6000,
                violationCostCents: 4000,
            },
        ]);
        expect(split.disclosure).toBe(NOT_PATH_ADJUSTED_DISCLOSURE);
    });

    it('reduces net without violations for a violation with a negative cost (one that won)', () => {
        const split = tiltVarianceSplitOf({
            netCashByBucket: [
                {
                    accountId: ACCOUNT,
                    firmKey: FIRM,
                    month: '2026-09',
                    netCashCents: usdCents(10_000),
                },
            ],
            violations: [
                {
                    accountId: ACCOUNT,
                    costCents: usdCents(-3000),
                    kind: RuleViolationKind.ChasedLoss,
                    occurredOn: '2026-09-05',
                    source: ViolationSource.Detected,
                },
            ],
        });
        expect(split.rows[0]?.netWithoutViolationsCents).toBe(7000);
    });

    it('treats a bucket with no violations as net without violations equal to net cash', () => {
        const split = tiltVarianceSplitOf({
            netCashByBucket: [
                {
                    accountId: ACCOUNT,
                    firmKey: FIRM,
                    month: '2026-09',
                    netCashCents: usdCents(5000),
                },
            ],
            violations: [],
        });
        expect(split.rows[0]).toEqual({
            accountId: ACCOUNT,
            firmKey: FIRM,
            month: '2026-09',
            netCashCents: 5000,
            netWithoutViolationsCents: 5000,
            violationCostCents: 0,
        });
    });

    it('ignores an uncosted violation for the dollar split (it has no cost to add back)', () => {
        const split = tiltVarianceSplitOf({
            netCashByBucket: [
                {
                    accountId: ACCOUNT,
                    firmKey: FIRM,
                    month: '2026-09',
                    netCashCents: usdCents(1000),
                },
            ],
            violations: [
                {
                    accountId: ACCOUNT,
                    costCents: null,
                    kind: RuleViolationKind.Other,
                    occurredOn: '2026-09-05',
                    source: ViolationSource.Manual,
                },
            ],
        });
        expect(split.rows[0]?.violationCostCents).toBe(0);
        expect(split.rows[0]?.netWithoutViolationsCents).toBe(1000);
    });

    it('sums every violation in the same account/firm/month bucket', () => {
        const split = tiltVarianceSplitOf({
            netCashByBucket: [
                {
                    accountId: ACCOUNT,
                    firmKey: FIRM,
                    month: '2026-09',
                    netCashCents: usdCents(0),
                },
            ],
            violations: [
                {
                    accountId: ACCOUNT,
                    costCents: usdCents(1000),
                    kind: RuleViolationKind.Oversize,
                    occurredOn: '2026-09-02',
                    source: ViolationSource.Manual,
                },
                {
                    accountId: ACCOUNT,
                    costCents: usdCents(2000),
                    kind: RuleViolationKind.ChasedLoss,
                    occurredOn: '2026-09-20',
                    source: ViolationSource.Manual,
                },
            ],
        });
        expect(split.rows[0]?.violationCostCents).toBe(3000);
    });
});
