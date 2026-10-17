'use client';

import { type Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { subnavHref } from '~/app/(app)/_components/routeSubnavLinks';
import { ToolSectionHeading } from '~/app/(app)/_components/ToolSectionHeading';
import {
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
} from '~/components/ui/Card';
import { cn } from '~/lib/utilities';

import { readLastToolQuery } from './lastToolQuery';
import {
    LINKED_TOOL_CATALOG,
    pageStateBlobsOf,
    type ToolCatalogEntry,
    ToolGroup,
} from './toolCatalog';
import { withPageStateBlobsOnly } from './urlState';

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

export function hubCardHref(entry: ToolCatalogEntry, query = ''): Route {
    return subnavHref(
        { carriesQuery: entry.usesCalculatorInputs, href: entry.route },
        withPageStateBlobsOnly(query, pageStateBlobsOf(entry.id)),
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
                    <ToolSectionHeading id={`hub-group-${group}`}>
                        {label}
                    </ToolSectionHeading>
                    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                                        <Card className="h-full transition-colors group-hover:border-primary/60">
                                            <CardHeader>
                                                <CardTitle
                                                    as="h3"
                                                    className="flex items-center gap-2"
                                                >
                                                    <Icon
                                                        aria-hidden
                                                        className="size-4 text-primary"
                                                    />
                                                    {entry.label}
                                                </CardTitle>
                                                <CardDescription>
                                                    {entry.blurb}
                                                </CardDescription>
                                            </CardHeader>
                                        </Card>
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
