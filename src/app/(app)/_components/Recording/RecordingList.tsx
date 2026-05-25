import { Music2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { EmptyState } from '~/components/ui/EmptyState';
import { ScrollArea } from '~/components/ui/ScrollArea';
import { DurationFormat } from '~/lib/lifting/format';
import { cn } from '~/lib/utils';

import type { RecordingSummary } from './types';

interface RecordingListProps {
    currentIdx: number;
    isPlaying: boolean;
    onSelect: (recording: RecordingSummary) => void;
    recordings: RecordingSummary[] | undefined;
}

export function RecordingList({
    currentIdx,
    isPlaying,
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
        <div
            className={cn(
                'app-recording__list',
                'grid h-[27vh] grid-rows-[auto_1fr] gap-3 lg:h-[25vh]',
            )}
        >
            <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-medium tracking-[0.2em] text-neutral-500 uppercase">
                    Up Next
                </p>
                <div className="relative w-40 sm:w-48">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3 -translate-y-1/2 text-neutral-500" />
                    <input
                        className={cn(
                            'app-recording__list-search',
                            'w-full rounded-full bg-white/4 py-1.5 pr-3 pl-7 text-xs text-white transition outline-none placeholder:text-neutral-500 focus:bg-white/8 disabled:cursor-not-allowed disabled:opacity-40',
                        )}
                        disabled={!recordings?.length}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search"
                        type="text"
                        value={searchQuery}
                    />
                </div>
            </div>

            <ScrollArea>
                {recordings?.length ? (
                    filtered.length === 0 ? (
                        <EmptyState
                            icon={Search}
                            title="No recordings match your search"
                        />
                    ) : (
                        <ul
                            className={cn(
                                'app-recording__list-items',
                                'flex flex-col pr-3',
                            )}
                        >
                            {filtered.map((recording) => {
                                const isCurrent =
                                    recording.id === currentRecordingId;
                                const dur = recording.duration_seconds;
                                return (
                                    <li key={recording.id}>
                                        <button
                                            className={cn(
                                                'app-recording__list-item',
                                                'group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition',
                                                isCurrent
                                                    ? 'text-foreground'
                                                    : 'text-neutral-400 hover:bg-white/3 hover:text-foreground',
                                            )}
                                            data-state={
                                                isCurrent
                                                    ? 'current'
                                                    : undefined
                                            }
                                            onClick={() => onSelect(recording)}
                                            type="button"
                                        >
                                            <span
                                                className={cn(
                                                    'min-w-0 flex-1 truncate',
                                                    isCurrent
                                                        ? 'font-semibold'
                                                        : 'font-normal',
                                                )}
                                            >
                                                {recording.file_name}
                                            </span>
                                            {isCurrent && isPlaying && (
                                                <PlayingIndicator />
                                            )}
                                            {dur != null && (
                                                <span
                                                    className={cn(
                                                        'shrink-0 text-xs tabular-nums',
                                                        isCurrent
                                                            ? 'text-neutral-300'
                                                            : 'text-neutral-500',
                                                    )}
                                                >
                                                    {DurationFormat.seconds(
                                                        dur,
                                                    )}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )
                ) : (
                    <EmptyState icon={Music2} title="No recordings yet" />
                )}
            </ScrollArea>
        </div>
    );
}

function PlayingIndicator() {
    return (
        <span
            aria-hidden
            className="flex h-4 w-4 items-end justify-center gap-0.5"
        >
            <span className="h-3 w-0.5 origin-bottom animate-eq rounded-full bg-foreground" />
            <span className="h-2.5 w-0.5 origin-bottom animate-eq rounded-full bg-foreground [animation-delay:0.15s]" />
            <span className="h-3.5 w-0.5 origin-bottom animate-eq rounded-full bg-foreground [animation-delay:0.3s]" />
        </span>
    );
}
