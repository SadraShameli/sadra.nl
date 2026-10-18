import { describe, expect, it } from 'vitest';

import { violationStatsOf } from '~/lib/prop-accounts/conduct';
import {
    RuleViolationKind,
    usdCents,
    ViolationSource,
} from '~/lib/prop-accounts/core';

const ALPHA = 'account-alpha';
const BRAVO = 'account-bravo';

describe('violationStatsOf', () => {
    it('counts and sums cost by kind, month and account', () => {
        const stats = violationStatsOf(
            [
                {
                    accountId: ALPHA,
                    costCents: usdCents(10_000),
                    kind: RuleViolationKind.Oversize,
                    occurredOn: '2026-08-05',
                    source: ViolationSource.Manual,
                },
                {
                    accountId: ALPHA,
                    costCents: usdCents(5000),
                    kind: RuleViolationKind.Oversize,
                    occurredOn: '2026-09-01',
                    source: ViolationSource.Detected,
                },
                {
                    accountId: BRAVO,
                    costCents: usdCents(2000),
                    kind: RuleViolationKind.ChasedLoss,
                    occurredOn: '2026-09-10',
                    source: ViolationSource.Manual,
                },
            ],
            null,
        );

        expect(stats.byKind).toEqual(
            expect.arrayContaining([
                {
                    costCents: 15_000,
                    count: 2,
                    kind: RuleViolationKind.Oversize,
                },
                {
                    costCents: 2000,
                    count: 1,
                    kind: RuleViolationKind.ChasedLoss,
                },
            ]),
        );
        expect(stats.byMonth).toEqual(
            expect.arrayContaining([
                { costCents: 10_000, count: 1, month: '2026-08' },
                { costCents: 7000, count: 2, month: '2026-09' },
            ]),
        );
        expect(stats.byAccount).toEqual(
            expect.arrayContaining([
                { accountId: ALPHA, costCents: 15_000, count: 2 },
                { accountId: BRAVO, costCents: 2000, count: 1 },
            ]),
        );
        expect(stats.manualCount).toBe(2);
        expect(stats.detectedCount).toBe(1);
        expect(stats.netCostCents).toBe(17_000);
    });

    it('treats a violation with no recorded cost as null cost, disclosed, and excludes it from the total', () => {
        const stats = violationStatsOf(
            [
                {
                    accountId: ALPHA,
                    costCents: null,
                    kind: RuleViolationKind.Other,
                    occurredOn: '2026-08-05',
                    source: ViolationSource.Manual,
                },
            ],
            null,
        );
        expect(stats.netCostCents).toBe(0);
        expect(stats.uncostedCount).toBe(1);
        expect(stats.disclosures).toContain(
            'A violation with no recorded cost counts toward its count only, never its cost total.',
        );
    });

    it('reports cost as a share of net cash when net cash is given and positive', () => {
        const stats = violationStatsOf(
            [
                {
                    accountId: ALPHA,
                    costCents: usdCents(5000),
                    kind: RuleViolationKind.Oversize,
                    occurredOn: '2026-08-05',
                    source: ViolationSource.Manual,
                },
            ],
            usdCents(50_000),
        );
        expect(stats.netCostShareOfNetCash).toBeCloseTo(0.1);
    });

    it('gives no share of net cash when net cash is null, zero or negative', () => {
        for (const netCash of [null, usdCents(0), usdCents(-1000)]) {
            const stats = violationStatsOf(
                [
                    {
                        accountId: ALPHA,
                        costCents: usdCents(5000),
                        kind: RuleViolationKind.Oversize,
                        occurredOn: '2026-08-05',
                        source: ViolationSource.Manual,
                    },
                ],
                netCash,
            );
            expect(stats.netCostShareOfNetCash).toBeNull();
        }
    });

    it('returns empty stats and no share for no violations', () => {
        const stats = violationStatsOf([], usdCents(10_000));
        expect(stats).toEqual({
            byAccount: [],
            byKind: [],
            byMonth: [],
            detectedCount: 0,
            disclosures: [],
            manualCount: 0,
            netCostCents: 0,
            netCostShareOfNetCash: null,
            uncostedCount: 0,
        });
    });
});
