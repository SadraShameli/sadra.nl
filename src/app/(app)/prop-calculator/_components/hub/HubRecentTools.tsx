'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ToolSectionHeading } from '~/app/(app)/_components/ToolSectionHeading';
import {
    readRecentTools,
    recentToolLinks,
    recordToolVisit,
} from '~/app/(app)/prop-calculator/_components/hub/recentTools';
import { hubCardHref } from '~/app/(app)/prop-calculator/_components/HubToolCards';
import { readLastToolQuery } from '~/app/(app)/prop-calculator/_components/lastToolQuery';
import { type ToolCatalogEntry } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { Button } from '~/components/ui/Button';
import { Skeleton } from '~/components/ui/Skeleton';

interface RecentToolsState {
    lastQuery: null | string;
    tools: readonly ToolCatalogEntry[];
}

const RECENT_TOOL_PLACEHOLDERS = ['first', 'second', 'third'] as const;

export function HubRecentTools() {
    const [recent, setRecent] = useState<null | RecentToolsState>(null);

    useEffect(() => {
        setRecent({
            lastQuery: readLastToolQuery(),
            tools: recentToolLinks(readRecentTools()),
        });
    }, []);

    return (
        <section
            aria-labelledby="hub-recent-tools"
            className="mb-10 flex flex-col gap-3"
        >
            <ToolSectionHeading id="hub-recent-tools">
                Recently used
            </ToolSectionHeading>
            {recent === null ? (
                <div aria-hidden className="flex min-h-9 flex-wrap gap-2">
                    {RECENT_TOOL_PLACEHOLDERS.map((key) => (
                        <Skeleton className="h-9 w-36 rounded-md" key={key} />
                    ))}
                </div>
            ) : recent.tools.length === 0 ? (
                <p className="flex min-h-9 items-center text-sm text-muted-foreground">
                    The tools you open show up here.
                </p>
            ) : (
                <ul className="flex min-h-9 flex-wrap gap-2">
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
            )}
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
