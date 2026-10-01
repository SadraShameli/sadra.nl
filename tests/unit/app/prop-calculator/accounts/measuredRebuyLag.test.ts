import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    measuredRebuyLagOf,
    RebuyLagLineKind,
} from '~/app/(app)/prop-calculator/accounts/_components/measuredRebuyLag';
import {
    AccountEventKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
} from '~/lib/prop-accounts';
import {
    ApexVariant,
    findFirm,
    FirmId,
    serializePlanId,
} from '~/lib/prop-calculator';

const USER_ID = 'user-a';
const PRIOR_ID = 'prior-account';
const CURRENT_ID = 'current-account';

function planSerial(): string {
    const plan = findFirm(FirmId.Apex)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Apex,
        variant: ApexVariant.Eod,
    });
    if (plan === undefined) throw new Error('no Apex EOD 50K plan');
    return serializePlanId(plan.id);
}

const PLAN_SERIAL = planSerial();

function account(overrides: Record<string, unknown> = {}) {
    return {
        accountSize: 50_000,
        archivedAt: null,
        copyGroupId: null,
        createdAt: new Date('2026-08-01T12:00:00Z'),
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalAlias: null,
        externalFirmId: null,
        firmId: FirmId.Apex,
        firstFundedTradeOn: null,
        fundedOn: null,
        id: CURRENT_ID,
        label: 'Alpha',
        liveStartBalanceCents: null,
        notes: null,
        optIns: { takesFundedReset: false, takesOneTimeEarlyWithdrawal: false },
        personalRules: {},
        planLabel: null,
        planRulesChanged: null,
        planRulesFingerprint: null,
        planSerial: PLAN_SERIAL,
        purchasedOn: '2026-08-13',
        readIssues: [],
        replacesAccountId: PRIOR_ID,
        roundId: null,
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        updatedAt: new Date('2026-08-01T12:00:00Z'),
        userId: USER_ID,
        ...overrides,
    };
}

function event(id: string, kind: AccountEventKind, occurredOn: string) {
    return {
        accountId: PRIOR_ID,
        createdAt: new Date(`${occurredOn}T12:00:00Z`),
        detail: { changes: [], note: null },
        id,
        kind,
        occurredOn,
        updatedAt: new Date(`${occurredOn}T12:00:00Z`),
        userId: USER_ID,
    };
}

const MEASURED_ACCOUNTS = [
    account(),
    account({
        id: PRIOR_ID,
        replacesAccountId: null,
        status: AccountStatus.Busted,
    }),
];

const MEASURED_EVENTS = [
    event('e-purchased', AccountEventKind.Purchased, '2026-08-03'),
    event('e-busted', AccountEventKind.Busted, '2026-08-10'),
];

describe('measuredRebuyLagOf (PT-34c)', () => {
    it('measures the lag from the replacements already recorded on the plan', () => {
        expect(
            measuredRebuyLagOf({
                accounts: MEASURED_ACCOUNTS,
                events: MEASURED_EVENTS,
                planSerial: PLAN_SERIAL,
                userId: USER_ID,
            }),
        ).toEqual({
            kind: RebuyLagLineKind.Measured,
            value: { days: 2, samples: 1 },
        });
    });

    it('returns null while any input is still loading', () => {
        const base = {
            accounts: MEASURED_ACCOUNTS,
            events: MEASURED_EVENTS,
            planSerial: PLAN_SERIAL,
            userId: USER_ID,
        };
        expect(measuredRebuyLagOf({ ...base, accounts: undefined })).toBeNull();
        expect(measuredRebuyLagOf({ ...base, events: undefined })).toBeNull();
        expect(measuredRebuyLagOf({ ...base, userId: undefined })).toBeNull();
    });

    it('returns null for an account without a plan', () => {
        expect(
            measuredRebuyLagOf({
                accounts: MEASURED_ACCOUNTS,
                events: MEASURED_EVENTS,
                planSerial: null,
                userId: USER_ID,
            }),
        ).toBeNull();
    });

    it('returns null when no replacement has been measured on the plan', () => {
        expect(
            measuredRebuyLagOf({
                accounts: [account({ replacesAccountId: null })],
                events: [],
                planSerial: PLAN_SERIAL,
                userId: USER_ID,
            }),
        ).toBeNull();
    });

    it('keeps the failed state with the date message when a stored date is not a calendar date', () => {
        const line = measuredRebuyLagOf({
            accounts: [
                ...MEASURED_ACCOUNTS,
                account({
                    id: 'corrupt',
                    purchasedOn: '2026-02-30',
                    replacesAccountId: PRIOR_ID,
                }),
            ],
            events: MEASURED_EVENTS,
            planSerial: PLAN_SERIAL,
            userId: USER_ID,
        });
        expect(line?.kind).toBe(RebuyLagLineKind.Failed);
        expect(
            line !== null && 'message' in line ? line.message : '',
        ).toContain('Not a calendar date: "2026-02-30".');
    });
});

describe('the measured rebuy lag lives in one place (PT-34c)', () => {
    const ACCOUNTS_ROOT = path.resolve(
        import.meta.dirname,
        '../../../../../src/app/(app)/prop-calculator/accounts',
    );
    const ALLOWED = new Set([
        '_components/measuredRebuyLag.ts',
        '_components/overview/overviewModel.ts',
    ]);

    it('calls rebuyLagDefault only in the shared helper and the overview per-plan table', () => {
        const offenders = readdirSync(ACCOUNTS_ROOT, {
            recursive: true,
            withFileTypes: true,
        })
            .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
            .map((entry) => path.join(entry.parentPath, entry.name))
            .filter((file) =>
                /\brebuyLagDefault\(/u.test(readFileSync(file, 'utf8')),
            )
            .map((file) => path.relative(ACCOUNTS_ROOT, file))
            .filter((relative) => !ALLOWED.has(relative));
        expect(offenders).toEqual([]);
    });
});

describe('the measured-to-advisor lag mapping lives in one place (PT-37b)', () => {
    const ACCOUNTS_ROOT = path.resolve(
        import.meta.dirname,
        '../../../../../src/app/(app)/prop-calculator/accounts',
    );

    function sourceOf(relative: string): string {
        return readFileSync(path.join(ACCOUNTS_ROOT, relative), 'utf8');
    }

    it('has no private measuredRebuyLagFor in the accounts pages', () => {
        const offenders = readdirSync(ACCOUNTS_ROOT, {
            recursive: true,
            withFileTypes: true,
        })
            .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name))
            .map((entry) => path.join(entry.parentPath, entry.name))
            .filter((file) =>
                /\bmeasuredRebuyLagFor\b/u.test(readFileSync(file, 'utf8')),
            )
            .map((file) => path.relative(ACCOUNTS_ROOT, file));
        expect(offenders).toEqual([]);
    });

    it('serves the detail helper and the overview model from the library mapping', () => {
        expect(sourceOf('_components/measuredRebuyLag.ts')).toContain(
            'measuredRebuyLagOfDefault(',
        );
        expect(sourceOf('_components/overview/overviewModel.ts')).toContain(
            'measuredRebuyLagOfDefault(',
        );
    });
});
