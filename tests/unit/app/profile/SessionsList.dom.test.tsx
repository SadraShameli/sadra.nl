import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    chooseRowAction,
    confirmRowAction,
    rowActionsTriggers,
} from '../../components/rowActionsMenu';

const SIGNED_AT = new Date('2026-10-01T09:00:00Z');

const harness = vi.hoisted(() => ({
    revoked: [] as unknown[],
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock('~/lib/auth/client', () => ({
    authClient: {
        listSessions: () =>
            Promise.resolve({
                data: [
                    {
                        createdAt: SIGNED_AT,
                        expiresAt: SIGNED_AT,
                        id: 'session-current',
                        ipAddress: '10.0.0.1',
                        token: 'current-token',
                        updatedAt: SIGNED_AT,
                        userAgent: null,
                    },
                    {
                        createdAt: SIGNED_AT,
                        expiresAt: SIGNED_AT,
                        id: 'session-other',
                        ipAddress: '10.0.0.2',
                        token: 'other-token',
                        updatedAt: SIGNED_AT,
                        userAgent: null,
                    },
                ],
            }),
        revokeOtherSessions: () => Promise.resolve({}),
        revokeSession: (input: unknown) => {
            harness.revoked.push(input);
            return Promise.resolve({});
        },
        useSession: () => ({ data: { session: { token: 'current-token' } } }),
    },
}));

const { SessionsList } =
    await import('~/app/(app)/profile/_components/SessionsList');

function settle(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

describe('SessionsList row menu', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(async () => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.revoked.length = 0;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        await act(async () => {
            root.render(<SessionsList />);
            await settle();
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('gives the current session no menu', () => {
        expect(rowActionsTriggers('Unknown device, 10.0.0.1')).toEqual([]);
        expect(rowActionsTriggers('Unknown device, 10.0.0.2')).toHaveLength(1);
    });

    it('revokes another session only after the revoke is confirmed', async () => {
        chooseRowAction('Unknown device, 10.0.0.2', 'Revoke');
        expect(harness.revoked).toEqual([]);
        confirmRowAction('Revoke');
        await act(settle);
        expect(harness.revoked).toEqual([{ token: 'other-token' }]);
    });
});
