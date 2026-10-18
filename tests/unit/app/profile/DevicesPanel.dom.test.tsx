import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    chooseRowAction,
    clickRowAction,
    confirmRowAction,
    openRowActions,
    rowActionLabels,
} from '../../components/rowActionsMenu';

const harness = vi.hoisted(() => ({
    deleted: [] as unknown[],
    issued: [] as unknown[],
    query: (data: unknown) => () => ({ data, isLoading: false }),
    recorder: (sink: unknown[]) => () => ({
        isPending: false,
        mutate: (input: unknown) => {
            sink.push(input);
        },
        variables: undefined,
    }),
    revoked: [] as unknown[],
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => {
    const { query, recorder } = harness;
    return {
        api: {
            device: {
                create: { useMutation: recorder([]) },
                delete: { useMutation: recorder(harness.deleted) },
                issueToken: { useMutation: recorder(harness.issued) },
                listAdmin: {
                    useQuery: query([
                        {
                            created_at: new Date('2026-09-01T00:00:00Z'),
                            device_id: 11,
                            has_token: true,
                            id: 1,
                            location_id: 7,
                            loudness_threshold: 60,
                            name: 'Hallway board',
                            register_interval: 30,
                            token_created_at: new Date('2026-09-02T00:00:00Z'),
                            token_revoked_at: null,
                        },
                        {
                            created_at: new Date('2026-09-03T00:00:00Z'),
                            device_id: 12,
                            has_token: false,
                            id: 2,
                            location_id: 7,
                            loudness_threshold: 55,
                            name: 'Garage board',
                            register_interval: 60,
                            token_created_at: null,
                            token_revoked_at: null,
                        },
                    ]),
                },
                revokeToken: { useMutation: recorder(harness.revoked) },
                update: { useMutation: recorder([]) },
            },
            location: {
                listAdmin: { useQuery: query([{ id: 7, name: 'Home' }]) },
            },
            useUtils: () => ({}),
        },
    };
});

const { DevicesPanel } =
    await import('~/app/(app)/profile/_components/sensor-hub/DevicesPanel');

describe('DevicesPanel row menu', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.deleted.length = 0;
        harness.issued.length = 0;
        harness.revoked.length = 0;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<DevicesPanel />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('offers every device action in one menu per row', () => {
        openRowActions('Hallway board');
        expect(rowActionLabels()).toEqual([
            'Rotate token',
            'Revoke token',
            'Manage sensors',
            'Edit',
            'Delete',
        ]);
    });

    it('revokes a token only after the revoke is confirmed', () => {
        chooseRowAction('Hallway board', 'Revoke token');
        expect(harness.revoked).toEqual([]);
        confirmRowAction('Revoke token');
        expect(harness.revoked).toEqual([{ id: 1 }]);
    });

    it('asks before rotating a live token but issues a first token straight away', () => {
        chooseRowAction('Hallway board', 'Rotate token');
        expect(harness.issued).toEqual([]);
        confirmRowAction('Rotate token');
        expect(harness.issued).toEqual([{ id: 1 }]);

        openRowActions('Garage board');
        expect(rowActionLabels()).not.toContain('Revoke token');
        clickRowAction('Issue token');
        expect(harness.issued).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('deletes a device only after the delete is confirmed', () => {
        chooseRowAction('Garage board', 'Delete');
        expect(harness.deleted).toEqual([]);
        confirmRowAction('Delete');
        expect(harness.deleted).toEqual([{ id: 2 }]);
    });
});
