'use client';

import { Bookmark, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '~/components/ui/Button';
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
    const [name, setName] = useState('');

    useEffect(() => {
        if (open) setScenarios(loadScenarios());
    }, [open]);

    const handleSave = () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const params = encodeState(state).toString();
        const filtered = scenarios.filter((s) => s.name !== trimmed);
        const next: SavedScenarioRecord[] = [
            ...filtered,
            { name: trimmed, params, savedAt: Date.now() },
        ].toSorted((a, b) => b.savedAt - a.savedAt);
        persistScenarios(next);
        setScenarios(next);
        setName('');
    };

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
                    <div className="flex gap-2">
                        <input
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:border-input dark:bg-input/30"
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave();
                            }}
                            placeholder="Name"
                            type="text"
                            value={name}
                        />
                        <Button
                            className="h-8 px-3 text-xs"
                            disabled={!name.trim()}
                            onClick={handleSave}
                            size="sm"
                            type="button"
                        >
                            Save
                        </Button>
                    </div>

                    <div className="border-t border-border/50 pt-2">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                Saved
                            </span>
                            {scenarios.length > 0 && (
                                <button
                                    className="text-xs text-muted-foreground hover:text-rose-400"
                                    onClick={handleClearAll}
                                    type="button"
                                >
                                    Clear all
                                </button>
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
                                        <button
                                            className="flex-1 text-left text-sm"
                                            onClick={() => handleLoad(s)}
                                            type="button"
                                        >
                                            {s.name}
                                        </button>
                                        <div className="flex items-center gap-1">
                                            <button
                                                aria-label={`Replace ${s.name} with current config`}
                                                className="text-muted-foreground hover:text-foreground"
                                                onClick={() => handleReplace(s)}
                                                type="button"
                                            >
                                                <RotateCcw className="size-3.5" />
                                            </button>
                                            <button
                                                aria-label={`Delete ${s.name}`}
                                                className="text-muted-foreground hover:text-rose-400"
                                                onClick={() => handleDelete(s)}
                                                type="button"
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
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
