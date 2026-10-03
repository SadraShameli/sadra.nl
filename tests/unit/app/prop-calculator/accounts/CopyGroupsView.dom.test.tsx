import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type CopyGroupAccount,
    copyGroupRows,
} from '~/app/(app)/prop-calculator/accounts/_components/copyGroups/copyGroupRows';
import {
    type OverviewAccountRow,
    type OverviewSnapshotRow,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    bindingMemberIdsOf,
    copyGroupSizingSectionsOf,
} from '~/app/(app)/prop-calculator/accounts/copy-groups/copyGroupSizingModel';
import { CopyGroupsView } from '~/app/(app)/prop-calculator/accounts/copy-groups/CopyGroupsView';
import {
    GroupSizingSection,
    GroupSizingViewKind,
} from '~/app/(app)/prop-calculator/accounts/copy-groups/GroupSizingSection';
import { formatCurrency, formatPercent } from '~/lib/format';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    describeUnresolvedPlan,
    UnresolvedPlanReason,
    usdCents,
} from '~/lib/prop-accounts';
import {
    ALL_FIRMS,
    CENTS_PER_DOLLAR,
    findFirm,
    FirmId,
    MffuVariant,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    CopyGroupSizingResultKind,
    DEFAULT_RULEBOOK,
    SIZING_ASSUMPTION_TEXT,
    SIZING_CONSTRAINT_TEXT,
} from '~/lib/prop-calculator/advisor';
import {
    PropLimitRejection,
    PropMutationRejection,
    PropQuota,
    PropRecord,
    type PropRejection,
} from '~/lib/schemas/propAccountOutputs';
import { MAX_ACCOUNT_LABEL_LENGTH } from '~/lib/schemas/propAccounts';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

interface MutationCallbacks {
    onError?: (error: Error, input: unknown) => unknown;
    onSuccess?: (data: unknown, input: unknown) => unknown;
}

const harness = await vi.hoisted(async () => {
    const { useSyncExternalStore } = await import('react');
    const queries = new Map<string, FakeQuery>();
    const outcomes = new Map<string, unknown>();
    const calls: [string, unknown][] = [];
    const held = new Set<string>();
    const pendingNames = new Set<string>();
    const listeners = new Set<() => void>();
    const releases: (() => Promise<void>)[] = [];
    const invalidate = vi.fn(() => Promise.resolve());
    const toastError = vi.fn();
    const toastSuccess = vi.fn();
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    const setPending = (name: string, isPending: boolean) => {
        if (pendingNames.has(name) === isPending) return;
        if (isPending) {
            pendingNames.add(name);
        } else {
            pendingNames.delete(name);
        }
        for (const listener of listeners) listener();
    };
    const subscribe = (listener: () => void) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    };
    return {
        calls,
        held,
        invalidate,
        mutation: (name: string) => ({
            useMutation: (options: MutationCallbacks = {}) => ({
                isPending: useSyncExternalStore(subscribe, () =>
                    pendingNames.has(name),
                ),
                mutate: (input: unknown) => {
                    calls.push([name, input]);
                    const finish = async () => {
                        const outcome = outcomes.get(name);
                        await (outcome instanceof Error
                            ? options.onError?.(outcome, input)
                            : options.onSuccess?.(outcome, input));
                        setPending(name, false);
                    };
                    if (held.has(name)) {
                        setPending(name, true);
                        releases.push(finish);
                    } else {
                        void finish();
                    }
                },
            }),
        }),
        outcomes,
        pendingNames,
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
        releases,
        toastError,
        toastSuccess,
    };
});

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts/copy-groups',
    useRouter: () => ({ replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: { list: harness.query('account.list') },
            copyGroup: {
                assign: harness.mutation('copyGroup.assign'),
                create: harness.mutation('copyGroup.create'),
                list: harness.query('copyGroup.list'),
                remove: harness.mutation('copyGroup.remove'),
                update: harness.mutation('copyGroup.update'),
            },
            event: { list: harness.query('event.list') },
            payout: { list: harness.query('payout.list') },
            rulebook: { get: harness.query('rulebook.get') },
            snapshot: { latestForAll: harness.query('snapshot.latestForAll') },
        },
        useUtils: () => ({
            propAccounts: { invalidate: harness.invalidate },
        }),
    },
}));

vi.mock('sonner', () => ({
    toast: { error: harness.toastError, success: harness.toastSuccess },
}));

class StubWorker {
    static instances: StubWorker[] = [];
    addEventListener = vi.fn();
    postMessage = vi.fn<(message: unknown) => void>();
    terminate = vi.fn();

    constructor() {
        StubWorker.instances.push(this);
    }
}

const FIRM = firstModeledFirm();
const USER_ID = 'user-a';
const TODAY = '2026-09-26';

const MAIN = {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Main copy',
    notes: null,
};
const SPARE = {
    id: '30000000-0000-4000-8000-000000000002',
    name: 'Spare',
    notes: 'weekend only',
};

function mixedMessage(existing: string, joining: string): string {
    return `Copy group "Main copy" would mix Evaluation and Funded accounts: it already has ${existing} members and the account joining is ${joining}. The members of a group must share one stage, inactive and archived members included.`;
}

const ARCHIVED_AT = new Date('2026-09-01T00:00:00Z');

function account(
    id: string,
    overrides: Partial<CopyGroupAccount> = {},
): CopyGroupAccount {
    return {
        archivedAt: null,
        copyGroupId: null,
        externalFirmId: null,
        firmId: FIRM.id,
        id,
        label: id,
        planLabel: null,
        planSerial: 'copy-group-plan',
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tracking: AccountTracking.Modeled,
        ...overrides,
    };
}

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function mffProPlan() {
    const firm = findFirm(FirmId.Mffu);
    if (firm === undefined) throw new Error('MFF firm missing');
    const plan = firm.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (plan === undefined) throw new Error('no MFF Pro 50K plan');
    return plan;
}

const SIZING_PLAN = mffProPlan();
const DOCUMENTED_FUNDED_RISK =
    DEFAULT_RULEBOOK.funded.riskCents / CENTS_PER_DOLLAR;
const SIZING_PEAK = SIZING_PLAN.accountSize + 20_000;
const SIZING_THRESHOLD = SIZING_PEAK - SIZING_PLAN.fundedDrawdown.amount;

function answerWith(
    groups: readonly (typeof MAIN | typeof SPARE)[],
    accounts: readonly CopyGroupAccount[],
) {
    harness.queries.set('copyGroup.list', answer(groups));
    harness.queries.set('account.list', answer(accounts));
}

function button(name: string, scope: ParentNode = document): HTMLButtonElement {
    const found = [...scope.querySelectorAll('button')].find(
        (candidate) =>
            (candidate.getAttribute('aria-label') ??
                candidate.textContent.trim()) === name,
    );
    if (found === undefined) throw new Error(`no button named ${name}`);
    return found;
}

function callsTo(name: string): unknown[] {
    return harness.calls
        .filter(([called]) => called === name)
        .map(([, input]) => input);
}

function click(target: HTMLButtonElement) {
    act(() => {
        target.focus();
        target.click();
    });
}

function errorOf(control: HTMLElement): string | undefined {
    const id = control.getAttribute('aria-describedby') ?? '';
    return id === ''
        ? undefined
        : document.querySelector(`#${CSS.escape(id)}`)?.textContent;
}

function evalSizingAccount(id: string) {
    return sizingAccount(id, MAIN.id, {
        firstFundedTradeOn: null,
        fundedOn: null,
        stage: AccountStage.Eval,
    });
}

function field(label: string): HTMLInputElement | HTMLSelectElement {
    const labelElement = [...document.querySelectorAll('label')].find(
        (candidate) => candidate.textContent.trim() === label,
    );
    const control =
        labelElement === undefined
            ? null
            : document.querySelector(`#${CSS.escape(labelElement.htmlFor)}`);
    if (
        !(control instanceof HTMLInputElement) &&
        !(control instanceof HTMLSelectElement)
    ) {
        throw new TypeError(`no control labelled ${label}`);
    }
    return control;
}

function firstModeledFirm() {
    const [firm] = ALL_FIRMS;
    if (firm === undefined) throw new Error('a modeled firm is needed');
    return firm;
}

async function flush() {
    await act(async () => {
        await Promise.resolve();
    });
}

function groupHeading(name: string): HTMLHeadingElement {
    const heading = [...document.querySelectorAll('h2')].find(
        (candidate) => candidate.textContent === name,
    );
    if (heading === undefined) throw new Error(`no heading ${name}`);
    return heading;
}

function groupSection(name: string): HTMLElement {
    const section = [
        ...document.querySelectorAll<HTMLElement>('section[aria-labelledby]'),
    ].find(
        (candidate) =>
            document.querySelector(
                `#${CSS.escape(candidate.getAttribute('aria-labelledby') ?? '')}`,
            )?.textContent === name,
    );
    if (section === undefined) throw new Error(`no section ${name}`);
    return section;
}

function rejection(overrides: Partial<PropRejection>): PropRejection {
    return {
        lifecycleRejection: null,
        limit: null,
        quota: null,
        reason: PropMutationRejection.MixedStageCopyGroup,
        record: null,
        recordId: null,
        ...overrides,
    };
}

function rejectionError(message: string, propRejection: PropRejection): Error {
    return Object.assign(new Error(message), { data: { propRejection } });
}

function releaseHeld() {
    act(() => {
        for (const release of harness.releases.splice(0)) void release();
    });
}

async function settle() {
    await act(async () => {
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    });
}

function sizingAccount(
    id: string,
    groupId: string,
    overrides: Record<string, unknown> = {},
) {
    return {
        accountSize: SIZING_PLAN.accountSize,
        archivedAt: null,
        copyGroupId: groupId,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: SIZING_PLAN.id.firm,
        firstFundedTradeOn: '2026-08-01',
        fundedOn: '2026-08-01',
        id,
        label: id,
        liveStartBalanceCents: null,
        notes: null,
        optIns: {},
        personalRules: {},
        planLabel: null,
        planSerial: serializePlanId(SIZING_PLAN.id),
        purchasedOn: '2026-07-01',
        readIssues: [],
        replacesAccountId: null,
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        userId: USER_ID,
        ...overrides,
    } as unknown as CopyGroupAccount & OverviewAccountRow;
}

function sizingSnapshot(
    accountId: string,
    balanceCents: number,
    overrides: Record<string, unknown> = {},
) {
    return {
        accountId,
        asOf: TODAY,
        balanceAtLastPayoutCents: null,
        balanceCents: usdCents(balanceCents),
        createdAt: new Date(`${TODAY}T00:00:00Z`),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: usdCents(Math.round(SIZING_PEAK * 100)),
        highestIntradayBalanceCents: null,
        id: `${accountId}-snapshot`,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: null,
        tradingDays: 20,
        userId: USER_ID,
        ...overrides,
    } as unknown as OverviewSnapshotRow;
}

function suspendedSizingAccount(id: string, groupId: string) {
    return sizingAccount(id, groupId, { status: AccountStatus.Suspended });
}

function typeInto(input: HTMLInputElement | HTMLSelectElement, text: string) {
    act(() => {
        const prototype =
            input instanceof HTMLSelectElement
                ? HTMLSelectElement.prototype
                : HTMLInputElement.prototype;
        Reflect.set(prototype, 'value', text, input);
        input.dispatchEvent(
            new Event(input instanceof HTMLSelectElement ? 'change' : 'input', {
                bubbles: true,
            }),
        );
    });
}

describe('CopyGroupsView', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render() {
        act(() => {
            root.render(<CopyGroupsView userId={USER_ID} />);
        });
    }

    beforeEach(() => {
        vi.useFakeTimers({
            now: new Date(`${TODAY}T12:00:00Z`),
            toFake: ['Date'],
        });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        StubWorker.instances = [];
        harness.queries.clear();
        harness.outcomes.clear();
        harness.calls.length = 0;
        harness.held.clear();
        harness.pendingNames.clear();
        harness.releases.length = 0;
        harness.invalidate.mockClear();
        harness.toastError.mockClear();
        harness.toastSuccess.mockClear();
        harness.queries.set('event.list', answer([]));
        harness.queries.set('payout.list', answer([]));
        harness.queries.set('rulebook.get', answer(DEFAULT_RULEBOOK));
        harness.queries.set('snapshot.latestForAll', answer([]));
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('renders one h1 and an h2 per group with its members, stages and firms', () => {
        answerWith(
            [MAIN, SPARE],
            [
                account('funded-a', { copyGroupId: MAIN.id }),
                account('funded-b', { copyGroupId: MAIN.id }),
                account('loose-eval', { stage: AccountStage.Eval }),
            ],
        );
        render();
        expect(container.querySelectorAll('h1')).toHaveLength(1);
        expect(container.querySelector('h1')?.textContent).toBe('Copy groups');
        const h2s = [...container.querySelectorAll('h2')].map(
            (heading) => heading.textContent,
        );
        expect(h2s).toEqual(expect.arrayContaining(['Main copy', 'Spare']));
        const main = groupSection('Main copy');
        expect(main.textContent).toContain('funded-a');
        expect(main.textContent).toContain('funded-b');
        expect(main.textContent).toContain('2 Funded');
        expect(main.textContent).toContain(FIRM.displayName);
        expect(groupSection('Spare').textContent).toContain('weekend only');
        expect(groupSection('Spare').textContent).toContain(
            'No active members',
        );
        expect(groupSection('Accounts not in a group').textContent).toContain(
            'loose-eval',
        );
    });

    it('states the one-stage rule the server enforces, inactive and archived members included', () => {
        answerWith([], []);
        render();
        const intro =
            container.querySelector(':scope header p')?.textContent ?? '';
        expect(intro).toContain('Every member of a group must be in one stage');
        expect(intro).toContain('inactive and archived members included');
    });

    it('tells the trader to take the other-stage accounts off the copier now for an eval and funded group', () => {
        answerWith(
            [MAIN],
            [
                account('funded-a', { copyGroupId: MAIN.id }),
                account('eval-a', {
                    copyGroupId: MAIN.id,
                    stage: AccountStage.Eval,
                }),
                account('eval-b', {
                    copyGroupId: MAIN.id,
                    stage: AccountStage.Eval,
                }),
            ],
        );
        render();
        const warning =
            groupSection('Main copy').querySelector('[role="alert"]')
                ?.textContent ?? '';
        expect(warning).toContain('Evaluation: eval-a, eval-b');
        expect(warning).toContain('Funded: funded-a');
        expect(warning).toContain('off the copier now');
        expect(warning).not.toMatch(/wait/i);
        expect(warning).not.toMatch(/reach the same stage/i);
    });

    it('never suggests waiting for a funded and live group to converge', () => {
        answerWith(
            [MAIN],
            [
                account('funded-a', { copyGroupId: MAIN.id }),
                account('live-a', {
                    copyGroupId: MAIN.id,
                    stage: AccountStage.Live,
                }),
            ],
        );
        render();
        const warning =
            groupSection('Main copy').querySelector('[role="alert"]')
                ?.textContent ?? '';
        expect(warning).toContain('Funded: funded-a');
        expect(warning).toContain('Live: live-a');
        expect(warning).toContain('off the copier now');
        expect(warning).not.toMatch(/wait/i);
        expect(warning).not.toMatch(/reach the same stage/i);
        expect(warning).not.toContain('eval size');
    });

    it.each([
        {
            name: 'Evaluation and Funded',
            stages: [AccountStage.Eval, AccountStage.Funded],
        },
        {
            name: 'Evaluation and Live',
            stages: [AccountStage.Eval, AccountStage.Live],
        },
        {
            name: 'Funded and Live',
            stages: [AccountStage.Funded, AccountStage.Live],
        },
        {
            name: 'Evaluation, Funded and Live',
            stages: [AccountStage.Eval, AccountStage.Funded, AccountStage.Live],
        },
    ])(
        'words the sizing risk of a group of $name accounts without a fixed direction',
        ({ name, stages }) => {
            answerWith(
                [MAIN],
                stages.map((stage) =>
                    account(`${stage}-a`, { copyGroupId: MAIN.id, stage }),
                ),
            );
            render();
            const warning =
                groupSection('Main copy').querySelector('[role="alert"]')
                    ?.textContent ?? '';
            expect(warning).toContain(
                `Do not copy one size across stages: each stage has its own sizing rule, so one size copied across ${name} accounts is wrong for at least one of them.`,
            );
            expect(warning).not.toMatch(/over-risk/i);
            expect(warning).not.toMatch(/under-siz/i);
            expect(warning).not.toContain('cannot be bought back');
        },
    );

    it('warns on a group whose active members span more than one stage', () => {
        answerWith(
            [MAIN],
            [
                account('funded-a', { copyGroupId: MAIN.id }),
                account('eval-a', {
                    copyGroupId: MAIN.id,
                    stage: AccountStage.Eval,
                }),
            ],
        );
        render();
        const warning =
            groupSection('Main copy').querySelector('[role="alert"]');
        expect(warning?.textContent).toContain('1 Evaluation, 1 Funded');
        expect(warning?.textContent).toContain('one stage');
    });

    it('shows an empty state with the create form when there are no groups', () => {
        answerWith([], []);
        render();
        expect(container.querySelectorAll('h1')).toHaveLength(1);
        expect(container.textContent).toContain('No copy groups yet');
        expect(field('Group name')).toBeInstanceOf(HTMLInputElement);
    });

    it('shows a loading placeholder, then a readable error when a list fails', () => {
        render();
        expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
        act(() => {
            harness.queries.set('copyGroup.list', {
                data: undefined,
                error: new Error('Failed to fetch'),
                isError: true,
                isPending: false,
            });
            harness.queries.set('account.list', answer([]));
            root.render(<CopyGroupsView userId={USER_ID} />);
        });
        expect(container.textContent).toContain(
            'Your copy groups could not be loaded',
        );
        expect(container.textContent).toContain('Failed to fetch');
    });

    it('validates a new group name with the schema limits before creating it', async () => {
        answerWith([], []);
        render();
        const name = field('Group name');
        click(button('Create group'));
        expect(name.getAttribute('aria-invalid')).toBe('true');
        expect(errorOf(name)).toBe('Enter a group name.');

        typeInto(name, 'x'.repeat(MAX_ACCOUNT_LABEL_LENGTH + 1));
        click(button('Create group'));
        expect(errorOf(name)).toBe(
            `Keep the group name to ${MAX_ACCOUNT_LABEL_LENGTH} characters or fewer.`,
        );
        expect(callsTo('copyGroup.create')).toEqual([]);

        typeInto(name, '  Main copy  ');
        click(button('Create group'));
        await flush();
        expect(callsTo('copyGroup.create')).toEqual([{ name: 'Main copy' }]);
        expect(harness.invalidate).toHaveBeenCalled();
        expect(field('Group name').value).toBe('');
        expect(field('Group name').getAttribute('aria-invalid')).toBe('false');
    });

    it('shows the server message when creating a group is refused', () => {
        answerWith([], []);
        harness.outcomes.set(
            'copyGroup.create',
            rejectionError(
                'You can keep at most 50 copy groups',
                rejection({
                    limit: 50,
                    quota: PropQuota.CopyGroups,
                    reason: PropLimitRejection.QuotaExceeded,
                    record: PropRecord.CopyGroup,
                }),
            ),
        );
        render();
        typeInto(field('Group name'), 'One more');
        click(button('Create group'));
        expect(errorOf(field('Group name'))).toBe(
            'You can keep at most 50 copy groups',
        );
        expect(harness.invalidate).not.toHaveBeenCalled();
    });

    it('renames a group only with a valid name and keeps its notes', async () => {
        answerWith([SPARE], []);
        render();
        click(button('Rename Spare'));
        const input = field('New name for Spare');
        expect(input.value).toBe('Spare');

        typeInto(input, ' '.repeat(3));
        click(button('Save name'));
        expect(errorOf(field('New name for Spare'))).toBe(
            'Enter a group name.',
        );
        expect(callsTo('copyGroup.update')).toEqual([]);

        typeInto(field('New name for Spare'), 'Weekend copy');
        click(button('Save name'));
        await flush();
        expect(callsTo('copyGroup.update')).toEqual([
            { id: SPARE.id, name: 'Weekend copy', notes: 'weekend only' },
        ]);
        expect(harness.invalidate).toHaveBeenCalled();
        expect(document.activeElement).toBe(button('Rename Spare'));
    });

    it('returns focus to the rename button when renaming is cancelled', () => {
        answerWith([SPARE], []);
        render();
        click(button('Rename Spare'));
        click(button('Cancel'));
        expect(() => field('New name for Spare')).toThrow();
        expect(document.activeElement).toBe(button('Rename Spare'));
    });

    it('deletes a group only after confirming in an alert dialog and returns focus on cancel', async () => {
        answerWith([MAIN], [account('funded-a', { copyGroupId: MAIN.id })]);
        render();
        const trigger = button('Delete Main copy');
        click(trigger);
        const dialog = document.querySelector('[role="alertdialog"]');
        expect(dialog?.textContent).toContain('Delete the copy group');
        expect(dialog?.textContent).toContain('1 member');

        click(button('Cancel', dialog ?? document));
        await settle();
        expect(document.querySelector('[role="alertdialog"]')).toBeNull();
        expect(document.activeElement).toBe(button('Delete Main copy'));
        expect(callsTo('copyGroup.remove')).toEqual([]);

        click(button('Delete Main copy'));
        click(
            button(
                'Delete group',
                document.querySelector('[role="alertdialog"]') ?? document,
            ),
        );
        await flush();
        expect(callsTo('copyGroup.remove')).toEqual([{ id: MAIN.id }]);
        expect(harness.invalidate).toHaveBeenCalled();
        expect(harness.toastSuccess).toHaveBeenCalledWith('Main copy deleted');
        answerWith([], [account('funded-a')]);
        render();
        await settle();
        expect(document.activeElement).toBe(container.querySelector('h1'));
    });

    it('keeps the delete dialog open until the server answers, then focuses the h1', async () => {
        answerWith([MAIN, SPARE], []);
        harness.held.add('copyGroup.remove');
        render();
        click(button('Delete Main copy'));
        click(
            button(
                'Delete group',
                document.querySelector('[role="alertdialog"]') ?? document,
            ),
        );
        await settle();
        expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
        expect(callsTo('copyGroup.remove')).toEqual([{ id: MAIN.id }]);

        releaseHeld();
        await flush();
        answerWith([SPARE], []);
        render();
        await settle();
        expect(document.querySelector('[role="alertdialog"]')).toBeNull();
        expect(document.activeElement).toBe(container.querySelector('h1'));
    });

    it('keeps the delete dialog open on Escape and disables Cancel and Delete while the delete is pending', async () => {
        answerWith([MAIN], []);
        harness.held.add('copyGroup.remove');
        render();
        click(button('Delete Main copy'));
        click(
            button(
                'Delete group',
                document.querySelector('[role="alertdialog"]') ?? document,
            ),
        );
        await settle();
        act(() => {
            (document.activeElement ?? document.body).dispatchEvent(
                new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
            );
        });
        await settle();
        const dialog = document.querySelector('[role="alertdialog"]');
        expect(dialog).not.toBeNull();
        expect(button('Cancel', dialog ?? document).disabled).toBe(true);
        expect(button('Delete group', dialog ?? document).disabled).toBe(true);
        expect(callsTo('copyGroup.remove')).toEqual([{ id: MAIN.id }]);

        releaseHeld();
        await flush();
        expect(button('Delete Main copy').disabled).toBe(false);
    });

    it('returns focus to the delete trigger when a pending delete fails while the mutation still reports pending', async () => {
        answerWith([MAIN], []);
        harness.held.add('copyGroup.remove');
        harness.outcomes.set('copyGroup.remove', new Error('Failed to fetch'));
        render();
        click(button('Delete Main copy'));
        click(
            button(
                'Delete group',
                document.querySelector('[role="alertdialog"]') ?? document,
            ),
        );
        await settle();
        expect(button('Delete Main copy').disabled).toBe(true);
        const pendingDuringError: boolean[] = [];
        harness.toastError.mockImplementationOnce(() => {
            pendingDuringError.push(
                harness.pendingNames.has('copyGroup.remove'),
            );
        });

        releaseHeld();
        await flush();
        await settle();
        expect(pendingDuringError).toEqual([true]);
        expect(harness.toastError).toHaveBeenCalledWith('Failed to fetch');
        expect(document.querySelector('[role="alertdialog"]')).toBeNull();
        expect(button('Delete Main copy').disabled).toBe(false);
        expect(document.activeElement).toBe(button('Delete Main copy'));
    });

    it('closes the delete dialog, keeps the group and returns focus to its trigger when deleting fails', async () => {
        answerWith([MAIN], []);
        harness.outcomes.set('copyGroup.remove', new Error('Failed to fetch'));
        render();
        click(button('Delete Main copy'));
        click(
            button(
                'Delete group',
                document.querySelector('[role="alertdialog"]') ?? document,
            ),
        );
        await settle();
        expect(harness.toastError).toHaveBeenCalledWith('Failed to fetch');
        expect(document.querySelector('[role="alertdialog"]')).toBeNull();
        expect(document.activeElement).toBe(button('Delete Main copy'));
        expect(harness.invalidate).not.toHaveBeenCalled();
    });

    it('assigns an unassigned account and removes a member through copyGroup.assign', async () => {
        answerWith(
            [MAIN],
            [
                account('funded-a', { copyGroupId: MAIN.id }),
                account('funded-b'),
            ],
        );
        render();
        typeInto(field('Account to add to Main copy'), 'funded-b');
        click(button('Add to Main copy'));
        await flush();
        click(button('Remove funded-a from Main copy'));
        await flush();
        expect(callsTo('copyGroup.assign')).toEqual([
            { accountId: 'funded-b', copyGroupId: MAIN.id },
            { accountId: 'funded-a', copyGroupId: null },
        ]);
        expect(harness.invalidate).toHaveBeenCalledTimes(2);
    });

    it('moves focus to the group heading after a member is removed', async () => {
        answerWith(
            [MAIN],
            [
                account('funded-a', { copyGroupId: MAIN.id }),
                account('funded-b', { copyGroupId: MAIN.id }),
            ],
        );
        render();
        click(button('Remove funded-a from Main copy'));
        await flush();
        answerWith(
            [MAIN],
            [
                account('funded-a'),
                account('funded-b', { copyGroupId: MAIN.id }),
            ],
        );
        render();
        expect(document.activeElement).toBe(groupHeading('Main copy'));
    });

    it('moves focus to the group heading after the last unassigned account is added', async () => {
        answerWith([MAIN], [account('funded-b')]);
        render();
        typeInto(field('Account to add to Main copy'), 'funded-b');
        click(button('Add to Main copy'));
        await flush();
        answerWith([MAIN], [account('funded-b', { copyGroupId: MAIN.id })]);
        render();
        expect(() => field('Account to add to Main copy')).toThrow();
        expect(document.activeElement).toBe(groupHeading('Main copy'));
    });

    it('names the inactive or archived member of another stage when the server refuses an account', () => {
        answerWith(
            [MAIN],
            [
                account('funded-a', { copyGroupId: MAIN.id }),
                account('old-eval', {
                    archivedAt: ARCHIVED_AT,
                    copyGroupId: MAIN.id,
                    stage: AccountStage.Eval,
                }),
                account('funded-b'),
            ],
        );
        harness.outcomes.set(
            'copyGroup.assign',
            rejectionError(mixedMessage('Evaluation', 'Funded'), rejection({})),
        );
        render();
        typeInto(field('Account to add to Main copy'), 'funded-b');
        click(button('Add to Main copy'));
        const alert =
            groupSection('Main copy').querySelector(
                '[role="alert"]',
            )?.textContent;
        expect(alert).toContain('funded-b cannot join Main copy');
        expect(alert).toContain(
            'funded-b is Funded, but Main copy already has members in another stage: old-eval (Evaluation, archived).',
        );
        expect(alert).toContain(mixedMessage('Evaluation', 'Funded'));
    });

    it('shows the server mixed-stage message readably when an account of another stage is assigned', () => {
        answerWith(
            [MAIN],
            [
                account('funded-a', { copyGroupId: MAIN.id }),
                account('eval-b', { stage: AccountStage.Eval }),
            ],
        );
        harness.outcomes.set(
            'copyGroup.assign',
            rejectionError(mixedMessage('Funded', 'Evaluation'), rejection({})),
        );
        render();
        typeInto(field('Account to add to Main copy'), 'eval-b');
        click(button('Add to Main copy'));
        const alert = groupSection('Main copy').querySelector('[role="alert"]');
        expect(alert?.textContent).toContain('eval-b cannot join Main copy');
        expect(alert?.textContent).toContain(
            'eval-b is Evaluation, but Main copy already has members in another stage: funded-a (Funded).',
        );
        expect(alert?.textContent).toContain(
            mixedMessage('Funded', 'Evaluation'),
        );
        expect(harness.toastError).not.toHaveBeenCalled();
        expect(harness.invalidate).not.toHaveBeenCalled();
    });

    it('reports any other assign failure as a toast', () => {
        answerWith([MAIN], [account('funded-b')]);
        harness.outcomes.set('copyGroup.assign', new Error('Failed to fetch'));
        render();
        typeInto(field('Account to add to Main copy'), 'funded-b');
        click(button('Add to Main copy'));
        expect(harness.toastError).toHaveBeenCalledWith('Failed to fetch');
        expect(
            groupSection('Main copy').querySelector('[role="alert"]'),
        ).toBeNull();
    });

    it('never assigns an account that left the unassigned list after it was chosen', () => {
        answerWith([MAIN, SPARE], [account('funded-b'), account('funded-c')]);
        render();
        typeInto(field('Account to add to Main copy'), 'funded-b');
        answerWith(
            [MAIN, SPARE],
            [
                account('funded-b', { copyGroupId: SPARE.id }),
                account('funded-c'),
            ],
        );
        render();
        click(button('Add to Main copy'));
        expect(callsTo('copyGroup.assign')).toEqual([]);
        expect(errorOf(field('Account to add to Main copy'))).toBe(
            'Choose an account to add.',
        );
    });

    it('asks for an account before adding one', () => {
        answerWith([MAIN], [account('funded-b')]);
        render();
        click(button('Add to Main copy'));
        expect(callsTo('copyGroup.assign')).toEqual([]);
        expect(errorOf(field('Account to add to Main copy'))).toBe(
            'Choose an account to add.',
        );
    });

    describe('sizing and exposure', () => {
        const LOOSE_ID = 'funded-loose';
        const TIGHT_ID = 'funded-tight';
        const UNRESOLVABLE_ID = 'funded-unresolvable';
        const LOOSE_BALANCE_CENTS = Math.round(
            (SIZING_THRESHOLD + DOCUMENTED_FUNDED_RISK * 5) * 100,
        );
        const TIGHT_RISK_CENTS = Math.round((DOCUMENTED_FUNDED_RISK / 2) * 100);

        function loose() {
            return sizingAccount(LOOSE_ID, MAIN.id);
        }

        function tight() {
            return sizingAccount(TIGHT_ID, MAIN.id, {
                personalRules: { maxRiskPerTradeCents: TIGHT_RISK_CENTS },
            });
        }

        function unresolvable() {
            return sizingAccount(UNRESOLVABLE_ID, MAIN.id, {
                planSerial: 'no-such-plan',
            });
        }

        function exposureFor(
            accounts: readonly ReturnType<typeof sizingAccount>[],
        ) {
            const groups = copyGroupRows([MAIN], accounts).groups;
            const sections = copyGroupSizingSectionsOf(
                DEFAULT_RULEBOOK,
                USER_ID,
                TODAY,
                accounts,
                [],
                [],
                snapshotsFor(accounts),
                groups,
            );
            return sections.get(MAIN.id)?.exposure ?? null;
        }

        function snapshotsFor(
            accounts: readonly ReturnType<typeof sizingAccount>[],
        ) {
            return accounts.map((sizingAccountRow) =>
                sizingSnapshot(sizingAccountRow.id, LOOSE_BALANCE_CENTS),
            );
        }

        function answerWithSizing(
            accounts: readonly ReturnType<typeof sizingAccount>[],
        ) {
            answerWith([MAIN], accounts);
            harness.queries.set(
                'snapshot.latestForAll',
                answer(snapshotsFor(accounts)),
            );
        }

        function expectedSection(
            accounts: readonly ReturnType<typeof sizingAccount>[],
        ) {
            const groups = copyGroupRows([MAIN], accounts).groups;
            const sections = copyGroupSizingSectionsOf(
                DEFAULT_RULEBOOK,
                USER_ID,
                TODAY,
                accounts,
                [],
                [],
                snapshotsFor(accounts),
                groups,
            );
            const section = sections.get(MAIN.id);
            if (section === undefined) {
                throw new Error('no sizing section computed for the group');
            }
            return section;
        }

        it("shows the documented size at the tightest member's rung, naming the binding member, and the group's combined exposure", () => {
            const accounts = [loose(), tight()];
            answerWithSizing(accounts);
            const section = expectedSection(accounts);
            if (section.result.kind !== CopyGroupSizingResultKind.Sized) {
                throw new Error('expected the group to be sized');
            }
            const groupRisk = section.result.sizing.rungs[0]?.risk ?? 0;
            const bindingLabels = bindingMemberIdsOf(section.result);
            expect(bindingLabels).toEqual([TIGHT_ID]);
            expect(groupRisk).toBeLessThan(DOCUMENTED_FUNDED_RISK);

            render();
            const text = groupSection('Main copy').textContent;
            expect(text).toContain(formatCurrency(groupRisk));
            expect(text).toContain(TIGHT_ID);
            expect(text).toContain('Combined exposure');
            if (section.exposure === null) {
                return;
            }

            expect(text).toContain(
                formatCurrency(section.exposure.maxDailyLoss),
            );
            if (section.exposure.shareOfCushionAtRisk !== null) {
                expect(text).toContain(
                    formatPercent(section.exposure.shareOfCushionAtRisk),
                );
            }
        });

        it('lists every rung the group uses, not only the first', () => {
            const accounts = [loose(), tight()];
            answerWithSizing(accounts);
            const section = expectedSection(accounts);
            if (section.result.kind !== CopyGroupSizingResultKind.Sized) {
                throw new Error('expected the group to be sized');
            }
            const { rungs } = section.result.sizing;
            expect(rungs.length).toBeGreaterThan(1);

            render();
            const rows = [
                ...groupSection('Main copy').querySelectorAll(
                    ':scope tbody tr',
                ),
            ].map((tableRow) =>
                [...tableRow.querySelectorAll('td')].map(
                    (cell) => cell.textContent,
                ),
            );
            expect(rows.map((cells) => cells[1])).toEqual(
                rungs.map((rung) => formatCurrency(rung.risk, 2)),
            );
            expect(rows.map((cells) => cells[0])).toEqual(
                rungs.map((_, index) => String(index + 1)),
            );
        });

        it('names the members the exposure leaves out', () => {
            const accounts = [loose(), tight(), unresolvable()];
            answerWithSizing(accounts);
            render();
            const text = groupSection('Main copy').textContent;
            expect(text).toContain(`1 member not included: ${UNRESOLVABLE_ID}`);
        });

        it('says nothing about left-out members when the whole group is in the exposure', () => {
            answerWithSizing([loose(), tight()]);
            render();
            expect(groupSection('Main copy').textContent).not.toContain(
                'not included',
            );
        });

        it('explains which members could not be sized and why', () => {
            const accounts = [loose(), tight(), unresolvable()];
            answerWithSizing(accounts);
            render();
            const text = groupSection('Main copy').textContent;
            expect(text).toContain(UNRESOLVABLE_ID);
            expect(text).toContain('could not be sized');
            expect(text).toContain(
                describeUnresolvedPlan(
                    {
                        accountSize: SIZING_PLAN.accountSize,
                        firmId: SIZING_PLAN.id.firm,
                        optIns: {},
                        planSerial: 'no-such-plan',
                    },
                    UnresolvedPlanReason.UnknownPlanSerial,
                ),
            );
        });

        it('does not fold a suspended, non-archived member into the combined exposure it is excluded from sizing', () => {
            const activeOnly = [loose(), tight()];
            const withSuspended = [
                ...activeOnly,
                suspendedSizingAccount('funded-suspended', MAIN.id),
            ];
            const baseline = exposureFor(activeOnly);
            if (baseline === null) {
                throw new Error('expected the baseline group to have exposure');
            }
            const withExtraMember = exposureFor(withSuspended);
            expect(withExtraMember).toEqual(baseline);

            answerWithSizing(withSuspended);
            render();
            const text = groupSection('Main copy').textContent;
            expect(text).toContain(
                `Combined exposure: worst-case daily loss of ${formatCurrency(baseline.maxDailyLoss)}`,
            );
        });

        it('names the member with no cushion room left when a group is rejected for it', () => {
            const drained = sizingAccount('funded-drained', MAIN.id);
            const roomy = tight();
            const accounts = [drained, roomy];
            answerWith([MAIN], accounts);
            const drainedBalanceCents = Math.round(SIZING_THRESHOLD * 100);
            const drainedSnapshot = sizingSnapshot(
                drained.id,
                drainedBalanceCents,
            );
            const roomySnapshot = sizingSnapshot(roomy.id, LOOSE_BALANCE_CENTS);
            harness.queries.set(
                'snapshot.latestForAll',
                answer([drainedSnapshot, roomySnapshot]),
            );
            render();
            const paragraphs = [
                ...groupSection('Main copy').querySelectorAll('p'),
            ].map((paragraph) => paragraph.textContent);
            expect(
                paragraphs.some(
                    (paragraph) =>
                        /cushion room left/i.test(paragraph) &&
                        paragraph.includes('funded-drained'),
                ),
            ).toBe(true);
        });

        it('does not double a trailing period when a member is unsized for an implausible snapshot', () => {
            const implausibleId = 'funded-implausible';
            const sizedMembers = [loose(), tight()];
            const accounts = [
                ...sizedMembers,
                sizingAccount(implausibleId, MAIN.id),
            ];
            answerWith([MAIN], accounts);
            const implausibleFloorCents = usdCents(LOOSE_BALANCE_CENTS + 100);
            const implausibleSnapshot = sizingSnapshot(
                implausibleId,
                LOOSE_BALANCE_CENTS,
                { dashboardFloorCents: implausibleFloorCents },
            );
            harness.queries.set(
                'snapshot.latestForAll',
                answer([...snapshotsFor(sizedMembers), implausibleSnapshot]),
            );
            render();
            const text = groupSection('Main copy').textContent;
            expect(text).toContain(implausibleId);
            expect(text).toContain('could not be sized');
            expect(text).not.toContain('..');
        });

        it("shows the rung's capping rule, the assumptions, the sources and the snapshot date behind the documented size", () => {
            const accounts = [loose(), tight()];
            answerWithSizing(accounts);
            const section = expectedSection(accounts);
            if (section.result.kind !== CopyGroupSizingResultKind.Sized) {
                throw new Error('expected the group to be sized');
            }
            render();
            const text = groupSection('Main copy').textContent;
            expect(text).toContain(TODAY);
            const cappedBy = section.result.sizing.rungs[0]?.cappedBy ?? [];
            for (const constraint of cappedBy) {
                expect(text).toContain(SIZING_CONSTRAINT_TEXT[constraint]);
            }
            for (const assumption of section.result.sizing.assumptions) {
                expect(text).toContain(SIZING_ASSUMPTION_TEXT[assumption]);
            }
            expect(text).toContain(section.result.sizing.sources.join(', '));
        });

        it('offers the group simulation at the documented group size and starts no worker until it is run', () => {
            vi.stubGlobal('Worker', StubWorker);
            const accounts = [loose(), tight()];
            answerWithSizing(accounts);
            const section = expectedSection(accounts);
            if (section.result.kind !== CopyGroupSizingResultKind.Sized) {
                throw new Error('expected the group to be sized');
            }
            const groupRisk = section.result.sizing.rungs[0]?.risk ?? 0;
            render();
            const group = groupSection('Main copy');
            expect(group.textContent).toContain(
                'Correlated bust risk and payouts',
            );
            expect(group.textContent).toContain(
                `Every copy trades ${formatCurrency(groupRisk)} per trade`,
            );
            expect(StubWorker.instances).toHaveLength(0);

            click(button('Simulate group', group));
            expect(StubWorker.instances).toHaveLength(1);
            const [worker] = StubWorker.instances;
            const posted = worker?.postMessage.mock.calls[0]?.[0];
            expect(posted).toMatchObject({ runId: 1 });
        });

        it('says why the group is not simulated when it could not be sized', () => {
            const drained = sizingAccount('funded-drained', MAIN.id);
            const roomy = tight();
            answerWith([MAIN], [drained, roomy]);
            const drainedCents = Math.round(SIZING_THRESHOLD * 100);
            const snapshots = [
                sizingSnapshot(drained.id, drainedCents),
                sizingSnapshot(roomy.id, LOOSE_BALANCE_CENTS),
            ];
            harness.queries.set('snapshot.latestForAll', answer(snapshots));
            render();
            const group = groupSection('Main copy');
            expect(group.textContent).toContain('Not simulated:');
            expect(group.textContent).toContain('no cushion room left');
            const buttons = [...group.querySelectorAll('button')];
            expect(
                buttons.some((candidate) =>
                    /simulat/i.test(candidate.textContent),
                ),
            ).toBe(false);
        });

        it('shows a loading state for sizing while a required query is still pending, never a stale number', () => {
            const accounts = [loose(), tight()];
            answerWith([MAIN], accounts);
            harness.queries.delete('snapshot.latestForAll');
            render();
            const text = groupSection('Main copy').textContent;
            expect(text).toContain('still loading');
            expect(text).not.toContain('Documented size');
            expect(text).not.toContain('$');
        });

        it('shows a readable error when a sizing query fails, without dropping the group', () => {
            const accounts = [loose(), tight()];
            answerWith([MAIN], accounts);
            harness.queries.set('rulebook.get', {
                data: undefined,
                error: new Error('rulebook down'),
                isError: true,
                isPending: false,
            });
            render();
            const text = groupSection('Main copy').textContent;
            expect(text).toContain('could not be checked');
            expect(text).toContain('rulebook down');
            expect(container.textContent).toContain('Main copy');
        });

        it('announces the loading state as a status and the failure as an alert', () => {
            const accounts = [loose(), tight()];
            answerWith([MAIN], accounts);
            harness.queries.delete('snapshot.latestForAll');
            render();
            const status =
                groupSection('Main copy').querySelector('[role="status"]');
            expect(status?.textContent).toContain('still loading');

            harness.queries.set('rulebook.get', {
                data: undefined,
                error: new Error('rulebook down'),
                isError: true,
                isPending: false,
            });
            render();
            const alert =
                groupSection('Main copy').querySelector('[role="alert"]');
            expect(alert?.textContent).toContain('rulebook down');
        });

        it('keeps the sizing and the typed stop when a background refetch fails, and shows the error beside it', () => {
            const accounts = [loose(), tight()];
            answerWithSizing(accounts);
            render();
            const stopInput = container.querySelector<HTMLInputElement>(
                `#copy-group-stop-${MAIN.id}`,
            );
            if (stopInput === null) throw new Error('no stop input');
            typeInto(stopInput, '20');
            expect(
                container.querySelector<HTMLInputElement>(
                    `#copy-group-stop-${MAIN.id}`,
                )?.value,
            ).toBe('20');

            harness.queries.set('event.list', {
                data: [],
                error: new Error('events refetch failed'),
                isError: true,
                isPending: false,
            });
            render();

            const group = groupSection('Main copy');
            expect(group.textContent).toContain('Documented size');
            expect(
                container.querySelector<HTMLInputElement>(
                    `#copy-group-stop-${MAIN.id}`,
                )?.value,
            ).toBe('20');
            expect(
                group.querySelector('[role="alert"]')?.textContent,
            ).toContain('events refetch failed');
        });

        it('says why there is no group size when the ladder is empty, and keeps the exposure line and the stop entry', () => {
            const accounts = [loose(), tight()];
            const section = expectedSection(accounts);
            if (section.result.kind !== CopyGroupSizingResultKind.Sized) {
                throw new Error('expected the group to be sized');
            }
            const emptied = {
                ...section,
                result: {
                    ...section.result,
                    sizing: { ...section.result.sizing, rungs: [] },
                },
            };
            const [row] = copyGroupRows([MAIN], accounts).groups;
            if (row === undefined) throw new Error('no row for the group');
            act(() => {
                root.render(
                    <GroupSizingSection
                        row={row}
                        sizing={{
                            kind: GroupSizingViewKind.Ready,
                            section: emptied,
                        }}
                    />,
                );
            });
            const text = container.textContent;
            expect(text).toContain("No rung fits the group's room today");
            expect(text).not.toContain('Documented size for every copy');
            expect(container.querySelector('table')).toBeNull();
            expect(text).toContain('Combined exposure');
            expect(
                container.querySelector(`#copy-group-stop-${MAIN.id}`),
            ).not.toBeNull();
        });

        it('does not say there is no room when the ladder has rungs', () => {
            answerWithSizing([loose(), tight()]);
            render();
            expect(groupSection('Main copy').textContent).not.toContain(
                "No rung fits the group's room today",
            );
        });

        it('names the rung table after its group', () => {
            answerWithSizing([loose(), tight()]);
            render();
            const table = groupSection('Main copy').querySelector('table');
            expect(table?.caption?.textContent).toBe(
                'Documented ladder for Main copy',
            );
        });

        it('says the combined exposure is an upper bound on what the group sizing allows', () => {
            answerWithSizing([loose(), tight()]);
            render();
            expect(groupSection('Main copy').textContent).toContain(
                'an upper bound on the group worst case',
            );
        });

        describe('a stale balance', () => {
            const STALE_DAY = '2026-09-10';

            function answerWithStaleMember() {
                const accounts = [loose(), tight()];
                answerWith([MAIN], accounts);
                harness.queries.set(
                    'snapshot.latestForAll',
                    answer([
                        sizingSnapshot(LOOSE_ID, LOOSE_BALANCE_CENTS),
                        sizingSnapshot(TIGHT_ID, LOOSE_BALANCE_CENTS, {
                            asOf: STALE_DAY,
                        }),
                    ]),
                );
            }

            it('withholds every rung amount and asks for the stale member balance', () => {
                answerWithStaleMember();
                render();
                const group = groupSection('Main copy');
                const text = group.textContent;
                expect(text).toContain(
                    `The balance for ${TIGHT_ID} is from ${STALE_DAY}`,
                );
                expect(text).toContain("Enter today's balance");
                expect(group.querySelector('table')).toBeNull();
                expect(text).not.toContain('Documented size');
                expect(text).not.toContain('Combined exposure');
                expect(text).not.toContain('$');
            });

            it('does not name a member whose balance is fresh', () => {
                answerWithStaleMember();
                render();
                expect(groupSection('Main copy').textContent).not.toContain(
                    `The balance for ${LOOSE_ID}`,
                );
            });
            it('withholds the amounts of a group that turns stale when the date rolls over, with no reload', () => {
                const accounts = [loose(), tight()];
                answerWith([MAIN], accounts);
                harness.queries.set(
                    'snapshot.latestForAll',
                    answer(
                        accounts.map((entry) =>
                            sizingSnapshot(entry.id, LOOSE_BALANCE_CENTS),
                        ),
                    ),
                );
                render();
                expect(groupSection('Main copy').textContent).toContain(
                    'Documented size',
                );
                const stopInput = container.querySelector<HTMLInputElement>(
                    `#copy-group-stop-${MAIN.id}`,
                );
                if (stopInput === null) throw new Error('no stop input');
                typeInto(stopInput, '20');

                vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
                act(() => {
                    document.dispatchEvent(new Event('visibilitychange'));
                });

                const text = groupSection('Main copy').textContent;
                expect(text).toContain(
                    `The balance for ${TIGHT_ID} is from ${TODAY}`,
                );
                expect(text).not.toContain('Documented size');
                expect(text).not.toContain('Combined exposure');
                expect(
                    groupSection('Main copy').querySelector('table'),
                ).toBeNull();

                vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
                act(() => {
                    document.dispatchEvent(new Event('visibilitychange'));
                });
                expect(
                    container.querySelector<HTMLInputElement>(
                        `#copy-group-stop-${MAIN.id}`,
                    )?.value,
                ).toBe('20');
            });

            describe('an eval member', () => {
                const EVAL_TODAY = '2026-09-23';
                const TWO_SESSIONS_OLD = '2026-09-21';
                const EVAL_BALANCE_CENTS =
                    (SIZING_PLAN.accountSize + 1000) * CENTS_PER_DOLLAR;

                function answerWithEval(oldAsOf: string) {
                    const accounts = [
                        evalSizingAccount('eval-fresh'),
                        evalSizingAccount('eval-old'),
                    ];
                    vi.setSystemTime(new Date(`${EVAL_TODAY}T12:00:00Z`));
                    answerWith([MAIN], accounts);
                    harness.queries.set(
                        'snapshot.latestForAll',
                        answer(
                            accounts.map((entry) =>
                                sizingSnapshot(entry.id, EVAL_BALANCE_CENTS, {
                                    asOf:
                                        entry.id === 'eval-old'
                                            ? oldAsOf
                                            : EVAL_TODAY,
                                    highestEodBalanceCents:
                                        usdCents(EVAL_BALANCE_CENTS),
                                }),
                            ),
                        ),
                    );
                }

                it('shows the group size while every eval balance is at most a session old', () => {
                    answerWithEval('2026-09-22');
                    render();
                    expect(groupSection('Main copy').textContent).toContain(
                        'Documented size',
                    );
                });

                it('withholds the amounts, the exposure and the simulation once a member is two weekday sessions old', () => {
                    answerWithEval(EVAL_TODAY);
                    render();
                    expect(groupSection('Main copy').textContent).toContain(
                        'Documented size',
                    );

                    answerWithEval(TWO_SESSIONS_OLD);
                    render();
                    const group = groupSection('Main copy');
                    const text = group.textContent;
                    expect(text).toContain(
                        `The balance for eval-old is from ${TWO_SESSIONS_OLD}`,
                    );
                    expect(text).not.toContain('eval-fresh is from');
                    expect(text).not.toContain('Documented size');
                    expect(text).not.toContain('Combined exposure');
                    expect(text).not.toContain('$');
                    expect(group.querySelector('table')).toBeNull();
                    expect(
                        [...group.querySelectorAll('button')].some((entry) =>
                            entry.textContent.includes('Simulate'),
                        ),
                    ).toBe(false);
                });
            });
        });
    });
});
