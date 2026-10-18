import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    chooseRowAction,
    confirmRowAction,
    openRowActions,
    rowActionItem,
} from '../../components/rowActionsMenu';

const WORKOUT_ID = '00000000-0000-4000-8000-000000000061';

const harness = vi.hoisted(() => ({
    deleted: [] as unknown[],
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('~/trpc/react', () => ({
    api: {
        lifting: {
            workout: {
                delete: {
                    useMutation: () => ({
                        isPending: false,
                        mutate: (input: unknown) => {
                            harness.deleted.push(input);
                        },
                        variables: undefined,
                    }),
                },
                list: {
                    useQuery: () => ({
                        data: [
                            {
                                bodyweightKg: null,
                                endedAt: new Date('2026-10-01T10:00:00Z'),
                                id: WORKOUT_ID,
                                name: null,
                                notes: null,
                                startedAt: new Date('2026-10-01T09:00:00Z'),
                            },
                        ],
                        isLoading: false,
                    }),
                },
            },
        },
        useUtils: () => ({}),
    },
}));

const { HistoryView } =
    await import('~/app/(app)/lifting/_components/HistoryView');

describe('HistoryView row menu', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.deleted.length = 0;
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
        act(() => {
            root.render(
                <HistoryView from={new Date('2026-01-01T00:00:00Z')} />,
            );
        });
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('links the workout page from the row menu', () => {
        openRowActions('Workout');
        expect(rowActionItem('Open').getAttribute('href')).toBe(
            `/lifting/workouts/${WORKOUT_ID}`,
        );
    });

    it('deletes a workout only after the delete is confirmed', () => {
        chooseRowAction('Workout', 'Delete');
        expect(harness.deleted).toEqual([]);
        confirmRowAction('Delete');
        expect(harness.deleted).toEqual([{ id: WORKOUT_ID }]);
    });
});
