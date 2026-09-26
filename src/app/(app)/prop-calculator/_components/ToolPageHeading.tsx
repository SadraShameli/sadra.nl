import { CalculatorToolbar } from './CalculatorToolbar';
import {
    type OwnCodecToolId,
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
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    {entry.label}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                    {entry.blurb}
                </p>
            </div>
            {entry.sharesState && <CalculatorToolbar ownQuery={ownQuery} />}
        </header>
    );
}
