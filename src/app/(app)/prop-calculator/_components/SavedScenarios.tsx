'use client';

import { Bookmark, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { type PropFirm } from '~/lib/prop-calculator';

import { Button } from '~/components/ui/Button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '~/components/ui/Popover';

import type { CalculatorState } from './types';
import {
    decodeState,
    encodeState,
    loadScenarios,
    persistScenarios,
    type SavedScenarioRecord,
} from './urlState';

interface SavedScenariosProps {
    state: CalculatorState;
    firms: readonly PropFirm[];
    onLoad: (next: CalculatorState) => void;
}

export default function SavedScenarios({
    state,
    firms,
    onLoad,
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
        ].sort((a, b) => b.savedAt - a.savedAt);
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

    const handleDelete = (record: SavedScenarioRecord) => {
        const next = scenarios.filter((s) => s.name !== record.name);
        persistScenarios(next);
        setScenarios(next);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
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
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Name"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave();
                            }}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:border-input dark:bg-input/30"
                        />
                        <Button
                            type="button"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            onClick={handleSave}
                            disabled={!name.trim()}
                        >
                            Save
                        </Button>
                    </div>

                    <div className="border-t border-border/50 pt-2">
                        <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Saved
                        </div>
                        {scenarios.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                No saved scenarios yet.
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-1">
                                {scenarios.map((s) => (
                                    <li
                                        key={s.name}
                                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-accent"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => handleLoad(s)}
                                            className="flex-1 text-left text-sm"
                                        >
                                            {s.name}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(s)}
                                            aria-label={`Delete ${s.name}`}
                                            className="text-muted-foreground hover:text-rose-400"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
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
