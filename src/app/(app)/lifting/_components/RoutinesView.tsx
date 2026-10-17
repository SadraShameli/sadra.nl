'use client';

import { Dumbbell, Play, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { EmptyState } from '~/components/ui/EmptyState';
import { Skeleton } from '~/components/ui/Skeleton';
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
        <Card>
            <CardContent>
                <EmptyState
                    description="Save your favorite workouts as routines for one-tap starts."
                    icon={Dumbbell}
                    title="No routines yet"
                />
            </CardContent>
        </Card>
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
                    <Card>
                        <CardHeader className="pb-0">
                            <div>
                                <CardTitle>{r.name}</CardTitle>
                                <p className="text-xs text-muted-foreground">
                                    {r.blocks.length} exercises
                                </p>
                            </div>
                            <ConfirmDialog
                                confirmLabel="Delete"
                                description={
                                    <>
                                        “{r.name}” will be permanently removed.
                                        Past workouts created from this routine
                                        are kept.
                                    </>
                                }
                                onConfirm={() =>
                                    routineDeletion.mutate({
                                        id: r.id,
                                    })
                                }
                                title="Delete routine?"
                                tooltip="Delete routine"
                            >
                                <Button
                                    aria-label="Delete routine"
                                    className="size-8 p-0"
                                    type="button"
                                    variant="ghost"
                                >
                                    <Trash2 className="size-4 text-muted-foreground" />
                                </Button>
                            </ConfirmDialog>
                        </CardHeader>
                        <CardContent>
                            <Button
                                className="w-full gap-2"
                                onClick={() =>
                                    startWorkout.mutate({ routineId: r.id })
                                }
                                type="button"
                            >
                                <Play className="size-4" /> Start
                            </Button>
                        </CardContent>
                    </Card>
                </li>
            ))}
        </ul>
    );
}
