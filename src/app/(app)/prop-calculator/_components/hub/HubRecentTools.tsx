'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
    readRecentTools,
    recentToolLinks,
    recordToolVisit,
} from '~/app/(app)/prop-calculator/_components/hub/recentTools';
import { hubCardHref } from '~/app/(app)/prop-calculator/_components/HubToolCards';
import { readLastToolQuery } from '~/app/(app)/prop-calculator/_components/lastToolQuery';
import { type ToolCatalogEntry } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { cn } from '~/lib/utilities';

interface RecentToolsState {
    lastQuery: null | string;
    tools: readonly ToolCatalogEntry[];
}

const NO_RECENT_TOOLS: RecentToolsState = { lastQuery: null, tools: [] };

export function HubRecentTools() {
    const [recent, setRecent] = useState<RecentToolsState>(NO_RECENT_TOOLS);

    useEffect(() => {
        setRecent({
            lastQuery: readLastToolQuery(),
            tools: recentToolLinks(readRecentTools()),
        });
    }, []);

    if (recent.tools.length === 0) return null;

    return (
        <section
            aria-labelledby="hub-recent-tools"
            className="mb-10 flex flex-col gap-3"
        >
            <h2
                className="text-lg font-semibold tracking-tight text-white"
                id="hub-recent-tools"
            >
                Recently used
            </h2>
            <ul className="flex flex-wrap gap-2">
                {recent.tools.map((entry) => {
                    const Icon = entry.icon;
                    return (
                        <li key={entry.id}>
                            <Link
                                className={cn(
                                    'app-prop-calculator__recent-tool',
                                    'flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm font-medium text-white transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                )}
                                href={hubCardHref(
                                    entry,
                                    recent.lastQuery ?? undefined,
                                )}
                                prefetch={false}
                            >
                                <Icon
                                    aria-hidden
                                    className="size-4 text-primary"
                                />
                                {entry.label}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

export function RecentToolRecorder() {
    const pathname = usePathname();

    useEffect(() => {
        recordToolVisit(pathname);
    }, [pathname]);

    return null;
}
