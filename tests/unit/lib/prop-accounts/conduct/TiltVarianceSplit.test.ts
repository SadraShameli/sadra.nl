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
            firmKeyByAccount: new Map(),
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
            firmKeyByAccount: new Map(),
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
            firmKeyByAccount: new Map(),
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
            firmKeyByAccount: new Map(),
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
            firmKeyByAccount: new Map(),
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

    it('keeps a violation in a month with no cash as its own row: net cash 0, cost added back', () => {
        const split = tiltVarianceSplitOf({
            firmKeyByAccount: new Map([[ACCOUNT, FIRM]]),
            netCashByBucket: [
                {
                    accountId: ACCOUNT,
                    firmKey: FIRM,
                    month: '2026-01',
                    netCashCents: usdCents(-15_000),
                },
            ],
            violations: [
                {
                    accountId: ACCOUNT,
                    costCents: usdCents(20_000),
                    kind: RuleViolationKind.Oversize,
                    occurredOn: '2026-02-10',
                    source: ViolationSource.Manual,
                },
            ],
        });
        expect(split.droppedViolations).toBe(0);
        expect(split.rows).toEqual([
            {
                accountId: ACCOUNT,
                firmKey: FIRM,
                month: '2026-01',
                netCashCents: -15_000,
                netWithoutViolationsCents: -15_000,
                violationCostCents: 0,
            },
            {
                accountId: ACCOUNT,
                firmKey: FIRM,
                month: '2026-02',
                netCashCents: 0,
                netWithoutViolationsCents: 20_000,
                violationCostCents: 20_000,
            },
        ]);
    });

    it('takes the firm of a violation-only row from the account map, and from the cash buckets when the map has no entry', () => {
        const otherFirm: FirmKey = {
            firmId: FirmId.Lucid,
            kind: FirmKeyKind.Modeled,
        };
        const split = tiltVarianceSplitOf({
            firmKeyByAccount: new Map([['account-beta', otherFirm]]),
            netCashByBucket: [
                {
                    accountId: ACCOUNT,
                    firmKey: FIRM,
                    month: '2026-01',
                    netCashCents: usdCents(0),
                },
            ],
            violations: [
                {
                    accountId: 'account-beta',
                    costCents: usdCents(500),
                    kind: RuleViolationKind.Oversize,
                    occurredOn: '2026-03-02',
                    source: ViolationSource.Manual,
                },
                {
                    accountId: ACCOUNT,
                    costCents: usdCents(700),
                    kind: RuleViolationKind.Oversize,
                    occurredOn: '2026-03-02',
                    source: ViolationSource.Manual,
                },
            ],
        });
        expect(split.droppedViolations).toBe(0);
        expect(
            split.rows.map((row) => [row.accountId, row.month, row.firmKey]),
        ).toEqual([
            [ACCOUNT, '2026-01', FIRM],
            ['account-beta', '2026-03', otherFirm],
            [ACCOUNT, '2026-03', FIRM],
        ]);
    });

    it('counts a violation of an unknown account in droppedViolations instead of losing it silently', () => {
        const split = tiltVarianceSplitOf({
            firmKeyByAccount: new Map([[ACCOUNT, FIRM]]),
            netCashByBucket: [],
            violations: [
                {
                    accountId: 'account-gone',
                    costCents: usdCents(900),
                    kind: RuleViolationKind.Oversize,
                    occurredOn: '2026-03-02',
                    source: ViolationSource.Manual,
                },
                {
                    accountId: 'account-gone',
                    costCents: null,
                    kind: RuleViolationKind.Other,
                    occurredOn: '2026-03-09',
                    source: ViolationSource.Manual,
                },
            ],
        });
        expect(split.rows).toEqual([]);
        expect(split.droppedViolations).toBe(2);
    });

    it('gives an uncosted violation in a cashless month a zero-cost row so the month is visible', () => {
        const split = tiltVarianceSplitOf({
            firmKeyByAccount: new Map([[ACCOUNT, FIRM]]),
            netCashByBucket: [],
            violations: [
                {
                    accountId: ACCOUNT,
                    costCents: null,
                    kind: RuleViolationKind.Other,
                    occurredOn: '2026-04-09',
                    source: ViolationSource.Manual,
                },
            ],
        });
        expect(split.rows).toEqual([
            {
                accountId: ACCOUNT,
                firmKey: FIRM,
                month: '2026-04',
                netCashCents: 0,
                netWithoutViolationsCents: 0,
                violationCostCents: 0,
            },
        ]);
    });

    it('reports no dropped violations when every violation sits in a cash bucket', () => {
        const split = tiltVarianceSplitOf({
            firmKeyByAccount: new Map(),
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
            ],
        });
        expect(split.droppedViolations).toBe(0);
    });
});
