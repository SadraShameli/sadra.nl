import { ArrowRight, Music2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ScrollArea } from '~/components/ui/ScrollArea';
import { cn } from '~/lib/utils';

import type { RecordingSummary } from './types';

import { ConvertSecondsToString } from './helpers';

interface RecordingListProps {
    currentIdx: number;
    onSelect: (recording: RecordingSummary) => void;
    recordings: RecordingSummary[] | undefined;
}

export function RecordingList({
    currentIdx,
    onSelect,
    recordings,
}: RecordingListProps) {
    const [searchQuery, setSearchQuery] = useState('');

    const currentRecordingId = recordings?.[currentIdx]?.id;

    const filtered = useMemo(
        () =>
            recordings?.filter((r) =>
                r.file_name.toLowerCase().includes(searchQuery.toLowerCase()),
            ) ?? [],
        [recordings, searchQuery],
    );

    return (
        <div className="grid h-[27vh] grid-rows-[auto_1fr] gap-2 lg:h-[25vh]">
            <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-neutral-500" />
                <input
                    className="w-1/2 rounded-lg border border-white/10 bg-white/5 py-2 pr-3 pl-8 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-white/25 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!recordings?.length}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search…"
                    type="text"
                    value={searchQuery}
                />
            </div>

            <ScrollArea>
                {recordings?.length ? (
                    filtered.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center pt-8 text-center text-sm text-neutral-500">
                            No recordings match your search
                        </div>
                    ) : (
                        <div className="space-y-0.5 pr-3">
                            {filtered.map((recording) => {
                                const isCurrent =
                                    recording.id === currentRecordingId;
                                const dur = recording.duration_seconds;
                                return (
                                    <button
                                        className={cn(
                                            'group flex w-full items-center gap-x-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                                            isCurrent
                                                ? 'bg-white/10 text-white'
                                                : 'text-neutral-400 hover:bg-white/5 hover:text-white',
                                        )}
                                        key={recording.id}
                                        onClick={() => onSelect(recording)}
                                    >
                                        {isCurrent ? (
                                            <ArrowRight className="size-4 shrink-0" />
                                        ) : (
                                            <Music2 className="size-4 shrink-0" />
                                        )}
                                        <span className="min-w-0 flex-1 truncate text-left">
                                            {recording.file_name}
                                        </span>
                                        {dur != null && (
                                            <span
                                                className={cn(
                                                    'shrink-0 text-xs tabular-nums transition-colors',
                                                    isCurrent
                                                        ? 'text-white/50'
                                                        : 'text-neutral-600 group-hover:text-neutral-400',
                                                )}
                                            >
                                                {ConvertSecondsToString(dur)}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )
                ) : (
                    <div className="flex h-full flex-col items-center justify-center pt-8 text-center text-xs text-neutral-500">
                        No recordings yet
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
