import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { AccountEventKind } from '~/lib/prop-accounts/core';
import {
    isHorizonMaturedCohort,
    type LedgerAccountRow,
    type PortfolioLedgerRows,
} from '~/lib/prop-accounts/metrics';
import { isFullyObservedFundedCohort } from '~/lib/prop-accounts/metrics/FundedPayoutDistribution';

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

const PREDICATE_NAMES = [
    'isFullyObservedFundedCohort',
    'isHorizonMaturedCohort',
] as const;

const CONSUMERS: Readonly<Record<(typeof PREDICATE_NAMES)[number], string[]>> =
    {
        isFullyObservedFundedCohort: [
            'FundedPayoutDistribution.ts',
            'RealizedAttemptEconomics.ts',
        ],
        isHorizonMaturedCohort: ['RealizedOutcomes.ts'],
    };

const HORIZON_DAYS = 30;
const FUNDED_ON = '2026-01-05';

function allMetricsSources(): readonly string[] {
    return fs
        .readdirSync(METRICS_DIRECTORY)
        .filter((name) => name.endsWith('.ts'))
        .map((name) => readMetricsSource(name));
}

function consumerPairs(): readonly (readonly [string, string])[] {
    return PREDICATE_NAMES.flatMap((name) =>
        CONSUMERS[name].map((file) => [name, file] as const),
    );
}

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

function readMetricsSource(name: string): string {
    return fs.readFileSync(path.join(METRICS_DIRECTORY, name), 'utf8');
}

describe('the horizon cohort predicates', () => {
    it('are exactly two, each defined once', () => {
        const sources = allMetricsSources();
        const named = sources.flatMap(
            (source) =>
                source.match(/export function is\w*Cohort\(/g) ?? [],
        );
        expect(named.toSorted((a, b) => a.localeCompare(b))).toEqual(
            PREDICATE_NAMES.map((name) => `export function ${name}(`),
        );
    });

    it('are used by the metrics that own each question', () => {
        for (const [name, file] of consumerPairs()) {
            expect(readMetricsSource(file)).toMatch(
                new RegExp(String.raw`${name}\(`),
            );
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

describe('isFullyObservedFundedCohort', () => {
    it('does not mature a young account even when it already holds a paid payout', () => {
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
            isFullyObservedFundedCohort(
                entry,
                FUNDED_ON,
                '2026-01-09',
                HORIZON_DAYS,
            ),
        ).toBe(false);
    });

    it('matures an account funded exactly H days ago, paying or not', () => {
        const owner = account(EVAL_PLAN, { purchasedOn: '2026-01-01' });
        const entry = fundedEntry(fundedRows(owner));
        expect(
            isFullyObservedFundedCohort(
                entry,
                FUNDED_ON,
                '2026-02-04',
                HORIZON_DAYS,
            ),
        ).toBe(true);
        expect(
            isFullyObservedFundedCohort(
                entry,
                FUNDED_ON,
                '2026-02-03',
                HORIZON_DAYS,
            ),
        ).toBe(false);
    });

    it('matures a young account that ended', () => {
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
            isFullyObservedFundedCohort(
                entry,
                FUNDED_ON,
                '2026-01-09',
                HORIZON_DAYS,
            ),
        ).toBe(true);
    });
});
