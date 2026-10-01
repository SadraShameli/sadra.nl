import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    FeeKind,
    FirmEngagementReason,
    FirmEngagementStatus,
    FirmKeyKind,
} from '~/lib/prop-accounts/core';
import {
    firmEngagementFor,
    firmRosterOf,
} from '~/lib/prop-accounts/firms';

import {
    account,
    EVAL_PLAN,
    event,
    fee,
    firmEngagement,
    ledger,
    OTHER_FIRM_EVAL_PLAN,
    purchased,
} from '../metrics/ledgerFixtures';

const CONSUMER_FILES = [
    path.join(process.cwd(), 'src/lib/prop-accounts/firms/FirmRoster.ts'),
    path.join(
        process.cwd(),
        'src/app/(app)/prop-calculator/accounts/firms/FirmsView.tsx',
    ),
] as const;

function collectSourceFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return entry.name === 'node_modules' ? [] : collectSourceFiles(fullPath);
        }
        return /\.tsx?$/.test(entry.name) ? [fullPath] : [];
    });
}

const FIRM_COLUMNS_ROW_SHAPE_PATTERN =
    /\{\s*readonly externalFirmId:\s*null\s*\|\s*string;\s*readonly firmId:\s*null\s*\|\s*StoredFirmId;\s*\}/;

describe('the firm-columns row type', () => {
    it('is defined once, in core/FirmKey.ts, and FirmEngagementColumns reuses it', () => {
        const firmKeyPath = path.join(
            process.cwd(),
            'src/lib/prop-accounts/core/FirmKey.ts',
        );
        const firmKeySource = fs.readFileSync(firmKeyPath, 'utf8');
        const firmRosterSource = fs.readFileSync(
            path.join(process.cwd(), 'src/lib/prop-accounts/firms/FirmRoster.ts'),
            'utf8',
        );
        expect(firmKeySource).toMatch(/export interface FirmColumnsRow\b/);
        expect(firmRosterSource).not.toMatch(/export interface FirmEngagementColumns\b/);
        expect(firmRosterSource).toMatch(
            /export type FirmEngagementColumns\s*=\s*FirmColumnsRow\b/,
        );
    });

    it('is never redeclared inline anywhere else in src', () => {
        const firmKeyPath = path.join(
            process.cwd(),
            'src/lib/prop-accounts/core/FirmKey.ts',
        );
        const files = collectSourceFiles(path.join(process.cwd(), 'src')).filter(
            (file) => file !== firmKeyPath,
        );
        const offenders = files.filter((file) =>
            FIRM_COLUMNS_ROW_SHAPE_PATTERN.test(fs.readFileSync(file, 'utf8')),
        );
        expect(offenders).toEqual([]);
    });
});

describe('the firm-key engagement lookup', () => {
    it('matches a firm engagement row by firm key in exactly one place', () => {
        const sources = CONSUMER_FILES.map((file) => fs.readFileSync(file, 'utf8'));
        const matchPattern = /firmKeyId\(firmKeyOf\(firmColumnsOf\(/g;
        const matchCount = sources.reduce(
            (count, source) => count + (source.match(matchPattern) ?? []).length,
            0,
        );
        expect(matchCount).toBe(1);
    });

    it('is used by the roster and the firms page', () => {
        const sources = CONSUMER_FILES.map((file) => fs.readFileSync(file, 'utf8'));
        const usagePattern = /firmEngagementFor\(/g;
        for (const source of sources) {
            expect((source.match(usagePattern) ?? []).length).toBeGreaterThan(0);
        }
    });
});

describe('firmEngagementFor', () => {
    it('finds the engagement matching the firm key, or null', () => {
        const engagement = firmEngagement(
            'unused',
            '2026-01-01',
            FirmEngagementStatus.Paused,
            { externalFirmId: null, firmId: EVAL_PLAN.firm.id },
        );
        expect(
            firmEngagementFor(
                { firmId: EVAL_PLAN.firm.id, kind: FirmKeyKind.Modeled },
                [engagement],
            ),
        ).toBe(engagement);
        expect(
            firmEngagementFor(
                { firmId: OTHER_FIRM_EVAL_PLAN.firm.id, kind: FirmKeyKind.Modeled },
                [engagement],
            ),
        ).toBeNull();
    });
});

describe('firmRosterOf', () => {
    it('gives first purchase, last activity, account counts and moved-live count and date per firm', () => {
        const failed = account(EVAL_PLAN, {
            purchasedOn: '2026-08-01',
            status: AccountStatus.Busted,
        });
        const live = account(EVAL_PLAN, {
            purchasedOn: '2026-09-01',
            stage: AccountStage.Funded,
        });
        const result = firmRosterOf(
            ledger({
                accounts: [failed, live],
                events: [
                    purchased(failed),
                    event(failed, AccountEventKind.Busted, '2026-08-10'),
                    purchased(live),
                    event(live, AccountEventKind.EvalPassed, '2026-09-10'),
                    event(live, AccountEventKind.MovedLive, '2026-09-20'),
                ],
                fees: [
                    fee(failed, FeeKind.EvalPurchase, 10_000, '2026-08-01'),
                    fee(live, FeeKind.EvalPurchase, 10_000, '2026-09-01'),
                ],
            }),
        );
        const firm = result.firms.find(
            (row) => row.firmKey.kind === FirmKeyKind.Modeled,
        );
        expect(firm).toMatchObject({
            activeAccounts: 1,
            firstPurchaseOn: '2026-08-01',
            lastActivityOn: '2026-09-20',
            lastMovedLiveOn: '2026-09-20',
            lifetimeAccounts: 2,
            movedLiveCount: 1,
            reason: null,
            status: FirmEngagementStatus.Active,
        });
    });

    it('reads the user status and reason from the firm engagement, defaulting to Active with no reason', () => {
        const withStatus = account(EVAL_PLAN);
        const untouched = account(OTHER_FIRM_EVAL_PLAN);
        const engaged = firmEngagement(
            'unused',
            '2026-01-01',
            FirmEngagementStatus.Paused,
            {
                externalFirmId: null,
                firmId: EVAL_PLAN.firm.id,
                reason: FirmEngagementReason.Capacity,
            },
        );
        const result = firmRosterOf(
            ledger({
                accounts: [withStatus, untouched],
                events: [purchased(withStatus), purchased(untouched)],
                firmEngagements: [engaged],
            }),
        );
        const paused = result.firms.find(
            (row) =>
                row.firmKey.kind === FirmKeyKind.Modeled &&
                row.firmKey.firmId === EVAL_PLAN.firm.id,
        );
        const untouchedFirm = result.firms.find(
            (row) =>
                row.firmKey.kind === FirmKeyKind.Modeled &&
                row.firmKey.firmId === OTHER_FIRM_EVAL_PLAN.firm.id,
        );
        expect(paused).toMatchObject({
            reason: FirmEngagementReason.Capacity,
            status: FirmEngagementStatus.Paused,
        });
        expect(untouchedFirm).toMatchObject({
            reason: null,
            status: FirmEngagementStatus.Active,
        });
    });

    it('totals firms used, active and sent live', () => {
        const sentLiveAccount = account(EVAL_PLAN, { stage: AccountStage.Live });
        const pausedAccount = account(OTHER_FIRM_EVAL_PLAN);
        const sentLive = firmEngagement(
            'unused',
            '2026-01-01',
            FirmEngagementStatus.Retired,
            {
                externalFirmId: null,
                firmId: EVAL_PLAN.firm.id,
                reason: FirmEngagementReason.SentLive,
                sentLiveOn: '2026-09-20',
            },
        );
        const paused = firmEngagement(
            'unused',
            '2026-01-01',
            FirmEngagementStatus.Paused,
            {
                externalFirmId: null,
                firmId: OTHER_FIRM_EVAL_PLAN.firm.id,
                reason: FirmEngagementReason.Capacity,
            },
        );
        const result = firmRosterOf(
            ledger({
                accounts: [sentLiveAccount, pausedAccount],
                events: [purchased(sentLiveAccount), purchased(pausedAccount)],
                firmEngagements: [sentLive, paused],
            }),
        );
        expect(result.totalFirmsUsed).toBe(2);
        expect(result.totalActive).toBe(0);
        expect(result.totalSentLive).toBe(1);
    });

    it('is empty for an empty ledger', () => {
        expect(firmRosterOf(ledger({})).firms).toEqual([]);
    });
});
