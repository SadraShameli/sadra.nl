'use client';

import { History } from 'lucide-react';
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
import { ToolPanel } from '~/components/ToolPanel';
import { Button } from '~/components/ui/button';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';
import { Skeleton } from '~/components/ui/skeleton';

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
        <section aria-labelledby="hub-recent-tools" className="mb-10">
            <ToolPanel
                contentClassName="gap-3"
                title="Recently used"
                titleId="hub-recent-tools"
            >
                {recent === null ? (
                    <div aria-hidden className="flex min-h-9 flex-wrap gap-2">
                        {RECENT_TOOL_PLACEHOLDERS.map((key) => (
                            <Skeleton
                                className="h-9 w-36 rounded-md"
                                key={key}
                            />
                        ))}
                    </div>
                ) : recent.tools.length === 0 ? (
                    <EmptyState
                        description="The tools you open show up here."
                        icon={History}
                        size={EmptyStateSize.Compact}
                        title="No tools opened yet"
                    />
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
            </ToolPanel>
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
