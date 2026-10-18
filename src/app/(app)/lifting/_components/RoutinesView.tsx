'use client';

import { Dumbbell, History, Play } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { RoutinesViewSkeleton } from '~/app/(app)/lifting/_components/LiftingSkeletons';
import { deleteRowAction, RowActionsMenu } from '~/components/RowActionsMenu';
import { ToolPanel } from '~/components/ToolPanel';
import { Button } from '~/components/ui/button';
import { EmptyStatePanel } from '~/components/ui/empty-state';
import { Spinner } from '~/components/ui/spinner';
import { routes } from '~/lib/site/routes';
import { api, type RouterOutputs } from '~/trpc/react';

type Routine = RouterOutputs['lifting']['routine']['list'][number];

export function RoutinesView() {
    const routines = api.lifting.routine.list.useQuery();

    if (routines.isLoading) {
        return <RoutinesViewSkeleton />;
    }
    return !routines.data || routines.data.length === 0 ? (
        <EmptyStatePanel
            action={
                <Button asChild className="gap-2">
                    <Link href={routes.lifting.history}>
                        <History className="size-4" />
                        Open history
                    </Link>
                </Button>
            }
            description="Open a past workout and choose Save as routine for one-tap starts."
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
        onError: (error) => toast.error(error.message),
        onSuccess: () => utilities.lifting.routine.list.invalidate(),
    });
    const startWorkout = api.lifting.workout.start.useMutation({
        onError: (error) => toast.error(error.message),
        onSuccess: () => router.push(routes.lifting.log),
    });

    return (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {routines.map((r) => {
                const isStarting =
                    startWorkout.isPending &&
                    startWorkout.variables.routineId === r.id;
                return (
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
                            description={`${String(r.blocks.length)} exercise${r.blocks.length === 1 ? '' : 's'}`}
                            title={r.name}
                        >
                            <Button
                                className="w-full gap-2"
                                disabled={startWorkout.isPending}
                                onClick={() =>
                                    startWorkout.mutate({ routineId: r.id })
                                }
                                type="button"
                            >
                                {isStarting ? (
                                    <Spinner />
                                ) : (
                                    <Play className="size-4" />
                                )}{' '}
                                Start
                            </Button>
                        </ToolPanel>
                    </li>
                );
            })}
        </ul>
    );
}
