import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { routes } from '~/lib/site/routes';

const TOOLS_ROOT = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
    '(tools)',
);
const TOOL_ROUTE_PREFIX = `${routes.propCalculator.index}/`;

export function basePath(href: string): string {
    return href.split(/[?#]/, 1)[0] ?? href;
}

export function hasToolPage(route: string): boolean {
    return (
        route.startsWith(TOOL_ROUTE_PREFIX) &&
        hasPageFile(route.slice(TOOL_ROUTE_PREFIX.length))
    );
}

export function toolPageRoutes(): string[] {
    return readdirSync(TOOLS_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && hasPageFile(entry.name))
        .map((entry) => `${TOOL_ROUTE_PREFIX}${entry.name}`);
}

function hasPageFile(segment: string): boolean {
    return existsSync(path.join(TOOLS_ROOT, segment, 'page.tsx'));
}
