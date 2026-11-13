'use client';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
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
import { type RouterOutputs, useTRPC } from '~/trpc/react';

type Routine = RouterOutputs['lifting']['routine']['list'][number];

export function RoutinesView() {
    const api = useTRPC();
    const routines = useQuery(api.lifting.routine.list.queryOptions());

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
    const api = useTRPC();
    const router = useRouter();
    const queryClient = useQueryClient();
    const routineDeletion = useMutation(
        api.lifting.routine.delete.mutationOptions({
            onError: (error) => toast.error(error.message),
            onSuccess: () =>
                queryClient.invalidateQueries(
                    api.lifting.routine.list.pathFilter(),
                ),
        }),
    );
    const startWorkout = useMutation(
        api.lifting.workout.start.mutationOptions({
            onError: (error) => toast.error(error.message),
            onSuccess: () => router.push(routes.lifting.log),
        }),
    );

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
