'use client';

import { Dumbbell, Play, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '~/components/ui/AlertDialog';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { EmptyState } from '~/components/ui/EmptyState';
import { Skeleton } from '~/components/ui/Skeleton';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '~/components/ui/Tooltip';
import { routes } from '~/lib/site/routes';
import { api } from '~/trpc/react';

export function RoutinesView() {
    const router = useRouter();
    const utilities = api.useUtils();
    const routines = api.lifting.routine.list.useQuery();
    const deleteRoutine = api.lifting.routine.delete.useMutation({
        onSuccess: () => utilities.lifting.routine.list.invalidate(),
    });
    const startWorkout = api.lifting.workout.start.useMutation({
        onSuccess: () => router.push(routes.lifting.log),
    });

    if (routines.isLoading) {
        return (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                    <li key={index}>
                        <Skeleton className="h-32 w-full rounded-2xl" />
                    </li>
                ))}
            </ul>
        );
    }
    if (!routines.data || routines.data.length === 0) {
        return (
            <Card>
                <CardContent>
                    <EmptyState
                        description="Save your favorite workouts as routines for one-tap starts."
                        icon={Dumbbell}
                        title="No routines yet"
                    />
                </CardContent>
            </Card>
        );
    }

    return (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {routines.data.map((r) => (
                <li key={r.id}>
                    <Card>
                        <CardHeader className="pb-0">
                            <div>
                                <CardTitle>{r.name}</CardTitle>
                                <p className="text-xs text-muted-foreground">
                                    {r.blocks.length} exercises
                                </p>
                            </div>
                            <AlertDialog>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                aria-label="Delete routine"
                                                className="size-8 p-0"
                                                type="button"
                                                variant="ghost"
                                            >
                                                <Trash2 className="size-4 text-muted-foreground" />
                                            </Button>
                                        </AlertDialogTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        Delete routine
                                    </TooltipContent>
                                </Tooltip>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>
                                            Delete routine?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                            “{r.name}” will be permanently
                                            removed. Past workouts created from
                                            this routine are kept.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>
                                            Cancel
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() =>
                                                deleteRoutine.mutate({
                                                    id: r.id,
                                                })
                                            }
                                        >
                                            Delete
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
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
