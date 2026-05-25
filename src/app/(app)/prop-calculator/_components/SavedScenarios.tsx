'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Bookmark, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '~/components/ui/Button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormMessage,
} from '~/components/ui/Form';
import { Input } from '~/components/ui/Input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';
import { type PropFirm } from '~/lib/prop-calculator';
import { cn } from '~/lib/utils';

import type { CalculatorState } from './types';

import {
    decodeState,
    encodeState,
    loadScenarios,
    persistScenarios,
    type SavedScenarioRecord,
} from './urlState';

const savedScenarioFormSchema = z.object({
    name: z.string().trim().min(1),
});
type SavedScenarioFormValues = z.infer<typeof savedScenarioFormSchema>;

interface SavedScenariosProps {
    firms: readonly PropFirm[];
    onLoad: (next: CalculatorState) => void;
    state: CalculatorState;
}

export default function SavedScenarios({
    firms,
    onLoad,
    state,
}: SavedScenariosProps) {
    const [scenarios, setScenarios] = useState<SavedScenarioRecord[]>([]);
    const [open, setOpen] = useState(false);

    const form = useForm<SavedScenarioFormValues>({
        defaultValues: { name: '' },
        resolver: zodResolver(savedScenarioFormSchema),
    });

    useEffect(() => {
        if (open) setScenarios(loadScenarios());
    }, [open]);

    const handleSave = form.handleSubmit((values) => {
        const params = encodeState(state).toString();
        const filtered = scenarios.filter((s) => s.name !== values.name);
        const next: SavedScenarioRecord[] = [
            ...filtered,
            { name: values.name, params, savedAt: Date.now() },
        ].toSorted((a, b) => b.savedAt - a.savedAt);
        persistScenarios(next);
        setScenarios(next);
        form.reset({ name: '' });
    });

    const handleLoad = (record: SavedScenarioRecord) => {
        const params = new URLSearchParams(record.params);
        const next = decodeState(params, firms, state);
        onLoad(next);
        setOpen(false);
    };

    const handleReplace = (record: SavedScenarioRecord) => {
        const params = encodeState(state).toString();
        const next = scenarios.map((s) =>
            s.name === record.name ? { ...s, params, savedAt: Date.now() } : s,
        );
        persistScenarios(next);
        setScenarios(next);
    };

    const handleDelete = (record: SavedScenarioRecord) => {
        const next = scenarios.filter((s) => s.name !== record.name);
        persistScenarios(next);
        setScenarios(next);
    };

    const handleClearAll = () => {
        persistScenarios([]);
        setScenarios([]);
    };

    return (
        <Popover onOpenChange={setOpen} open={open}>
            <PopoverTrigger asChild>
                <Button
                    className="h-7 gap-1.5 px-2 text-xs"
                    size="sm"
                    variant="outline"
                >
                    <Bookmark className="size-3.5" />
                    Saved scenarios
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
                <div className="flex flex-col gap-3">
                    <div className="text-sm font-semibold">
                        Save current scenario
                    </div>
                    <Form {...form}>
                        <form className="flex gap-2" onSubmit={handleSave}>
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem className="flex-1">
                                        <FormControl>
                                            <Input
                                                className="h-8"
                                                placeholder="Name"
                                                type="text"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button
                                className="h-8 px-3 text-xs"
                                disabled={!form.watch('name').trim()}
                                size="sm"
                                type="submit"
                            >
                                Save
                            </Button>
                        </form>
                    </Form>

                    <div className="border-t border-border/50 pt-2">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                Saved
                            </span>
                            {scenarios.length > 0 && (
                                <Button
                                    className="h-auto px-1 py-0 text-xs text-muted-foreground hover:text-destructive"
                                    onClick={handleClearAll}
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                >
                                    Clear all
                                </Button>
                            )}
                        </div>
                        {scenarios.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                No saved scenarios yet.
                            </p>
                        ) : (
                            <ul
                                className={cn(
                                    'app-prop-calculator__saved-scenarios-list',
                                    'flex flex-col gap-1',
                                )}
                            >
                                {scenarios.map((s) => (
                                    <li
                                        className={cn(
                                            'app-prop-calculator__saved-scenario-item',
                                            'flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-accent',
                                        )}
                                        key={s.name}
                                    >
                                        <Button
                                            className="h-auto flex-1 justify-start px-1 py-0 text-sm font-normal"
                                            onClick={() => handleLoad(s)}
                                            size="sm"
                                            type="button"
                                            variant="ghost"
                                        >
                                            {s.name}
                                        </Button>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                aria-label={`Replace ${s.name} with current config`}
                                                className="size-6 p-0 text-muted-foreground"
                                                onClick={() => handleReplace(s)}
                                                size="sm"
                                                type="button"
                                                variant="ghost"
                                            >
                                                <RotateCcw className="size-3.5" />
                                            </Button>
                                            <Button
                                                aria-label={`Delete ${s.name}`}
                                                className="size-6 p-0 text-muted-foreground hover:text-destructive"
                                                onClick={() => handleDelete(s)}
                                                size="sm"
                                                type="button"
                                                variant="ghost"
                                            >
                                                <Trash2 className="size-3.5" />
                                            </Button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
