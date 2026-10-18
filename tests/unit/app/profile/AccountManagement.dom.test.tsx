import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLE, type Role } from '~/lib/auth/roles';

import {
    dialogButton,
    dialogField,
    submitDialog,
    typeInto,
} from '../../components/formDialog';
import {
    chooseRowAction,
    clickRowAction,
    confirmRowAction,
    openRowActions,
    rowActionLabels,
    rowActionsTriggers,
} from '../../components/rowActionsMenu';

const JOINED = new Date('2026-08-01T00:00:00Z');

const NEW_USER = {
    email: 'nina@example.test',
    name: 'Nina New',
    password: 'Quartz-Lantern-Harbor-42',
    role: ROLE.USER,
};

const harness = vi.hoisted(() => ({
    created: [] as unknown[],
    pendingCreates: [] as ((result: unknown) => void)[],
    removed: [] as unknown[],
    roles: [] as unknown[],
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/lib/auth/client', () => ({
    authClient: {
        admin: {
            createUser: (input: unknown) => {
                harness.created.push(input);
                return new Promise((resolve) => {
                    harness.pendingCreates.push(resolve);
                });
            },
            listUsers: () =>
                Promise.resolve({
                    data: {
                        users: [
                            {
                                createdAt: JOINED,
                                email: 'root@example.test',
                                id: 'user-root',
                                name: 'Rooted Owner',
                                role: 'root',
                            },
                            {
                                createdAt: JOINED,
                                email: 'admin@example.test',
                                id: 'user-admin',
                                name: 'Ada Admin',
                                role: 'admin',
                            },
                            {
                                createdAt: JOINED,
                                email: 'user@example.test',
                                id: 'user-plain',
                                name: 'Ulla User',
                                role: 'user',
                            },
                        ],
                    },
                }),
            removeUser: (input: unknown) => {
                harness.removed.push(input);
                return Promise.resolve({});
            },
            setRole: (input: unknown) => {
                harness.roles.push(input);
                return Promise.resolve({});
            },
        },
    },
}));

const { AccountManagement } =
    await import('~/app/(app)/profile/_components/AccountManagement');

function settle(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

describe('AccountManagement row menu', () => {
    let container: HTMLDivElement;
    let root: Root;

    async function renderAs(callerRole: Role) {
        await act(async () => {
            root.render(<AccountManagement callerRole={callerRole} />);
            await settle();
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.created.length = 0;
        harness.pendingCreates.length = 0;
        harness.removed.length = 0;
        harness.roles.length = 0;
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

    it('keeps role pickers out of the table and offers the role change in the menu', async () => {
        await renderAs(ROLE.ROOT);
        expect(
            container.querySelector(':scope tbody [role="combobox"]'),
        ).toBeNull();
        expect(rowActionsTriggers('Rooted Owner')).toEqual([]);

        openRowActions('Ada Admin');
        expect(rowActionLabels()).toEqual(['Change role to User', 'Delete']);
        clickRowAction('Change role to User');
        await act(settle);
        expect(harness.roles).toEqual([
            { role: ROLE.USER, userId: 'user-admin' },
        ]);

        chooseRowAction('Ulla User', 'Change role to Admin');
        await act(settle);
        expect(harness.roles).toEqual([
            { role: ROLE.USER, userId: 'user-admin' },
            { role: ROLE.ADMIN, userId: 'user-plain' },
        ]);
    });

    it('labels the create button as creating while the new user is saved', async () => {
        await renderAs(ROLE.ROOT);
        const newUser = [...container.querySelectorAll('button')].find(
            (button) => button.textContent.trim() === 'New user',
        );
        if (newUser === undefined) throw new Error('no New user button');
        act(() => {
            newUser.click();
        });
        typeInto(dialogField('Name'), NEW_USER.name);
        typeInto(dialogField('Email'), NEW_USER.email);
        typeInto(dialogField('Password'), NEW_USER.password);
        await submitDialog('Create', () =>
            vi.waitFor(() => {
                expect(harness.created).toHaveLength(1);
            }),
        );
        expect(harness.created).toEqual([NEW_USER]);
        expect(dialogButton('Creating…').disabled).toBe(true);
    });

    it('lets an admin delete plain users only, after confirming', async () => {
        await renderAs(ROLE.ADMIN);
        expect(rowActionsTriggers('Ada Admin')).toEqual([]);

        openRowActions('Ulla User');
        expect(rowActionLabels()).toEqual(['Delete']);
        clickRowAction('Delete');
        expect(harness.removed).toEqual([]);
        confirmRowAction('Delete');
        await act(settle);
        expect(harness.removed).toEqual([{ userId: 'user-plain' }]);
    });
});
