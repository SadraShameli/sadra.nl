import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
    completed: [] as unknown[],
    recorder: (sink: unknown[]) => () => ({
        isPending: false,
        mutate: (input: unknown) => {
            sink.push(input);
        },
        mutateAsync: (input: unknown) => {
            sink.push(input);
            return Promise.resolve({ ok: true });
        },
    }),
    updated: [] as unknown[],
}));

vi.mock('~/trpc/react', () => {
    const { recorder } = harness;
    return {
        api: {
            lifting: {
                set: {
                    complete: { useMutation: recorder(harness.completed) },
                    create: { useMutation: recorder([]) },
                    delete: { useMutation: recorder([]) },
                    update: { useMutation: recorder(harness.updated) },
                },
                workout: {
                    removeExercise: { useMutation: recorder([]) },
                },
            },
            useUtils: () => ({
                lifting: { workout: { getActive: { invalidate: vi.fn() } } },
            }),
        },
    };
});

const { ExerciseCard } =
    await import('~/app/(app)/lifting/_components/log/ExerciseCard');
const { TooltipProvider } = await import('~/components/ui/tooltip');

const PENDING_SET_ID = '00000000-0000-4000-8000-000000000041';

function copiedWorkoutExercise() {
    return {
        exercise: {
            defaultRestSeconds: 120,
            name: 'Back squat',
        },
        exerciseId: '00000000-0000-4000-8000-000000000042',
        id: '00000000-0000-4000-8000-000000000043',
        order: 1,
        sets: [
            {
                completedAt: null,
                distanceM: null,
                durationS: null,
                id: PENDING_SET_ID,
                isPr: false,
                notes: null,
                order: 1,
                reps: 5,
                rir: null,
                rpe: null,
                tempo: null,
                type: 'working',
                weightKg: 100,
            },
        ],
        supersetGroup: null,
        workoutId: '00000000-0000-4000-8000-000000000044',
    };
}

describe('ExerciseCard', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.completed.length = 0;
        harness.updated.length = 0;
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

    it('persists completion when a pending copied set is completed', async () => {
        const onRequestRest = vi.fn();
        act(() => {
            root.render(
                <TooltipProvider>
                    <ExerciseCard
                        availablePlatesKg={[20, 10, 5]}
                        barWeightKg={20}
                        defaultRestSeconds={90}
                        onRequestRest={onRequestRest}
                        unitDistance="m"
                        unitWeight="kg"
                        workoutExercise={copiedWorkoutExercise() as never}
                    />
                </TooltipProvider>,
            );
        });
        const complete = container.querySelector('[aria-label="Complete set"]');
        if (!(complete instanceof HTMLElement)) {
            throw new TypeError('no Complete set button');
        }
        await act(async () => {
            complete.click();
            await Promise.resolve();
        });

        expect(harness.updated).toHaveLength(1);
        expect(harness.completed).toEqual([
            expect.objectContaining({ id: PENDING_SET_ID }),
        ]);
        expect(onRequestRest).toHaveBeenCalledWith(120);
    });
});
