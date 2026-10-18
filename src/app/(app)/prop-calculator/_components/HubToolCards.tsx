'use client';

import { type Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { subnavHref } from '~/app/(app)/_components/routeSubnavLinks';
import { ToolPanel } from '~/components/ToolPanel';
import { ToolSectionHeading } from '~/components/ToolSectionHeading';
import { cn } from '~/lib/utilities';

import { readLastToolQuery } from './lastToolQuery';
import {
    LINKED_TOOL_CATALOG,
    type ToolCatalogEntry,
    toolsByGroup,
} from './toolCatalog';
import { toolNavPage } from './toolNavItems';

export function hubCardHref(entry: ToolCatalogEntry, query = ''): Route {
    return subnavHref(toolNavPage(entry, query), '');
}

export function HubToolCards() {
    const [lastQuery, setLastQuery] = useState<null | string>(null);

    useEffect(() => {
        setLastQuery(readLastToolQuery());
    }, []);

    const groups = toolsByGroup(LINKED_TOOL_CATALOG);

    return (
        <div className="gap-x-6 md:columns-2">
            {groups.map(({ group, label, tools }) => (
                <section
                    aria-labelledby={`hub-group-${group}`}
                    className="mb-10 flex break-inside-avoid flex-col gap-4"
                    key={group}
                >
                    <ToolSectionHeading id={`hub-group-${group}`}>
                        {label}
                    </ToolSectionHeading>
                    <ul className="flex flex-col gap-4">
                        {tools.map((entry) => {
                            const Icon = entry.icon;
                            return (
                                <li key={entry.id}>
                                    <Link
                                        className={cn(
                                            'app-prop-calculator__hub-card',
                                            'group block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                        )}
                                        href={hubCardHref(
                                            entry,
                                            lastQuery ?? undefined,
                                        )}
                                        prefetch={false}
                                    >
                                        <ToolPanel
                                            className="h-full gap-3 transition-colors group-hover:border-primary/60"
                                            title={
                                                <span className="flex items-center gap-2">
                                                    <Icon
                                                        aria-hidden
                                                        className="size-4 text-primary"
                                                    />
                                                    {entry.label}
                                                </span>
                                            }
                                            titleAs="h3"
                                        >
                                            <p className="m-0 text-sm text-ink-muted">
                                                {entry.blurb}
                                            </p>
                                        </ToolPanel>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}
        </div>
    );
}
