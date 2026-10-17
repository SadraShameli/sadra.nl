import { type ReactNode } from 'react';

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

export function ToolHeaderFrame({
    children,
    toolbar,
}: {
    readonly children: ReactNode;
    readonly toolbar: ReactNode;
}) {
    return (
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            {children}
            {toolbar}
        </header>
    );
}

export function ToolHeadingText({
    entry,
}: {
    readonly entry: ToolCatalogEntry;
}) {
    return (
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {entry.label}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                {entry.blurb}
            </p>
        </div>
    );
}

export function ToolPageHeading({
    ownQuery,
    pageQuery,
    toolId,
}: ToolPageHeadingProperties) {
    const entry = toolCatalogEntry(toolId);
    return (
        <ToolHeaderFrame
            toolbar={
                entry.sharesState && (
                    <CalculatorToolbar
                        ownQuery={ownQuery}
                        pageQuery={pageQuery}
                    />
                )
            }
        >
            <ToolHeadingText entry={entry} />
        </ToolHeaderFrame>
    );
}
