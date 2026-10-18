'use client';

import { Dumbbell, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { deleteRowAction, RowActionsMenu } from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import { Button } from '~/components/ui/button';
import { EmptyStatePanel } from '~/components/ui/empty-state';
import { Skeleton } from '~/components/ui/skeleton';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

type Routine = RouterOutputs['lifting']['routine']['list'][number];

export function RoutinesView() {
    const routines = api.lifting.routine.list.useQuery();

    if (routines.isLoading) {
        return (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }, (_, index) => (
                    <li key={index}>
                        <Skeleton className="h-32 w-full rounded-2xl" />
                    </li>
                ))}
            </ul>
        );
    }
    return !routines.data || routines.data.length === 0 ? (
        <EmptyStatePanel
            description="Save your favorite workouts as routines for one-tap starts."
            icon={Dumbbell}
            title="No routines yet"
        />
    ) : (
        <RoutinesList routines={routines.data} />
    );
}

function RoutinesList({ routines }: { routines: readonly Routine[] }) {
    const router = useRouter();
    const utilities = api.useUtils();
    const routineDeletion = api.lifting.routine.delete.useMutation({
        onSuccess: () => utilities.lifting.routine.list.invalidate(),
    });
    const startWorkout = api.lifting.workout.start.useMutation({
        onSuccess: () => router.push(routes.lifting.log),
    });

    return (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {routines.map((r) => (
                <li key={r.id}>
                    <ToolPanel
                        actions={
                            <RowActionsMenu
                                actions={[
                                    deleteRowAction({
                                        description: `“${r.name}” will be permanently removed. Past workouts created from this routine are kept.`,
                                        onDelete: () =>
                                            routineDeletion.mutate({
                                                id: r.id,
                                            }),
                                        title: 'Delete routine?',
                                    }),
                                ]}
                                isPending={
                                    routineDeletion.isPending &&
                                    routineDeletion.variables.id === r.id
                                }
                                label={r.name}
                            />
                        }
                        description={`${r.blocks.length} exercises`}
                        title={r.name}
                    >
                        <Button
                            className="w-full gap-2"
                            onClick={() =>
                                startWorkout.mutate({ routineId: r.id })
                            }
                            type="button"
                        >
                            <Play className="size-4" /> Start
                        </Button>
                    </ToolPanel>
                </li>
            ))}
        </ul>
    );
}
