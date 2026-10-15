import { type ReactNode } from 'react';

import { CalculatorToolbar } from './CalculatorToolbar';
import {
    type OwnCodecToolId,
    type ToolCatalogEntry,
    toolCatalogEntry,
    type ToolId,
} from './toolCatalog';

export type ToolPageHeadingProperties =
    | { ownQuery: string; toolId: OwnCodecToolId }
    | { ownQuery?: never; toolId: Exclude<ToolId, OwnCodecToolId> };

export function ToolPageHeading({
    ownQuery,
    toolId,
}: ToolPageHeadingProperties) {
    const entry = toolCatalogEntry(toolId);
    return (
        <ToolHeaderFrame toolbar={entry.sharesState && <CalculatorToolbar ownQuery={ownQuery} />}>
            <ToolHeadingText entry={entry} />
        </ToolHeaderFrame>
    );
}

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

export function ToolHeadingText({ entry }: { readonly entry: ToolCatalogEntry }) {
    return (
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {entry.label}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                {entry.blurb}
            </p>
        </div>
    );
}
