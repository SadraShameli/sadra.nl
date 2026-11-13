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
    achieved: [] as unknown[],
    deleted: [] as unknown[],
    goal: (id: string, status: string, targetValue: number) => ({
        achievedAt: null,
        createdAt: new Date('2026-09-01T00:00:00Z'),
        exerciseId: null,
        exerciseName: null,
        exerciseSlug: null,
        id,
        kind: 'bodyweight',
        status,
        targetDate: null,
        targetValue,
        userId: 'lifter',
    }),
    recorder: (sink: unknown[]) => () => ({
        error: null,
        isPending: false,
        mutate: (input: unknown) => {
            sink.push(input);
        },
    }),
    updated: [] as unknown[],
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', async () => {
    const { trpcDoubleReact } = await import('../../../stubs/trpcDouble');
    const { goal, recorder } = harness;

    return trpcDoubleReact({
        api: {
            lifting: {
                goal: {
                    create: { mutation: recorder([]) },
                    delete: { mutation: recorder(harness.deleted) },
                    list: {
                        query: () => ({
                            data: [
                                goal('goal-active', 'active', 80),
                                goal('goal-paused', 'paused', 78),
                                goal('goal-failed', 'failed', 76),
                            ],
                            isLoading: false,
                        }),
                    },
                    markAchieved: {
                        mutation: recorder(harness.achieved),
                    },
                    update: { mutation: recorder(harness.updated) },
                },
                settings: {
                    get: {
                        query: () => ({
                            data: { unitWeight: 'kg' },
                        }),
                    },
                },
            },
            queryClient: () => ({}),
        },
    });
});

const { GoalsView } = await import('~/app/(app)/lifting/_components/GoalsView');

describe('GoalsView row menu', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.achieved.length = 0;
        harness.deleted.length = 0;
        harness.updated.length = 0;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(<GoalsView />);
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('offers the status changes that fit each goal', () => {
        openRowActions('Bodyweight 80 kg');
        expect(rowActionLabels()).toEqual([
            'Mark achieved',
            'Pause',
            'Mark failed',
            'Delete',
        ]);
        clickRowAction('Mark achieved');
        expect(harness.achieved).toEqual([{ id: 'goal-active' }]);

        openRowActions('Bodyweight 78 kg');
        expect(rowActionLabels()).toEqual(['Resume', 'Delete']);
        clickRowAction('Resume');

        openRowActions('Bodyweight 76 kg');
        expect(rowActionLabels()).toEqual(['Reopen', 'Delete']);
        clickRowAction('Reopen');

        expect(harness.updated).toEqual([
            expect.objectContaining({ id: 'goal-paused', status: 'active' }),
            expect.objectContaining({ id: 'goal-failed', status: 'active' }),
        ]);
    });

    it('deletes a goal only after the delete is confirmed', () => {
        chooseRowAction('Bodyweight 80 kg', 'Delete');
        expect(harness.deleted).toEqual([]);
        confirmRowAction('Delete');
        expect(harness.deleted).toEqual([{ id: 'goal-active' }]);
    });
});
