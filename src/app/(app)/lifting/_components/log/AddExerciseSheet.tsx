'use client';

import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '~/components/ui/Command';
import { EmptyState } from '~/components/ui/EmptyState';
import { Skeleton } from '~/components/ui/Skeleton';
import { api } from '~/trpc/react';

interface AddExerciseSheetProperties {
    onAdd: (exerciseId: string) => void;
    triggerLabel?: string;
}

export function AddExerciseSheet({
    onAdd,
    triggerLabel = 'Add exercise',
}: AddExerciseSheetProperties) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');

    useEffect(() => {
        const id = setTimeout(() => setDebouncedQuery(query), 250);
        return () => clearTimeout(id);
    }, [query]);

    const exercises = api.lifting.exercise.list.useQuery(
        { includeCustom: true, limit: 100, offset: 0, search: debouncedQuery },
        { enabled: open },
    );

    return (
        <>
            <Button
                className="gap-2"
                onClick={() => setOpen(true)}
                type="button"
                variant="outline"
            >
                <Plus className="size-4" /> {triggerLabel}
            </Button>
            <CommandDialog onOpenChange={setOpen} open={open}>
                <CommandInput
                    onValueChange={setQuery}
                    placeholder="Search exercises…"
                    value={query}
                />
                <CommandList>
                    {exercises.isLoading ? (
                        <div className="flex flex-col gap-2 px-2 py-2">
                            {Array.from({ length: 6 }).map((_, index) => (
                                <Skeleton
                                    className="h-10 w-full rounded-lg"
                                    key={index}
                                />
                            ))}
                        </div>
                    ) : (
                        <>
                            <CommandEmpty>
                                <EmptyState
                                    description="Try a different search."
                                    icon={Search}
                                    title="No matches"
                                />
                            </CommandEmpty>
                            <CommandGroup>
                                {exercises.data?.map((ex) => {
                                    const pick = () => {
                                        onAdd(ex.id);
                                        setOpen(false);
                                        setQuery('');
                                    };
                                    return (
                                        <CommandItem
                                            key={ex.id}
                                            keywords={[
                                                ex.equipment,
                                                ex.primaryMuscle,
                                            ]}
                                            onSelect={pick}
                                            value={`${ex.name}-${ex.id}`}
                                        >
                                            <div className="flex w-full items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium text-neutral-200">
                                                        {ex.name}
                                                    </p>
                                                    <p className="text-[11px] text-neutral-500">
                                                        {ex.equipment} ·{' '}
                                                        {ex.primaryMuscle}
                                                    </p>
                                                </div>
                                                {ex.isCustom && (
                                                    <Badge variant="secondary">
                                                        Custom
                                                    </Badge>
                                                )}
                                            </div>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        </>
                    )}
                </CommandList>
            </CommandDialog>
        </>
    );
}
