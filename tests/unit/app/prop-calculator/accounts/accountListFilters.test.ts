import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';

import * as accountListFilters from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import {
    ACCOUNT_LIST_INPUT,
    type AccountListAccount,
    type AccountListBoards,
    type AccountListRow,
    type AccountListSnapshot,
    AccountSortKey,
    accountStatusLabel,
    accountTagOptions,
    alertSubjectView,
    buildAccountListRows,
    DEFAULT_ACCOUNT_LIST_FILTERS,
    DEFAULT_ACCOUNT_LIST_SORT,
    filterAccountRows,
    PayoutReadinessTier,
    readOnlyAccountNotice,
    readOnlyAlertTitle,
    sortAccountRows,
    SortDirection,
} from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import { portfolioAlerts } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    type AccountReadIssue,
    AccountReadIssueKind,
    AccountStage,
    AccountStatus,
    AccountTracking,
    AlertKind,
    AlertSeverity,
    AlertSubjectKind,
    compareText,
    type CushionBoardRow,
    CushionRatioBasis,
    DashboardBalanceConvention,
    describeAccountReadIssue,
    describeUnresolvedPlan,
    type FirmKey,
    FirmKeyKind,
    type LedgerOnlyAccountRow,
    type ModeledAccountRow,
    NO_ACCOUNT_STATES,
    type PayoutReadinessBlockedRow,
    type PayoutReadinessEligibleRow,
    PayoutReadinessNotApplicableKind,
    PayoutReadinessRowKind,
    PlanKeyResolutionKind,
    type StoredFirmId,
    UnresolvedPlanReason,
    type UsdCents,
    usdCents,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    FirmId,
    NO_PLAN_OPT_INS,
    PayoutGate,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    LiveTriggerCoverage,
    PayoutBlockReasonKind,
    PayoutWaitBasis,
} from '~/lib/prop-calculator/advisor';

const GROUP_A = '0f3e2d1c-0000-4000-8000-00000000000a';
const GROUP_B = '0f3e2d1c-0000-4000-8000-00000000000b';

function firstPlanOf(firmId: FirmId) {
    const plan = ALL_FIRMS.find((firm) => firm.id === firmId)?.plans[0];
    if (plan === undefined) throw new Error(`no plan for ${firmId}`);
    return plan;
}

const apexPlan = firstPlanOf(FirmId.Apex);
const topStepPlan = firstPlanOf(FirmId.TopStep);

function account(
    id: string,
    overrides: Partial<ModeledAccountRow<AccountListAccount>> = {},
): ModeledAccountRow<AccountListAccount> {
    return {
        accountSize: apexPlan.id.accountSize,
        archivedAt: null,
        copyGroupId: null,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: FirmId.Apex,
        firstFundedTradeOn: null,
        id,
        label: id,
        liveStartBalanceCents: null,
        notes: null,
        optIns: NO_PLAN_OPT_INS,
        planLabel: null,
        planSerial: serializePlanId(apexPlan.id),
        purchasedOn: '2026-09-01',
        readIssues: [],
        stage: AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        ...overrides,
    };
}

function externalFirmKey(externalFirmId: string): FirmKey {
    return { externalFirmId, kind: FirmKeyKind.External };
}

function ids(rows: readonly AccountListRow[]): readonly string[] {
    return rows.map((row) => row.account.id);
}

function ledgerAccount(
    id: string,
    overrides: Partial<LedgerOnlyAccountRow<AccountListAccount>> = {},
): LedgerOnlyAccountRow<AccountListAccount> {
    return {
        accountSize: 150_000,
        archivedAt: null,
        copyGroupId: null,
        externalFirmId: null,
        firmId: FirmId.Apex,
        id,
        label: id,
        notes: null,
        optIns: NO_PLAN_OPT_INS,
        planLabel: 'Rapid 150K',
        planSerial: null,
        purchasedOn: '2026-09-01',
        readIssues: [],
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.LedgerOnly,
        ...overrides,
    } as LedgerOnlyAccountRow<AccountListAccount>;
}

function modeledFirmKey(firmId: FirmId): FirmKey {
    return { firmId, kind: FirmKeyKind.Modeled };
}

function snapshot(
    accountId: string,
    asOf: string,
    balanceCents: number,
    dashboardFloorCents: null | number,
    createdAt = new Date(`${asOf}T12:00:00Z`),
    id = `${accountId}-${asOf}`,
): AccountListSnapshot {
    return {
        accountId,
        asOf,
        balanceCents: usdCents(balanceCents),
        createdAt,
        dashboardFloorCents:
            dashboardFloorCents === null ? null : usdCents(dashboardFloorCents),
        id,
    };
}

function unresolvablePlanAlerts(
    accounts: readonly AccountListAccount[],
    today: string,
) {
    return portfolioAlerts({
        accounts,
        accountStates: NO_ACCOUNT_STATES,
        copyGroups: [],
        payouts: [],
        rulebook: DEFAULT_RULEBOOK,
        snapshots: [],
        today,
    }).filter((alert) => alert.kind === AlertKind.UnresolvablePlan);
}

const ACCOUNTS: readonly AccountListAccount[] = [
    account('alpha', {
        copyGroupId: GROUP_A,
        label: 'Alpha',
        tags: ['core', 'nq'],
    }),
    account('bravo', {
        accountSize: topStepPlan.id.accountSize,
        firmId: FirmId.TopStep,
        label: 'bravo',
        planSerial: serializePlanId(topStepPlan.id),
        stage: AccountStage.Funded,
        tags: ['nq'],
    }),
    account('charlie', {
        copyGroupId: GROUP_B,
        label: 'Charlie',
        stage: AccountStage.Funded,
        status: AccountStatus.Busted,
    }),
    account('delta', {
        archivedAt: new Date('2026-09-01T00:00:00Z'),
        label: 'Delta',
        tags: ['old'],
    }),
];

const SNAPSHOTS: readonly AccountListSnapshot[] = [
    snapshot('alpha', '2026-09-20', 5_100_000, 4_900_000),
    snapshot('alpha', '2026-09-24', 5_150_000, 4_950_000),
    snapshot('bravo', '2026-09-24', 150_000, -50_000),
    snapshot('charlie', '2026-09-24', 5_050_000, null),
];

const ROWS = buildAccountListRows(ACCOUNTS, SNAPSHOTS);

describe('buildAccountListRows', () => {
    it('attaches the latest snapshot of each account', () => {
        const alpha = ROWS.find((row) => row.account.id === 'alpha');
        expect(alpha?.latestSnapshot?.asOf).toBe('2026-09-24');
        expect(
            ROWS.find((row) => row.account.id === 'delta')?.latestSnapshot,
        ).toBeNull();
    });

    it('breaks a same-day tie by the later entry', () => {
        const rows = buildAccountListRows(
            [account('echo')],
            [
                snapshot(
                    'echo',
                    '2026-09-24',
                    100,
                    null,
                    new Date('2026-09-24T18:00:00Z'),
                ),
                snapshot(
                    'echo',
                    '2026-09-24',
                    200,
                    null,
                    new Date('2026-09-24T08:00:00Z'),
                ),
            ],
        );
        expect(rows[0]?.latestSnapshot?.balanceCents).toBe(100);
    });

    it('computes the cushion from the balance and the dashboard floor only', () => {
        const byId = new Map(ROWS.map((row) => [row.account.id, row]));
        expect(byId.get('alpha')?.cushionCents).toBe(200_000);
        expect(byId.get('bravo')?.cushionCents).toBe(200_000);
        expect(byId.get('charlie')?.cushionCents).toBeNull();
        expect(byId.get('delta')?.cushionCents).toBeNull();
    });

    it('keeps the balance and the cushion typed as cents', () => {
        const [row] = ROWS;
        expectTypeOf(row?.cushionCents).toEqualTypeOf<
            null | undefined | UsdCents
        >();
        expectTypeOf(row?.latestSnapshot?.balanceCents).toEqualTypeOf<
            undefined | UsdCents
        >();
    });

    it('leaves readiness empty until payout gates are computed', () => {
        for (const row of ROWS) expect(row.readiness).toBeNull();
    });

    it('resolves the plan and keeps resolvable rows editable', () => {
        for (const row of ROWS) {
            expect(row.plan.kind).toBe(PlanKeyResolutionKind.Resolved);
            expect(row.isReadOnly).toBe(false);
            expect(row.planIssue).toBeNull();
            expect(row.readOnlyNotice).toBeNull();
        }
    });

    it('shows an unresolvable plan read-only with a warning and never throws', () => {
        const broken = account('foxtrot', {
            label: 'Foxtrot',
            planSerial: 'apex-50000-retired',
        });
        const wrongSize = account('golf', { accountSize: 123_456 });
        const rows = buildAccountListRows([broken, wrongSize], []);
        const [brokenRow, wrongSizeRow] = rows;
        expect(brokenRow?.isReadOnly).toBe(true);
        expect(brokenRow?.plan.kind).toBe(PlanKeyResolutionKind.Unresolved);
        expect(brokenRow?.planIssue).toBe(
            describeUnresolvedPlan(
                broken,
                UnresolvedPlanReason.UnknownPlanSerial,
            ),
        );
        expect(wrongSizeRow?.isReadOnly).toBe(true);
        expect(wrongSizeRow?.planIssue).toBe(
            describeUnresolvedPlan(
                wrongSize,
                UnresolvedPlanReason.AccountSizeMismatch,
            ),
        );
    });

    it('treats a corrupt opt-in value as unresolvable instead of throwing', () => {
        const corrupt = account('hotel', {
            optIns: {
                takesFundedReset: 'yes',
            } as unknown as typeof NO_PLAN_OPT_INS,
        });
        const [row] = buildAccountListRows([corrupt], []);
        expect(row?.isReadOnly).toBe(true);
        expect(row?.planIssue).not.toBeNull();
    });
});

describe('buildAccountListRows with read issues', () => {
    const corruptOptIns: AccountReadIssue = {
        kind: AccountReadIssueKind.UnresolvablePlan,
        reason: UnresolvedPlanReason.CorruptOptIns,
    };
    const corruptPersonalRules: AccountReadIssue = {
        kind: AccountReadIssueKind.CorruptPersonalRules,
    };

    it('marks a row whose plan resolves but whose personal rules are unreadable read-only', () => {
        const unreadable = account('mike', {
            readIssues: [corruptPersonalRules],
        });
        const [row] = buildAccountListRows([unreadable], []);
        expect(row?.plan.kind).toBe(PlanKeyResolutionKind.Resolved);
        expect(row?.isReadOnly).toBe(true);
        expect(row?.planIssue).toBe(
            describeAccountReadIssue(unreadable, corruptPersonalRules),
        );
    });

    it('carries the full read-only notice of every read issue on the row, so the table can show it', () => {
        const rows = buildAccountListRows(
            [
                account('mike', { readIssues: [corruptPersonalRules] }),
                account('november', {
                    readIssues: [corruptOptIns, corruptPersonalRules],
                }),
                account('oscar', { planSerial: 'apex-50000-retired' }),
            ],
            [],
        );
        const [mike, november, oscar] = rows;
        expect(mike?.readOnlyNotice).toBe(
            readOnlyAccountNotice(mike?.account ?? account('mike'), [
                corruptPersonalRules,
            ]),
        );
        expect(november?.readOnlyNotice).toBe(
            readOnlyAccountNotice(november?.account ?? account('november'), [
                corruptOptIns,
                corruptPersonalRules,
            ]),
        );
        expect(oscar?.readOnlyNotice).toBe(
            readOnlyAccountNotice(oscar?.account ?? account('oscar'), [
                {
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason: UnresolvedPlanReason.UnknownPlanSerial,
                },
            ]),
        );
    });

    it('describes every read issue of a row, in order', () => {
        const both = account('november', {
            readIssues: [corruptOptIns, corruptPersonalRules],
        });
        const [row] = buildAccountListRows([both], []);
        expect(row?.isReadOnly).toBe(true);
        expect(row?.plan).toEqual({
            kind: PlanKeyResolutionKind.Unresolved,
            reason: UnresolvedPlanReason.CorruptOptIns,
        });
        expect(row?.planIssue).toBe(
            [corruptOptIns, corruptPersonalRules]
                .map((issue) => describeAccountReadIssue(both, issue))
                .join('; '),
        );
    });

    it('still flags a plan that stops resolving on the client with no read issue from the server', () => {
        const retired = account('oscar', { planSerial: 'apex-50000-retired' });
        const [row] = buildAccountListRows([retired], []);
        expect(row?.isReadOnly).toBe(true);
        expect(row?.planIssue).toBe(
            describeUnresolvedPlan(
                retired,
                UnresolvedPlanReason.UnknownPlanSerial,
            ),
        );
    });

    it('raises the unresolvable plan alert for a row read with placeholder opt-ins', () => {
        const flagged = account('papa', {
            label: 'Papa',
            optIns: NO_PLAN_OPT_INS,
            readIssues: [corruptOptIns],
        });
        const alerts = unresolvablePlanAlerts([flagged], '2026-09-25');
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.message).toContain('opt-ins');
    });

    it('titles the alert of an account whose plan exists but whose stored data is bad without claiming the plan is missing', () => {
        const flagged = [
            account('papa', { label: 'Papa', readIssues: [corruptOptIns] }),
            account('quebec', { accountSize: 123_456, label: 'Quebec' }),
            account('romeo', {
                label: 'Romeo',
                planSerial: 'apex-50000-retired',
            }),
        ];
        const titles = unresolvablePlanAlerts(flagged, '2026-09-25').map(
            (alert) => readOnlyAlertTitle(alertSubjectView(alert).label),
        );
        expect(titles.toSorted(compareText)).toEqual([
            'Read-only account: Papa',
            'Read-only account: Quebec',
            'Read-only account: Romeo',
        ]);
        for (const title of titles) {
            expect(title).not.toMatch(/plan not found/i);
        }
    });

    it('titles the row popover of a read-only account from the shared helper', () => {
        expect(readOnlyAlertTitle('Papa')).toBe('Read-only account: Papa');
        const table = readFileSync(
            path.join(
                process.cwd(),
                'src/app/(app)/prop-calculator/accounts/_components/AccountsTable.tsx',
            ),
            'utf8',
        );
        expect(table).not.toContain('Read-only account:');
        expect(table.match(/readOnlyAlertTitle\(/g)).toHaveLength(1);
    });

    it('filters a row with a removed firm id by firm without narrowing it to a modeled firm', () => {
        const removed: StoredFirmId = 'gone-firm';
        const rows = buildAccountListRows(
            [account('quebec', { firmId: removed })],
            [],
        );
        expect(rows[0]?.isReadOnly).toBe(true);
        expect(
            filterAccountRows(rows, {
                ...DEFAULT_ACCOUNT_LIST_FILTERS,
                firmKey: modeledFirmKey(FirmId.Apex),
            }),
        ).toEqual([]);
        expectTypeOf<
            AccountListAccount['firmId']
        >().toEqualTypeOf<null | StoredFirmId>();
        expectTypeOf<AccountListAccount['readIssues']>().toEqualTypeOf<
            readonly AccountReadIssue[]
        >();
    });
});

describe('readOnlyAccountNotice', () => {
    const NOT_MODELED = /no longer modeled/i;

    it('says the plan or firm is no longer modeled only for an unknown firm or plan serial', () => {
        for (const reason of [
            UnresolvedPlanReason.UnknownFirm,
            UnresolvedPlanReason.UnknownPlanSerial,
        ]) {
            const notice = readOnlyAccountNotice(account('romeo'), [
                { kind: AccountReadIssueKind.UnresolvablePlan, reason },
            ]);
            expect(notice, reason).toMatch(NOT_MODELED);
        }
    });

    it('says what is wrong and what the user can do for every other issue', () => {
        const key = account('sierra', { accountSize: 123_456 });
        const cases: readonly (readonly [AccountReadIssue, RegExp])[] = [
            [
                {
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason: UnresolvedPlanReason.CorruptOptIns,
                },
                /opt-ins/i,
            ],
            [
                {
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason: UnresolvedPlanReason.AccountSizeMismatch,
                },
                /123456/,
            ],
            [
                {
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason: UnresolvedPlanReason.OptInNotOffered,
                },
                /opt-in/i,
            ],
            [
                { kind: AccountReadIssueKind.CorruptPersonalRules },
                /personal rules/i,
            ],
        ];
        const notices = cases.map(([issue, what]) => {
            const notice = readOnlyAccountNotice(key, [issue]);
            expect(notice, issue.kind).not.toMatch(NOT_MODELED);
            expect(notice, issue.kind).toMatch(what);
            expect(notice, issue.kind).toMatch(/site owner to repair/i);
            if (issue.kind === AccountReadIssueKind.UnresolvablePlan) {
                expect(notice, issue.kind).toMatch(
                    /archive it and add it again as a new account/i,
                );
                expect(notice.search(/site owner/i), issue.kind).toBeLessThan(
                    notice.search(/archive it/i),
                );
            }
            expect(notice, issue.kind).not.toContain('\u{2014}');
            return notice;
        });
        expect(new Set(notices).size).toBe(cases.length);
    });

    it('never advises adding again an account whose plan still resolves, since the ledger would count it twice', () => {
        const notice = readOnlyAccountNotice(account('whiskey'), [
            { kind: AccountReadIssueKind.CorruptPersonalRules },
        ]);
        expect(notice).toMatch(/site owner to repair the stored data/i);
        expect(notice).not.toMatch(/add it again|new account|re-?add/i);
    });

    it('never advises deleting an account without saying its payouts and fees go with it', () => {
        const issues: readonly AccountReadIssue[] = [
            { kind: AccountReadIssueKind.CorruptPersonalRules },
            ...Object.values(UnresolvedPlanReason).map(
                (reason): AccountReadIssue => ({
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason,
                }),
            ),
        ];
        for (const issue of issues) {
            const notice = readOnlyAccountNotice(account('uniform'), [issue]);
            const sentences = notice.split(/(?<=\.)\s+/);
            const archiveAt = sentences.findIndex((sentence) =>
                /archiv/i.test(sentence),
            );
            const deletionSentences = sentences.filter((sentence) =>
                /delet/i.test(sentence),
            );
            expect(archiveAt, issue.kind).toBeGreaterThanOrEqual(0);
            expect(
                sentences.findIndex((sentence) => /delet/i.test(sentence)),
                issue.kind,
            ).toBeGreaterThanOrEqual(archiveAt);
            expect(deletionSentences, issue.kind).not.toEqual([]);
            for (const sentence of deletionSentences) {
                expect(sentence, issue.kind).toMatch(/payouts/i);
                expect(sentence, issue.kind).toMatch(/fees/i);
                expect(sentence, issue.kind).toMatch(/for good|permanently/i);
            }
            expect(notice, issue.kind).toMatch(
                /archiving keeps its payouts and fees in your totals/i,
            );
        }
    });

    it('closes with a sentence that reads on its own after every reason', () => {
        const issues: readonly AccountReadIssue[] = [
            { kind: AccountReadIssueKind.CorruptPersonalRules },
            ...Object.values(UnresolvedPlanReason).map(
                (reason): AccountReadIssue => ({
                    kind: AccountReadIssueKind.UnresolvablePlan,
                    reason,
                }),
            ),
        ];
        for (const issue of issues) {
            const notice = readOnlyAccountNotice(account('victor'), [issue]);
            expect(notice, JSON.stringify(issue)).not.toMatch(
                /\b(until then|after that|then)\b/i,
            );
            expect(notice, JSON.stringify(issue)).toMatch(
                /While it is read-only, the account cannot be edited here and gets no sizing advice\./,
            );
        }
    });

    it('covers every issue of a row with more than one', () => {
        const key = account('tango');
        const notice = readOnlyAccountNotice(key, [
            {
                kind: AccountReadIssueKind.UnresolvablePlan,
                reason: UnresolvedPlanReason.CorruptOptIns,
            },
            { kind: AccountReadIssueKind.CorruptPersonalRules },
        ]);
        expect(notice).toMatch(/opt-ins/i);
        expect(notice).toMatch(/personal rules/i);
    });
});

describe('filterAccountRows', () => {
    it('hides archived accounts unless asked', () => {
        expect(
            ids(filterAccountRows(ROWS, DEFAULT_ACCOUNT_LIST_FILTERS)),
        ).toEqual(['alpha', 'bravo', 'charlie']);
        expect(
            ids(
                filterAccountRows(ROWS, {
                    ...DEFAULT_ACCOUNT_LIST_FILTERS,
                    includeArchived: true,
                }),
            ),
        ).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
    });

    it('filters by firm, stage, status, copy group and tag', () => {
        const base = DEFAULT_ACCOUNT_LIST_FILTERS;
        const topStepKey = modeledFirmKey(FirmId.TopStep);
        expect(
            ids(
                filterAccountRows(ROWS, {
                    ...base,
                    firmKey: topStepKey,
                }),
            ),
        ).toEqual(['bravo']);
        expect(
            ids(
                filterAccountRows(ROWS, {
                    ...base,
                    stage: AccountStage.Funded,
                }),
            ),
        ).toEqual(['bravo', 'charlie']);
        expect(
            ids(
                filterAccountRows(ROWS, {
                    ...base,
                    status: AccountStatus.Busted,
                }),
            ),
        ).toEqual(['charlie']);
        expect(
            ids(filterAccountRows(ROWS, { ...base, copyGroupId: GROUP_A })),
        ).toEqual(['alpha']);
        expect(ids(filterAccountRows(ROWS, { ...base, tag: 'nq' }))).toEqual([
            'alpha',
            'bravo',
        ]);
    });

    it('filters a ledger-only account at one of your firms the same as a listed firm', () => {
        const externalFirmId = '5d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6';
        const rows = buildAccountListRows(
            [
                ledgerAccount('hola-account', {
                    externalFirmId,
                    firmId: null,
                }),
                ledgerAccount('apex-ledger', {
                    externalFirmId: null,
                    firmId: FirmId.Apex,
                }),
            ],
            [],
        );
        const holaKey = externalFirmKey(externalFirmId);
        const apexKey = modeledFirmKey(FirmId.Apex);
        expect(
            ids(
                filterAccountRows(rows, {
                    ...DEFAULT_ACCOUNT_LIST_FILTERS,
                    firmKey: holaKey,
                }),
            ),
        ).toEqual(['hola-account']);
        expect(
            ids(
                filterAccountRows(rows, {
                    ...DEFAULT_ACCOUNT_LIST_FILTERS,
                    firmKey: apexKey,
                }),
            ),
        ).toEqual(['apex-ledger']);
    });

    it('combines filters with AND', () => {
        const apexKey = modeledFirmKey(FirmId.Apex);
        expect(
            ids(
                filterAccountRows(ROWS, {
                    ...DEFAULT_ACCOUNT_LIST_FILTERS,
                    firmKey: apexKey,
                    tag: 'nq',
                }),
            ),
        ).toEqual(['alpha']);
    });

    it('returns nothing when no row matches, without throwing', () => {
        expect(
            filterAccountRows(ROWS, {
                ...DEFAULT_ACCOUNT_LIST_FILTERS,
                tag: 'missing',
            }),
        ).toEqual([]);
        expect(filterAccountRows([], DEFAULT_ACCOUNT_LIST_FILTERS)).toEqual([]);
    });
});

describe('sortAccountRows', () => {
    const active = filterAccountRows(ROWS, {
        ...DEFAULT_ACCOUNT_LIST_FILTERS,
        includeArchived: true,
    });

    it('sorts by label, case-insensitively', () => {
        expect(
            ids(
                sortAccountRows(active, {
                    direction: SortDirection.Ascending,
                    key: AccountSortKey.Label,
                }),
            ),
        ).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
        expect(
            ids(
                sortAccountRows(active, {
                    direction: SortDirection.Descending,
                    key: AccountSortKey.Label,
                }),
            ),
        ).toEqual(['delta', 'charlie', 'bravo', 'alpha']);
    });

    it('sorts by cushion with unknown cushions last in both directions', () => {
        const rows = buildAccountListRows(
            [account('a1'), account('a2'), account('a3'), account('a4')],
            [
                snapshot('a1', '2026-09-24', 5_000_000, 4_900_000),
                snapshot('a2', '2026-09-24', 5_000_000, 4_700_000),
                snapshot('a3', '2026-09-24', 5_000_000, null),
            ],
        );
        expect(
            ids(
                sortAccountRows(rows, {
                    direction: SortDirection.Ascending,
                    key: AccountSortKey.Cushion,
                }),
            ),
        ).toEqual(['a1', 'a2', 'a3', 'a4']);
        expect(
            ids(
                sortAccountRows(rows, {
                    direction: SortDirection.Descending,
                    key: AccountSortKey.Cushion,
                }),
            ),
        ).toEqual(['a2', 'a1', 'a3', 'a4']);
    });

    it('falls back to the label when readiness is unknown', () => {
        expect(
            ids(
                sortAccountRows(active, {
                    direction: SortDirection.Descending,
                    key: AccountSortKey.Readiness,
                }),
            ),
        ).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
    });

    it('does not mutate its input', () => {
        const before = ids(active);
        sortAccountRows(active, {
            direction: SortDirection.Descending,
            key: AccountSortKey.Label,
        });
        expect(ids(active)).toEqual(before);
    });

    it('handles a large list', () => {
        const many = buildAccountListRows(
            Array.from({ length: 10_000 }, (_, index) =>
                account(`acct-${String(index).padStart(5, '0')}`),
            ),
            [],
        );
        const sorted = sortAccountRows(many, {
            direction: SortDirection.Descending,
            key: AccountSortKey.Label,
        });
        expect(sorted[0]?.account.id).toBe('acct-09999');
        expect(sorted).toHaveLength(10_000);
    });
});

describe('accountTagOptions', () => {
    it('lists each tag once, sorted', () => {
        expect(accountTagOptions(ACCOUNTS)).toEqual(['core', 'nq', 'old']);
        expect(accountTagOptions([])).toEqual([]);
    });
});

describe('ACCOUNT_LIST_INPUT', () => {
    it('loads archived accounts too, so the archive toggle never refetches', () => {
        expect(ACCOUNT_LIST_INPUT).toEqual({ includeArchived: true });
    });
});

describe('accountStatusLabel', () => {
    it('labels every status', () => {
        expect(
            Object.values(AccountStatus).map((status) =>
                accountStatusLabel(status),
            ),
        ).toEqual(['Active', 'Busted', 'Closed', 'Concluded', 'Suspended']);
    });
});

describe('unresolvable plan alerts through the portfolio evaluator', () => {
    it('raises one warning per unarchived account whose plan no longer resolves', () => {
        const broken = account('india', {
            label: 'India',
            planSerial: 'apex-50000-retired',
        });
        const alerts = unresolvablePlanAlerts(
            [...ACCOUNTS, broken],
            '2026-09-25',
        );
        expect(alerts).toHaveLength(1);
        const [alert] = alerts;
        expect(alert?.kind).toBe(AlertKind.UnresolvablePlan);
        expect(alert?.severity).toBe(AlertSeverity.Warning);
        expect(alert?.subject).toEqual({
            accountId: 'india',
            kind: AlertSubjectKind.Account,
            label: 'India',
        });
        expect(alert?.message).toContain('read-only');
    });

    it('raises nothing when every plan resolves', () => {
        expect(unresolvablePlanAlerts(ACCOUNTS, '2026-09-25')).toEqual([]);
    });

    it('skips archived accounts', () => {
        const archived = account('juliet', {
            archivedAt: new Date('2026-09-02T00:00:00Z'),
            planSerial: 'apex-50000-retired',
        });
        expect(unresolvablePlanAlerts([archived], '2026-09-25')).toEqual([]);
    });

    it('gives two accounts on the same removed plan distinct keys and names each account', () => {
        const broken = ['kilo', 'lima'].map((id) =>
            account(id, {
                label: id.toUpperCase(),
                planSerial: 'apex-50000-retired',
            }),
        );
        const alerts = unresolvablePlanAlerts(broken, '2026-09-25');
        expect(alerts).toHaveLength(2);
        expect(new Set(alerts.map((alert) => alert.message)).size).toBe(1);
        const views = alerts.map((alert) => alertSubjectView(alert));
        expect(new Set(views.map((view) => view.key)).size).toBe(2);
        expect(views.map((view) => view.label).toSorted(compareText)).toEqual([
            'KILO',
            'LIMA',
        ]);
    });
});

describe('the unused unresolvable-plan helper', () => {
    it('is gone from the module: the overview runs the full alert evaluator instead', () => {
        expect(accountListFilters).not.toHaveProperty('unresolvablePlanAlerts');
    });
});

describe('buildAccountListRows snapshot order', () => {
    it('breaks a tie on the same day and the same creation time by the larger snapshot id', () => {
        const createdAt = new Date('2026-09-24T12:00:00Z');
        const rows = buildAccountListRows(
            [account('echo')],
            [
                snapshot('echo', '2026-09-24', 100, null, createdAt, 'snap-b'),
                snapshot('echo', '2026-09-24', 200, null, createdAt, 'snap-a'),
                snapshot('echo', '2026-09-24', 300, null, createdAt, 'snap-c'),
            ],
        );
        expect(rows[0]?.latestSnapshot?.id).toBe('snap-c');
        expect(rows[0]?.latestSnapshot?.balanceCents).toBe(300);
    });

    it('gives the same latest snapshot whatever order the rows arrive in', () => {
        const createdAt = new Date('2026-09-24T12:00:00Z');
        const entries = [
            snapshot('echo', '2026-09-24', 100, null, createdAt, 'snap-b'),
            snapshot('echo', '2026-09-24', 200, null, createdAt, 'snap-a'),
        ];
        const forward = buildAccountListRows([account('echo')], entries);
        const reversed = buildAccountListRows(
            [account('echo')],
            entries.toReversed(),
        );
        expect(forward[0]?.latestSnapshot?.id).toBe(
            reversed[0]?.latestSnapshot?.id,
        );
    });
});

describe('buildAccountListRows with the cushion and payout readiness boards (F-80, F-81)', () => {
    const asOf = '2026-09-24';

    function cushionRow(
        accountId: string,
        cushionCents: null | number,
    ): CushionBoardRow {
        return {
            accountId,
            asOf,
            cushionCents: cushionCents === null ? null : usdCents(cushionCents),
            floorCents: usdCents(5_000_000),
            ratio: {
                basis: CushionRatioBasis.Funded,
                basisAmount: 250,
                cushion: cushionCents === null ? null : cushionCents / 100,
                floor: 50_000,
                ratio: cushionCents === null ? null : cushionCents / 25_000,
            },
        };
    }

    function eligibleRow(accountId: string): PayoutReadinessEligibleRow {
        return {
            accountId,
            asOf,
            firmMinimumNotice: null,
            kind: PayoutReadinessRowKind.Eligible,
            liveTriggerCoverage: LiveTriggerCoverage.NotChecked,
            requestedAmountCents: usdCents(50_000),
            traderReceivesCents: usdCents(40_000),
        };
    }

    function blockedRow(
        accountId: string,
        overrides: Partial<PayoutReadinessBlockedRow>,
    ): PayoutReadinessBlockedRow {
        return {
            accountId,
            asOf,
            kind: PayoutReadinessRowKind.Blocked,
            pendingAmountCents: null,
            reason: {
                gate: PayoutGate.DayGateNotMet,
                kind: PayoutBlockReasonKind.Gate,
            },
            wait: null,
            ...overrides,
        };
    }

    const boards: AccountListBoards = {
        cushion: {
            rows: [cushionRow('alpha', 12_345), cushionRow('bravo', null)],
            unavailable: [],
        },
        readiness: {
            notApplicable: [
                {
                    accountId: 'delta',
                    notApplicable: {
                        kind: PayoutReadinessNotApplicableKind.NotFunded,
                    },
                },
            ],
            rows: [
                eligibleRow('alpha'),
                blockedRow('bravo', {
                    wait: {
                        basis: PayoutWaitBasis.QualifyingDays,
                        daysStillNeeded: 3,
                    },
                }),
                blockedRow('charlie', {
                    wait: { basis: PayoutWaitBasis.NoClosedForm },
                }),
            ],
        },
    };

    const rows = buildAccountListRows(ACCOUNTS, SNAPSHOTS, boards);
    const byId = new Map(rows.map((row) => [row.account.id, row]));

    it('takes the cushion from the board, not from the dashboard floor on the latest snapshot', () => {
        expect(byId.get('alpha')?.cushionCents).toBe(12_345);
        expect(byId.get('bravo')?.cushionCents).toBeNull();
        expect(byId.get('charlie')?.cushionCents).toBeNull();
        expect(byId.get('delta')?.cushionCents).toBeNull();
    });

    it('ranks readiness in tiers: eligible, waiting with an estimate, then blocked with none', () => {
        expect(byId.get('alpha')?.readiness).toBe(PayoutReadinessTier.Eligible);
        expect(byId.get('bravo')?.readiness).toBe(PayoutReadinessTier.Waiting);
        expect(byId.get('charlie')?.readiness).toBe(
            PayoutReadinessTier.Blocked,
        );
        expect(byId.get('delta')?.readiness).toBeNull();
    });

    it('identifies the readiness tiers by name, so reordering them cannot change a sort', () => {
        expect(
            Object.values(PayoutReadinessTier).toSorted((a, b) =>
                a.localeCompare(b),
            ),
        ).toEqual(['blocked', 'eligible', 'waiting']);
    });

    it('counts a pending payout request as waiting, since it resolves without more profit', () => {
        const pending: AccountListBoards = {
            ...boards,
            readiness: {
                notApplicable: [],
                rows: [
                    blockedRow('alpha', {
                        pendingAmountCents: usdCents(50_000),
                        reason: { kind: PayoutBlockReasonKind.PayoutPending },
                    }),
                ],
            },
        };
        const [first] = buildAccountListRows(ACCOUNTS, SNAPSHOTS, pending);
        expect(first?.readiness).toBe(PayoutReadinessTier.Waiting);
    });

    it('sorts by readiness with the most ready first and unranked rows last', () => {
        expect(
            ids(
                sortAccountRows(rows, {
                    direction: SortDirection.Ascending,
                    key: AccountSortKey.Readiness,
                }),
            ),
        ).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
        expect(
            ids(
                sortAccountRows(rows, {
                    direction: SortDirection.Descending,
                    key: AccountSortKey.Readiness,
                }),
            ),
        ).toEqual(['charlie', 'bravo', 'alpha', 'delta']);
    });

    it('sorts by the board cushion, unknown cushions last', () => {
        expect(
            ids(
                sortAccountRows(rows, {
                    direction: SortDirection.Ascending,
                    key: AccountSortKey.Cushion,
                }),
            ),
        ).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
    });

    it('keeps the snapshot stand-in cushion only while no boards are given', () => {
        const without = buildAccountListRows(ACCOUNTS, SNAPSHOTS);
        expect(
            without.find((row) => row.account.id === 'alpha')?.cushionCents,
        ).toBe(200_000);
        expect(
            without.find((row) => row.account.id === 'alpha')?.readiness,
        ).toBeNull();
    });
});

describe('expected value ordering (F-V18, PT-68)', () => {
    const accounts = [
        account('low', { label: 'Low' }),
        account('high', { label: 'High' }),
        account('unvalued', { label: 'Unvalued' }),
        account('mid-eligible', { label: 'Mid eligible' }),
        account('mid-waiting', { label: 'Mid waiting' }),
        account('mid-blocked', { label: 'Mid blocked' }),
        account('mid-unranked', { label: 'Mid unranked' }),
    ];
    const values = new Map<string, null | number>([
        ['high', 4000],
        ['low', 100],
        ['mid-blocked', 900],
        ['mid-eligible', 900],
        ['mid-unranked', 900],
        ['mid-waiting', 900],
        ['unvalued', null],
    ]);
    const tiers: Readonly<Record<string, PayoutReadinessTier>> = {
        'mid-blocked': PayoutReadinessTier.Blocked,
        'mid-eligible': PayoutReadinessTier.Eligible,
        'mid-waiting': PayoutReadinessTier.Waiting,
    };
    const rows = buildAccountListRows(accounts, [], null, values).map(
        (row) => ({ ...row, readiness: tiers[row.account.id] ?? null }),
    );

    it('carries the credit-free expected value on each row, null when none is known', () => {
        const byId = new Map(rows.map((row) => [row.account.id, row]));
        expect(byId.get('high')?.expectedValueDollars).toBe(4000);
        expect(byId.get('unvalued')?.expectedValueDollars).toBeNull();
        const without = buildAccountListRows(accounts, []);
        expect(without.every((row) => row.expectedValueDollars === null)).toBe(
            true,
        );
    });

    it('orders by expected value, highest first, with unvalued accounts last', () => {
        expect(
            ids(
                sortAccountRows(rows, {
                    direction: SortDirection.Descending,
                    key: AccountSortKey.ExpectedValue,
                }),
            ),
        ).toEqual([
            'high',
            'mid-eligible',
            'mid-waiting',
            'mid-blocked',
            'mid-unranked',
            'low',
            'unvalued',
        ]);
    });

    it('breaks a tie on expected value by readiness, most ready first, in both directions', () => {
        const ascending = ids(
            sortAccountRows(rows, {
                direction: SortDirection.Ascending,
                key: AccountSortKey.ExpectedValue,
            }),
        );
        expect(ascending).toEqual([
            'low',
            'mid-eligible',
            'mid-waiting',
            'mid-blocked',
            'mid-unranked',
            'high',
            'unvalued',
        ]);
    });

    it('breaks a remaining tie by label', () => {
        const tied = buildAccountListRows(
            [
                account('b', { label: 'Bravo' }),
                account('a', { label: 'alpha' }),
            ],
            [],
            null,
            new Map([
                ['a', 50],
                ['b', 50],
            ]),
        );
        expect(
            ids(
                sortAccountRows(tied, {
                    direction: SortDirection.Descending,
                    key: AccountSortKey.ExpectedValue,
                }),
            ),
        ).toEqual(['a', 'b']);
    });

    it('lists accounts by expected value, highest first, by default', () => {
        expect(DEFAULT_ACCOUNT_LIST_SORT).toEqual({
            direction: SortDirection.Descending,
            key: AccountSortKey.ExpectedValue,
        });
        expect(ids(sortAccountRows(rows, DEFAULT_ACCOUNT_LIST_SORT))[0]).toBe(
            'high',
        );
    });

    it('does not mutate its input', () => {
        const before = ids(rows);
        sortAccountRows(rows, {
            direction: SortDirection.Descending,
            key: AccountSortKey.ExpectedValue,
        });
        expect(ids(rows)).toEqual(before);
    });
});

function portfolioAlert(
    accountIds: readonly string[],
    message: string,
    kind = AlertKind.LargeDayLoss,
) {
    return {
        disclosures: [],
        kind,
        message,
        severity: AlertSeverity.Warning,
        subject: { accountIds, kind: AlertSubjectKind.Portfolio },
    } as const;
}

describe('alertSubjectView keys for portfolio alerts (PT-69b)', () => {
    it('gives two same-kind portfolio alerts over different accounts distinct keys', () => {
        const first = portfolioAlert(['alpha', 'bravo'], 'one');
        const second = portfolioAlert(['charlie'], 'one');
        expect(alertSubjectView(first).key).not.toBe(
            alertSubjectView(second).key,
        );
    });

    it('gives two same-kind portfolio alerts over the same accounts distinct keys when their messages differ', () => {
        const first = portfolioAlert(['alpha', 'bravo'], 'by count');
        const second = portfolioAlert(['alpha', 'bravo'], 'by share');
        expect(alertSubjectView(first).key).not.toBe(
            alertSubjectView(second).key,
        );
    });

    it('keeps a portfolio key stable when the same accounts are listed in another order', () => {
        const first = portfolioAlert(['alpha', 'bravo'], 'same');
        const second = portfolioAlert(['bravo', 'alpha'], 'same');
        expect(alertSubjectView(first).key).toBe(alertSubjectView(second).key);
    });

    it('gives portfolio alerts of different kinds distinct keys and keeps the Portfolio label', () => {
        const first = portfolioAlert(['alpha'], 'same');
        const second = portfolioAlert(
            ['alpha'],
            'same',
            AlertKind.ConcentratedFirmProfit,
        );
        expect(alertSubjectView(first).key).not.toBe(
            alertSubjectView(second).key,
        );
        expect(alertSubjectView(first).label).toBe('Portfolio');
    });
});
