'use client';

import { type ReactNode } from 'react';

import { type RouteSubnavItem } from '~/app/(app)/_components/RouteSubnav';
import { activeSubnavGroup } from '~/app/(app)/_components/routeSubnavLinks';
import { SectionPageTabs } from '~/app/(app)/_components/SectionPageTabs';
import { PageHeader } from '~/components/PageHeader';
import { siteToolTitle, ToolTicker } from '~/lib/site/content';

import { CalculatorToolbar } from './CalculatorToolbar';
import {
    type OwnCodecToolId,
    type ToolCatalogEntry,
    toolCatalogEntry,
    type ToolId,
} from './toolCatalog';
import { useToolNavItems } from './useToolNavItems';

export type ToolPageHeadingProperties =
    | { ownQuery: string; pageQuery?: never; toolId: OwnCodecToolId }
    | {
          ownQuery?: never;
          pageQuery?: string;
          toolId: Exclude<ToolId, OwnCodecToolId>;
      };

export function ToolEntryHeader({
    actions,
    entry,
    tabs,
}: {
    readonly actions?: ReactNode;
    readonly entry: ToolCatalogEntry;
    readonly tabs?: ReactNode;
}) {
    return (
        <PageHeader
            actions={actions}
            eyebrow={siteToolTitle(ToolTicker.PropCalculator)}
            lead={entry.blurb}
            tabs={tabs}
            title={entry.label}
        />
    );
}

export function toolGroupTabs(
    entry: ToolCatalogEntry,
    navItems: readonly RouteSubnavItem[],
): ReactNode {
    return activeSubnavGroup(entry.route, navItems) ===
        undefined ? undefined : (
        <SectionPageTabs
            items={navItems}
            label="Prop calculator tools in this group"
        />
    );
}

export function ToolPageHeading({
    ownQuery,
    pageQuery,
    toolId,
}: ToolPageHeadingProperties) {
    const entry = toolCatalogEntry(toolId);
    const navItems = useToolNavItems();
    return (
        <ToolEntryHeader
            actions={
                entry.sharesState ? (
                    <CalculatorToolbar
                        ownQuery={ownQuery}
                        pageQuery={pageQuery}
                    />
                ) : undefined
            }
            entry={entry}
            tabs={toolGroupTabs(entry, navItems)}
        />
    );
}
