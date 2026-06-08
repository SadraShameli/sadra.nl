'use client';

import { Activity } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { LogLevel } from '~/lib/accounting/runner-types';

import { EmptyState } from '~/components/ui/EmptyState';
import { cn } from '~/lib/utils';

export interface LogLine {
    level: LogLevel;
    message: string;
    ts: number;
}

interface Props {
    className?: string;
    lines: LogLine[];
    maxHeight?: string;
}

export function EventLog({ className, lines, maxHeight = 'max-h-72' }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [lines]);
    return (
        <div
            className={cn(
                'app-accounting__event-log',
                'overflow-y-auto rounded-md border border-border/40 bg-black/40 p-3 font-mono text-[11px] leading-relaxed',
                maxHeight,
                className,
            )}
            ref={scrollRef}
        >
            {lines.length === 0 ? (
                <EmptyState
                    description="Start a run to see the log."
                    icon={Activity}
                    title="No events yet"
                />
            ) : (
                <ul className="space-y-1">
                    {lines.map((l, i) => (
                        <li
                            className={cn(
                                'flex items-start gap-2',
                                l.level === 'error' && 'text-red-400',
                                l.level === 'warn' && 'text-amber-300',
                                l.level === 'info' && 'text-slate-200',
                            )}
                            key={i}
                        >
                            <span className="shrink-0 text-muted-foreground">
                                {new Date(l.ts).toISOString().slice(11, 19)}
                            </span>
                            <span className="wrap-break-word">{l.message}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
