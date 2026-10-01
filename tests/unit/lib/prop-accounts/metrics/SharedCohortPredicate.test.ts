import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { AccountEventKind } from '~/lib/prop-accounts/core';
import {
    isHorizonMaturedCohort,
    type LedgerAccountRow,
    type PortfolioLedgerRows,
} from '~/lib/prop-accounts/metrics';

import {
    account,
    EVAL_PLAN,
    event,
    ledger,
    payout,
    purchased,
} from './ledgerFixtures';

const METRICS_DIRECTORY = path.join(
    process.cwd(),
    'src/lib/prop-accounts/metrics',
);

const CONSUMER_FILES = [
    'RealizedOutcomes.ts',
    'FundedPayoutDistribution.ts',
    'RealizedAttemptEconomics.ts',
] as const;

const HORIZON_DAYS = 30;
const FUNDED_ON = '2026-01-05';

function fundedEntry(rows: Partial<PortfolioLedgerRows>) {
    const group = ledger(rows)
        .planGroups()
        .find((candidate) => candidate.planSerial === EVAL_PLAN.serial);
    const entry = group?.accounts[0];
    if (entry === undefined) {
        throw new Error('no matching plan group entry in the fixture ledger');
    }
    return entry;
}

function fundedRows(owner: LedgerAccountRow): Partial<PortfolioLedgerRows> {
    return {
        accounts: [owner],
        events: [
            purchased(owner),
            event(owner, AccountEventKind.EvalPassed, FUNDED_ON),
        ],
    };
}

function readConsumerSources(): readonly string[] {
    return CONSUMER_FILES.map((name) =>
        fs.readFileSync(path.join(METRICS_DIRECTORY, name), 'utf8'),
    );
}

describe('the horizon-matured ended-cohort predicate', () => {
    it('is defined exactly once across RealizedOutcomes, FundedPayoutDistribution and RealizedAttemptEconomics', () => {
        const sources = readConsumerSources();
        const definitionPattern = /export function isHorizonMaturedCohort\(/g;
        const definitionCount = sources.reduce(
            (count, source) =>
                count + (source.match(definitionPattern) ?? []).length,
            0,
        );
        expect(definitionCount).toBe(1);
    });

    it('is imported and used by all three consuming metrics', () => {
        const sources = readConsumerSources();
        const usagePattern = /isHorizonMaturedCohort\(/g;
        const usageCounts = sources.map(
            (source) => (source.match(usagePattern) ?? []).length,
        );
        for (const count of usageCounts) {
            expect(count).toBeGreaterThan(0);
        }
    });
});

describe('isHorizonMaturedCohort', () => {
    it('matures a funded account once it has a payout paid within the horizon, even freshly funded', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const entry = fundedEntry({
            ...fundedRows(owner),
            payouts: [
                payout(owner, 40_000, {
                    netCents: 40_000,
                    paidOn: '2026-01-08',
                }),
            ],
        });
        expect(
            isHorizonMaturedCohort(
                entry,
                FUNDED_ON,
                '2026-01-09',
                HORIZON_DAYS,
            ),
        ).toBe(true);
    });

    it('matures a funded account that ended (busted) with no payout at all', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const entry = fundedEntry({
            accounts: [owner],
            events: [
                purchased(owner),
                event(owner, AccountEventKind.EvalPassed, FUNDED_ON),
                event(owner, AccountEventKind.Busted, '2026-01-07'),
            ],
        });
        expect(
            isHorizonMaturedCohort(
                entry,
                FUNDED_ON,
                '2026-01-09',
                HORIZON_DAYS,
            ),
        ).toBe(true);
    });

    it('does not mature an account still open and younger than the horizon', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const entry = fundedEntry(fundedRows(owner));
        expect(
            isHorizonMaturedCohort(
                entry,
                FUNDED_ON,
                '2026-01-15',
                HORIZON_DAYS,
            ),
        ).toBe(false);
    });

    it('matures an account still open once it has reached the horizon with no payout', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const entry = fundedEntry(fundedRows(owner));
        expect(
            isHorizonMaturedCohort(
                entry,
                FUNDED_ON,
                '2026-02-10',
                HORIZON_DAYS,
            ),
        ).toBe(true);
    });
});
