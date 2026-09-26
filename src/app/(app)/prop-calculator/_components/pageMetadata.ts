import { type Metadata } from 'next';

import { ALL_FIRMS } from '~/lib/prop-calculator';
import { routes } from '~/lib/site/routes';

import { toolCatalogEntry, type ToolId } from './toolCatalog';

const HUB_TITLE = 'Prop Firm Calculator';

export function buildHubMetadata(): Metadata {
    const names = ALL_FIRMS.map((firm) => firm.displayName).join(', ');
    return {
        alternates: { canonical: routes.propCalculator.index },
        description: `Interactive Monte Carlo tools for ${firmCoverage()} (${names}): pass probability, days to pass, total cost, payouts and expected monthly net.`,
        title: HUB_TITLE,
    };
}

export function buildToolMetadata(id: ToolId): Metadata {
    const entry = toolCatalogEntry(id);
    return {
        alternates: { canonical: entry.route },
        description: `${firstSentence(entry.blurb)} Covers ${firmCoverage()}.`,
        title: `${entry.label} · ${HUB_TITLE}`,
    };
}

function firmCoverage(): string {
    return `${ALL_FIRMS.length} futures prop firms`;
}

function firstSentence(text: string): string {
    const end = text.indexOf('. ');
    return end === -1 ? text : text.slice(0, end + 1);
}
