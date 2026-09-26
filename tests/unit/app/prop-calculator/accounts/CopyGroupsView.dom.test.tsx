import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type CopyGroupAccount } from '~/app/(app)/prop-calculator/accounts/_components/copyGroups/copyGroupRows';
import { CopyGroupsView } from '~/app/(app)/prop-calculator/accounts/copy-groups/CopyGroupsView';
import { AccountStage, AccountStatus } from '~/lib/prop-accounts';
import { ALL_FIRMS } from '~/lib/prop-calculator';
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
        },
        useUtils: () => ({
            propAccounts: { invalidate: harness.invalidate },
        }),
    },
}));

vi.mock('sonner', () => ({
    toast: { error: harness.toastError, success: harness.toastSuccess },
}));

const FIRM = firstModeledFirm();

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
        firmId: FIRM.id,
        id,
        label: id,
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        ...overrides,
    };
}

function answer(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

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
            root.render(<CopyGroupsView />);
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
        harness.outcomes.clear();
        harness.calls.length = 0;
        harness.held.clear();
        harness.pendingNames.clear();
        harness.releases.length = 0;
        harness.invalidate.mockClear();
        harness.toastError.mockClear();
        harness.toastSuccess.mockClear();
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
            root.render(<CopyGroupsView />);
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
});
