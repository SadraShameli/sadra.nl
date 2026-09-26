import { readdirSync } from 'node:fs';

import { routes } from '~/lib/site/routes';

import { hasPageFile, propCalculatorAppDir } from './appPageFiles';

const TOOLS_ROOT = propCalculatorAppDir('(tools)');
const TOOL_ROUTE_PREFIX = `${routes.propCalculator.index}/`;

export function basePath(href: string): string {
    return href.split(/[?#]/, 1)[0] ?? href;
}

export function hasToolPage(route: string): boolean {
    return (
        route.startsWith(TOOL_ROUTE_PREFIX) &&
        hasToolPageFile(route.slice(TOOL_ROUTE_PREFIX.length))
    );
}

export function toolPageRoutes(): string[] {
    return readdirSync(TOOLS_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && hasToolPageFile(entry.name))
        .map((entry) => `${TOOL_ROUTE_PREFIX}${entry.name}`);
}

function hasToolPageFile(segment: string): boolean {
    return hasPageFile(TOOLS_ROOT, segment);
}
