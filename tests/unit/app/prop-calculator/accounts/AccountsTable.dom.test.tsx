import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountListBoards } from '~/app/(app)/prop-calculator/accounts/_components/accountListFilters';
import type * as UseAccountValuesModule from '~/app/(app)/prop-calculator/accounts/_components/useAccountValues';
import type { AccountValues } from '~/app/(app)/prop-calculator/accounts/_components/useAccountValues';

import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    PayoutReadinessRowKind,
    usdCents,
} from '~/lib/prop-accounts';
import { ALL_FIRMS, PayoutGate, serializePlanId } from '~/lib/prop-calculator';
import {
    LiveTriggerCoverage,
    PayoutBlockReasonKind,
    PayoutWaitBasis,
} from '~/lib/prop-calculator/advisor';
import { routes } from '~/lib/site/routes';

import { AccountsTable } from './AccountsTableWithData';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const ALPHA_ID = '0b6f3c1e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';
const BRAVO_ID = '5b0c3f7e-8a51-4c4e-9f0a-3d0f1c2b4a61';

const harness = vi.hoisted(() => {
    const emptyValues: AccountValues = {
        boards: null,
        columns: new Map(),
        notice: null,
    };
    const queries = new Map<string, FakeQuery>();
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    return {
        mutation: () => ({
            useMutation: () => ({ isPending: false, mutate: vi.fn() }),
        }),
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
        values: emptyValues,
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/useAccountValues',
    async (importOriginal) => ({
        ...(await importOriginal<typeof UseAccountValuesModule>()),
        useAccountValuesWithEngine: () => ({ values: harness.values }),
    }),
);

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: {
                archive: harness.mutation(),
                list: harness.query('account.list'),
                remove: harness.mutation(),
                unarchive: harness.mutation(),
            },
            copyGroup: { list: harness.query('copyGroup.list') },
            externalFirm: { list: harness.query('externalFirm.list') },
            snapshot: {
                latestTwoForAll: harness.query('snapshot.latestTwoForAll'),
            },
        },
        useUtils: () => ({
            propAccounts: {
                account: { get: { cancel: vi.fn() }, invalidate: vi.fn() },
                invalidate: vi.fn(),
            },
        }),
    },
}));

const PLAN = ALL_FIRMS.flatMap((firm) => firm.plans)[0];

function account(id: string, label: string, planSerial?: string) {
    if (PLAN === undefined) throw new Error('no plan');
    return {
        accountSize: PLAN.id.accountSize,
        archivedAt: null,
        copyGroupId: null,
        externalFirmId: null,
        firmId: PLAN.id.firm,
        fundedOn: null,
        id,
        label,
        notes: null,
        optIns: {},
        planLabel: null,
        planSerial: planSerial ?? serializePlanId(PLAN.id),
        purchasedOn: '2026-09-01',
        readIssues: [],
        replacesAccountId: null,
        stage: PLAN.isInstantFunded ? AccountStage.Funded : AccountStage.Eval,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        userId: 'user-a',
    };
}

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function element(scope: ParentNode, selector: string): HTMLElement {
    const found = scope.querySelector<HTMLElement>(selector);
    if (found === null) throw new Error(`nothing matches ${selector}`);
    return found;
}

function ledgerAccount(id: string, label: string, externalFirmId: string) {
    return {
        accountSize: 150_000,
        archivedAt: null,
        copyGroupId: null,
        externalFirmId,
        firmId: null,
        fundedOn: null,
        id,
        label,
        notes: null,
        optIns: {},
        planLabel: 'Hola 150K',
        planSerial: null,
        purchasedOn: '2026-09-01',
        readIssues: [],
        replacesAccountId: null,
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.LedgerOnly,
        userId: 'user-a',
    };
}

function offeredOptionTexts(): readonly string[] {
    return [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
        (option) => option.textContent.trim(),
    );
}

async function openListbox(trigger: HTMLElement) {
    await act(async () => {
        trigger.focus();
        trigger.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
        );
    });
}

async function pickOption(trigger: HTMLElement, optionText: string) {
    await openListbox(trigger);
    const option = [
        ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((candidate) => candidate.textContent.trim() === optionText);
    if (option === undefined) throw new Error(`no option ${optionText}`);
    await act(async () => {
        option.focus();
        option.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
        );
    });
}

const byText = (left: string, right: string) => left.localeCompare(right);

function rowLabelsOf(scope: ParentNode): readonly string[] {
    return rowsOf(scope).map(
        (row) => row.querySelector('a')?.textContent.trim() ?? '',
    );
}

function rowOf(scope: ParentNode, label: string): HTMLTableRowElement {
    const row = rowsOf(scope).find(
        (candidate) => candidate.querySelector('a')?.textContent === label,
    );
    if (row === undefined) throw new Error(`no row for ${label}`);
    return row;
}

function rowsOf(scope: ParentNode): readonly HTMLTableRowElement[] {
    return [...scope.querySelectorAll<HTMLTableRowElement>(':scope tbody tr')];
}

function snapshotOf(accountId: string, balance: number, floor: number) {
    return {
        accountId,
        asOf: '2026-09-24',
        balanceCents: balance,
        createdAt: new Date('2026-09-24T12:00:00Z'),
        dashboardFloorCents: floor,
        id: `snapshot-${accountId}`,
    };
}

function taggedAccount(id: string, label: string, tags: readonly string[]) {
    return { ...account(id, label), tags };
}

function toggleDirection(scope: ParentNode) {
    const button = [...scope.querySelectorAll('button')].find(
        (candidate) =>
            candidate.getAttribute('aria-label')?.startsWith('Sorted ') ===
            true,
    );
    if (button === undefined) throw new Error('no direction button');
    act(() => {
        button.click();
    });
}

describe('AccountsTable', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<AccountsTable />);
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
        harness.values = { boards: null, columns: new Map(), notice: null };
        harness.queries.set('copyGroup.list', answer([]));
        harness.queries.set('snapshot.latestTwoForAll', answer([]));
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('links each account label to its detail page', () => {
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha'), account(BRAVO_ID, 'Bravo')]),
        );
        render();
        for (const [id, label] of [
            [ALPHA_ID, 'Alpha'],
            [BRAVO_ID, 'Bravo'],
        ] as const) {
            const link = container.querySelector<HTMLAnchorElement>(
                `a[href="${CSS.escape(routes.propCalculator.accounts.detail(id))}"]`,
            );
            expect(link?.textContent).toBe(label);
        }
    });

    it('keeps the read-only marker on the row without repeating the overview unresolvable plan alert as a banner', () => {
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha', 'no-such-plan')]),
        );
        render();
        expect(container.textContent).toContain('Read-only.');
        expect(container.textContent).not.toContain('Read-only account: Alpha');
        expect(container.querySelectorAll('[role="alert"]')).toHaveLength(0);
    });

    it('keeps the table and shows the error beside it when a refetch of the accounts fails', () => {
        harness.queries.set('account.list', {
            data: [account(ALPHA_ID, 'Alpha')],
            error: new Error('Failed to fetch'),
            isError: true,
            isPending: false,
        });
        render();
        expect(container.querySelector('table')).not.toBeNull();
        expect(container.textContent).toContain('Alpha');
        expect(container.textContent).toContain(
            'The accounts could not be refreshed',
        );
        expect(container.textContent).toContain('Failed to fetch');
    });

    it('shows only the error when the accounts never loaded', () => {
        harness.queries.set('account.list', {
            data: undefined,
            error: new Error('Failed to fetch'),
            isError: true,
            isPending: false,
        });
        render();
        expect(container.querySelector('table')).toBeNull();
        expect(container.textContent).toContain(
            'The accounts could not be loaded',
        );
    });

    it('offers each firm you added in the firm filter', async () => {
        const externalFirmId = '5d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6';
        harness.queries.set(
            'externalFirm.list',
            answer([{ id: externalFirmId, name: 'Hola Prime' }]),
        );
        harness.queries.set(
            'account.list',
            answer([account(ALPHA_ID, 'Alpha')]),
        );
        render();
        const trigger = element(container, '#accounts-filter-firm');
        await openListbox(trigger);
        expect(offeredOptionTexts()).toContain('Hola Prime');
    });

    it('filters ledger-only accounts at a firm you added the same as a listed firm', async () => {
        const externalFirmId = '5d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6';
        harness.queries.set(
            'externalFirm.list',
            answer([{ id: externalFirmId, name: 'Hola Prime' }]),
        );
        harness.queries.set(
            'account.list',
            answer([
                account(ALPHA_ID, 'Alpha'),
                ledgerAccount(BRAVO_ID, 'Bravo', externalFirmId),
            ]),
        );
        render();
        const trigger = element(container, '#accounts-filter-firm');
        await pickOption(trigger, 'Hola Prime');
        expect(container.textContent).toContain('Bravo');
        expect(container.textContent).not.toContain('Alpha');
    });

    it('filters to an account whose tag is the text all instead of clearing the filter, and clears it through the All option (F-58)', async () => {
        harness.queries.set(
            'account.list',
            answer([
                taggedAccount(ALPHA_ID, 'Alpha', ['all']),
                taggedAccount(BRAVO_ID, 'Bravo', ['swing']),
            ]),
        );
        render();
        const trigger = element(container, '#accounts-filter-tag');
        await openListbox(trigger);
        expect(offeredOptionTexts()).toEqual(['All', 'all', 'swing']);
        await pickOption(trigger, 'all');
        expect(rowLabelsOf(container)).toEqual(['Alpha']);
        await pickOption(trigger, 'All');
        expect(rowLabelsOf(container).toSorted(byText)).toEqual([
            'Alpha',
            'Bravo',
        ]);
    });

    describe('the list rows and filters through the DOM (F-58)', () => {
        it('shows tags as badges and the notes as a clamped line on the row', () => {
            harness.queries.set(
                'account.list',
                answer([
                    {
                        ...account(ALPHA_ID, 'Alpha'),
                        notes: 'Check the payout on Monday',
                        tags: ['swing', 'apex'],
                    },
                    account(BRAVO_ID, 'Bravo'),
                ]),
            );
            render();
            const alphaRow = rowOf(container, 'Alpha');
            const bravoRow = rowOf(container, 'Bravo');
            const badges = [...alphaRow.querySelectorAll('div')]
                .filter((badge) => badge.children.length === 0)
                .map((badge) => badge.textContent.trim())
                .filter((text) => text === 'swing' || text === 'apex');
            expect(badges.toSorted(byText)).toEqual(['apex', 'swing']);
            const notes = alphaRow.querySelector('p.line-clamp-2');
            expect(notes?.textContent).toBe('Check the payout on Monday');
            expect(bravoRow.querySelector('p.line-clamp-2')).toBeNull();
            expect(bravoRow.textContent).not.toContain('swing');
        });

        it('hides archived accounts until the archive switch is on, then shows them marked', () => {
            harness.queries.set(
                'account.list',
                answer([
                    account(ALPHA_ID, 'Alpha'),
                    {
                        ...account(BRAVO_ID, 'Bravo'),
                        archivedAt: new Date('2026-09-10T00:00:00Z'),
                    },
                ]),
            );
            render();
            expect(rowLabelsOf(container)).toEqual(['Alpha']);
            act(() => {
                element(container, '#accounts-show-archived').click();
            });
            expect(rowLabelsOf(container).toSorted(byText)).toEqual([
                'Alpha',
                'Bravo',
            ]);
            const bravoRow = rowOf(container, 'Bravo');
            expect(bravoRow.textContent).toContain('Archived');
        });

        it('filters by stage', async () => {
            harness.queries.set(
                'account.list',
                answer([
                    { ...account(ALPHA_ID, 'Alpha'), stage: AccountStage.Eval },
                    {
                        ...account(BRAVO_ID, 'Bravo'),
                        stage: AccountStage.Funded,
                    },
                ]),
            );
            render();
            await pickOption(
                element(container, '#accounts-filter-stage'),
                'Funded',
            );
            expect(rowLabelsOf(container)).toEqual(['Bravo']);
        });

        it('filters by status', async () => {
            harness.queries.set(
                'account.list',
                answer([
                    account(ALPHA_ID, 'Alpha'),
                    {
                        ...account(BRAVO_ID, 'Bravo'),
                        status: AccountStatus.Busted,
                    },
                ]),
            );
            render();
            await pickOption(
                element(container, '#accounts-filter-status'),
                'Busted',
            );
            expect(rowLabelsOf(container)).toEqual(['Bravo']);
        });

        it('filters by copy group and names the group on the row', async () => {
            const groupId = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
            harness.queries.set(
                'copyGroup.list',
                answer([{ id: groupId, name: 'Morning group' }]),
            );
            harness.queries.set(
                'account.list',
                answer([
                    account(ALPHA_ID, 'Alpha'),
                    { ...account(BRAVO_ID, 'Bravo'), copyGroupId: groupId },
                ]),
            );
            render();
            await pickOption(
                element(container, '#accounts-filter-group'),
                'Morning group',
            );
            expect(rowLabelsOf(container)).toEqual(['Bravo']);
            expect(rowOf(container, 'Bravo').textContent).toContain(
                'Morning group',
            );
        });
    });

    describe('the sorts through the DOM (F-58)', () => {
        const CHARLIE_ID = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';

        function threeAccounts() {
            harness.queries.set(
                'account.list',
                answer([
                    account(ALPHA_ID, 'Alpha'),
                    account(BRAVO_ID, 'Bravo'),
                    account(CHARLIE_ID, 'Charlie'),
                ]),
            );
        }

        it('sorts by label A to Z in one direction and the exact reverse in the other', async () => {
            threeAccounts();
            render();
            await pickOption(element(container, '#accounts-sort'), 'Label');
            const beforeToggle = rowLabelsOf(container);
            toggleDirection(container);
            const afterToggle = rowLabelsOf(container);
            expect(beforeToggle).not.toEqual(afterToggle);
            expect(beforeToggle).toEqual(afterToggle.toReversed());
            expect([beforeToggle, afterToggle]).toContainEqual([
                'Alpha',
                'Bravo',
                'Charlie',
            ]);
        });

        it('sorts by cushion, the largest first, with an unknown cushion last', async () => {
            threeAccounts();
            harness.queries.set(
                'snapshot.latestTwoForAll',
                answer([
                    snapshotOf(ALPHA_ID, 5_200_000, 5_000_000),
                    snapshotOf(CHARLIE_ID, 5_900_000, 5_000_000),
                ]),
            );
            render();
            await pickOption(element(container, '#accounts-sort'), 'Cushion');
            expect(rowLabelsOf(container)).toEqual([
                'Charlie',
                'Alpha',
                'Bravo',
            ]);
            toggleDirection(container);
            expect(rowLabelsOf(container)).toEqual([
                'Alpha',
                'Charlie',
                'Bravo',
            ]);
        });

        it('sorts by payout readiness from the boards, the eligible and the no-closed-form rows at opposite ends in either direction', async () => {
            threeAccounts();
            const asOf = '2026-09-24';
            const boards: AccountListBoards = {
                cushion: { rows: [], unavailable: [] },
                readiness: {
                    notApplicable: [],
                    rows: [
                        {
                            accountId: ALPHA_ID,
                            asOf,
                            kind: PayoutReadinessRowKind.Blocked,
                            pendingAmountCents: null,
                            reason: {
                                gate: PayoutGate.DayGateNotMet,
                                kind: PayoutBlockReasonKind.Gate,
                            },
                            wait: { basis: PayoutWaitBasis.NoClosedForm },
                        },
                        {
                            accountId: BRAVO_ID,
                            asOf,
                            firmMinimumNotice: null,
                            kind: PayoutReadinessRowKind.Eligible,
                            liveTriggerCoverage: LiveTriggerCoverage.NotChecked,
                            requestedAmountCents: usdCents(50_000),
                            traderReceivesCents: usdCents(40_000),
                        },
                        {
                            accountId: CHARLIE_ID,
                            asOf,
                            kind: PayoutReadinessRowKind.Blocked,
                            pendingAmountCents: null,
                            reason: {
                                gate: PayoutGate.DayGateNotMet,
                                kind: PayoutBlockReasonKind.Gate,
                            },
                            wait: {
                                basis: PayoutWaitBasis.QualifyingDays,
                                daysStillNeeded: 3,
                            },
                        },
                    ],
                },
            };
            harness.values = { boards, columns: new Map(), notice: null };
            render();
            await pickOption(
                element(container, '#accounts-sort'),
                'Payout readiness',
            );
            const beforeToggle = rowLabelsOf(container);
            toggleDirection(container);
            const afterToggle = rowLabelsOf(container);
            expect(beforeToggle).toEqual(afterToggle.toReversed());
            expect([beforeToggle, afterToggle]).toContainEqual([
                'Bravo',
                'Charlie',
                'Alpha',
            ]);
            expect([beforeToggle, afterToggle]).toContainEqual([
                'Alpha',
                'Charlie',
                'Bravo',
            ]);
        });
    });
});
