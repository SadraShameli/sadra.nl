import { type ReactNode } from 'react';

import { ToolPageHeader } from '~/app/(app)/_components/ToolPageHeader';
import { siteToolTitle, ToolTicker } from '~/lib/site/content';

import { CalculatorToolbar } from './CalculatorToolbar';
import {
    type OwnCodecToolId,
    type ToolCatalogEntry,
    toolCatalogEntry,
    type ToolId,
} from './toolCatalog';

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
}: {
    readonly actions?: ReactNode;
    readonly entry: ToolCatalogEntry;
}) {
    return (
        <ToolPageHeader
            actions={actions}
            eyebrow={siteToolTitle(ToolTicker.PropCalculator)}
            lead={entry.blurb}
            title={entry.label}
        />
    );
}

export function ToolPageHeading({
    ownQuery,
    pageQuery,
    toolId,
}: ToolPageHeadingProperties) {
    const entry = toolCatalogEntry(toolId);
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
        />
    );
}
