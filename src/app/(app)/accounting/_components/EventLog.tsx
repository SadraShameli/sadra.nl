'use client';

import { Activity } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { LogLevel } from '~/lib/accounting/runner-types';

import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { formatDisplayTimeWithSeconds } from '~/lib/format';
import { cn } from '~/lib/utilities';

export interface LogLine {
    level: LogLevel;
    message: string;
    ts: number;
}

interface Properties {
    className?: string;
    lines: LogLine[];
    maxHeight?: string;
}

export function EventLog({
    className,
    lines,
    maxHeight = 'max-h-72',
}: Properties) {
    const scrollReference = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const element = scrollReference.current;
        if (element) element.scrollTop = element.scrollHeight;
    }, [lines]);
    if (lines.length === 0) {
        return (
            <EmptyState
                className={className}
                description="Start a run to see the log."
                icon={Activity}
                size={EmptyStateSize.Compact}
                title="No events yet"
            />
        );
    }
    return (
        <div
            className={cn(
                'app-accounting__event-log',
                'overflow-y-auto rounded-lg border border-line-faint bg-surface-sunken p-4 font-mono text-xs/relaxed',
                maxHeight,
                className,
            )}
            ref={scrollReference}
        >
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {lines.map((l, index) => (
                    <li
                        className={cn(
                            'flex items-start gap-2',
                            l.level === 'error' && 'text-destructive',
                            l.level === 'warn' && 'text-warning',
                            l.level === 'info' && 'text-ink-soft',
                        )}
                        key={index}
                    >
                        <span className="shrink-0 text-ink-muted tabular-nums">
                            {formatDisplayTimeWithSeconds(new Date(l.ts))}
                        </span>
                        <span className="wrap-break-word">{l.message}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
