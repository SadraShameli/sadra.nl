'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { subnavHref } from '~/app/(app)/_components/routeSubnavLinks';
import { cn } from '~/lib/utilities';

import { readLastToolQuery } from './lastToolQuery';
import {
    LINKED_TOOL_CATALOG,
    type ToolCatalogEntry,
    ToolGroup,
} from './toolCatalog';

export interface HubToolGroup {
    group: ToolGroup;
    label: string;
    tools: readonly ToolCatalogEntry[];
}

const HUB_GROUP_LABELS: Readonly<Record<ToolGroup, string>> = {
    [ToolGroup.Analyse]: 'Analyse',
    [ToolGroup.Compare]: 'Compare',
    [ToolGroup.Labs]: 'Labs',
    [ToolGroup.Plan]: 'Plan',
    [ToolGroup.Simulate]: 'Simulate',
    [ToolGroup.Size]: 'Size',
};

const HUB_GROUP_ORDER: readonly ToolGroup[] = [
    ToolGroup.Simulate,
    ToolGroup.Analyse,
    ToolGroup.Size,
    ToolGroup.Compare,
    ToolGroup.Plan,
    ToolGroup.Labs,
];

export function hubCardHref(entry: ToolCatalogEntry, query = ''): string {
    return subnavHref(
        { carriesQuery: entry.usesCalculatorInputs, href: entry.route },
        query,
    );
}

export function HubToolCards() {
    const [lastQuery, setLastQuery] = useState<null | string>(null);

    useEffect(() => {
        setLastQuery(readLastToolQuery());
    }, []);

    const groups = hubToolGroups(LINKED_TOOL_CATALOG);

    return (
        <div className="flex flex-col gap-10">
            {groups.map(({ group, label, tools }) => (
                <section
                    aria-labelledby={`hub-group-${group}`}
                    className="flex flex-col gap-4"
                    key={group}
                >
                    <h2
                        className="text-lg font-semibold tracking-tight text-white"
                        id={`hub-group-${group}`}
                    >
                        {label}
                    </h2>
                    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {tools.map((entry) => {
                            const Icon = entry.icon;
                            return (
                                <li key={entry.id}>
                                    <Link
                                        className={cn(
                                            'app-prop-calculator__hub-card',
                                            'flex h-full flex-col gap-2 rounded-xl border border-border/60 bg-card p-5 transition-colors hover:border-primary/60 hover:bg-card/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                        )}
                                        href={hubCardHref(
                                            entry,
                                            lastQuery ?? undefined,
                                        )}
                                        prefetch={false}
                                    >
                                        <span className="flex items-center gap-2 text-base font-semibold text-white">
                                            <Icon
                                                aria-hidden
                                                className="size-4 text-primary"
                                            />
                                            {entry.label}
                                        </span>
                                        <span className="text-sm text-muted-foreground">
                                            {entry.blurb}
                                        </span>
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

export function hubToolGroups(
    catalog: readonly ToolCatalogEntry[],
): readonly HubToolGroup[] {
    return HUB_GROUP_ORDER.map((group) => ({
        group,
        label: HUB_GROUP_LABELS[group],
        tools: catalog.filter((entry) => entry.group === group),
    })).filter((entry) => entry.tools.length > 0);
}
