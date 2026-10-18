import { Music2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '~/components/ui/button';
import { EmptyState } from '~/components/ui/empty-state';
import { Input } from '~/components/ui/input';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Skeleton } from '~/components/ui/skeleton';
import { DurationFormat } from '~/lib/lifting/format';
import { cn } from '~/lib/utilities';

import type { RecordingSummary } from './types';

interface RecordingListProperties {
    currentIdx: number;
    isLoading: boolean;
    isPlaying: boolean;
    onSelect: (recording: RecordingSummary) => void;
    recordings: RecordingSummary[] | undefined;
}

export function RecordingList({
    currentIdx,
    isLoading,
    isPlaying,
    onSelect,
    recordings,
}: RecordingListProperties) {
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
                'grid max-h-52 grid-rows-[auto_minmax(0,1fr)] gap-3',
            )}
        >
            <div className="flex items-center justify-between gap-3">
                <p className="m-0 type-micro text-ink-muted">Up next</p>
                <div className="relative w-40 sm:w-48">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        aria-label="Search recordings"
                        className={cn(
                            'app-recording__list-search',
                            'h-8 rounded-full pl-7 text-xs',
                        )}
                        disabled={!recordings?.length}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search"
                        type="search"
                        value={searchQuery}
                    />
                </div>
            </div>

            <ScrollArea>
                {isLoading ? (
                    <ul
                        aria-busy="true"
                        aria-label="Loading recordings"
                        className="flex flex-col gap-1 pr-3"
                    >
                        {LOADING_ROWS.map((width) => (
                            <li
                                className="flex items-center gap-3 p-2"
                                key={width}
                            >
                                <Skeleton className={cn('h-4', width)} />
                                <Skeleton className="ml-auto h-3 w-10" />
                            </li>
                        ))}
                    </ul>
                ) : recordings?.length ? (
                    filtered.length === 0 ? (
                        <EmptyState
                            icon={Search}
                            title="No recordings match your search"
                        />
                    ) : (
                        <ul
                            className={cn(
                                'app-recording__list-items',
                                'flex animate-in flex-col pr-3 duration-300 fade-in',
                            )}
                        >
                            {filtered.map((recording) => {
                                const isCurrent =
                                    recording.id === currentRecordingId;
                                const dur = recording.duration_seconds;
                                return (
                                    <li key={recording.id}>
                                        <Button
                                            className={cn(
                                                'app-recording__list-item',
                                                'group h-auto w-full justify-start gap-3 rounded-md p-2 text-left font-normal',
                                                isCurrent
                                                    ? 'text-foreground'
                                                    : 'text-muted-foreground hover:bg-foreground/3 hover:text-foreground',
                                            )}
                                            data-state={
                                                isCurrent
                                                    ? 'current'
                                                    : undefined
                                            }
                                            onClick={() => onSelect(recording)}
                                            type="button"
                                            variant="ghost"
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
                                                            ? 'text-foreground/80'
                                                            : 'text-muted-foreground',
                                                    )}
                                                >
                                                    {DurationFormat.seconds(
                                                        dur,
                                                    )}
                                                </span>
                                            )}
                                        </Button>
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

const LOADING_ROWS = ['w-3/5', 'w-2/5', 'w-1/2', 'w-2/3', 'w-1/3'] as const;

function PlayingIndicator() {
    return (
        <span
            aria-hidden
            className="flex size-4 items-end justify-center gap-0.5"
        >
            <span className="h-3 w-0.5 origin-bottom animate-eq rounded-full bg-foreground" />
            <span className="h-2.5 w-0.5 origin-bottom animate-eq rounded-full bg-foreground [animation-delay:0.15s]" />
            <span className="h-3.5 w-0.5 origin-bottom animate-eq rounded-full bg-foreground [animation-delay:0.3s]" />
        </span>
    );
}
