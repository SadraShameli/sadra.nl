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
import { Button } from '~/components/ui/Button';

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
                            <Button asChild variant="outline">
                                <Link
                                    className="app-prop-calculator__recent-tool"
                                    href={hubCardHref(
                                        entry,
                                        recent.lastQuery ?? undefined,
                                    )}
                                    prefetch={false}
                                >
                                    <Icon
                                        aria-hidden
                                        className="text-primary"
                                    />
                                    {entry.label}
                                </Link>
                            </Button>
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
