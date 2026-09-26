import { readdirSync } from 'node:fs';

import { routes } from '~/lib/site/routes';

import { hasPageFile, propCalculatorAppDir } from './appPageFiles';
import { basePath } from './toolPageFiles';

const ACCOUNTS_ROOT = propCalculatorAppDir('accounts');
const ACCOUNTS_INDEX = routes.propCalculator.accounts.index;
const ACCOUNTS_ROUTE_PREFIX = `${ACCOUNTS_INDEX}/`;
const STATIC_SEGMENT = /^[a-z0-9-]+$/;

export function accountsPageRoutes(): string[] {
    const nested = readdirSync(ACCOUNTS_ROOT, { withFileTypes: true })
        .filter(
            (entry) =>
                entry.isDirectory() &&
                STATIC_SEGMENT.test(entry.name) &&
                hasAccountsPageFile(entry.name),
        )
        .map((entry) => `${ACCOUNTS_ROUTE_PREFIX}${entry.name}`);
    return hasAccountsPageFile('') ? [ACCOUNTS_INDEX, ...nested] : nested;
}

export function hasAccountsPage(href: string): boolean {
    const route = basePath(href);
    return route === ACCOUNTS_INDEX
        ? hasAccountsPageFile('')
        : route.startsWith(ACCOUNTS_ROUTE_PREFIX) &&
              hasAccountsPageFile(route.slice(ACCOUNTS_ROUTE_PREFIX.length));
}

function hasAccountsPageFile(segment: string): boolean {
    return hasPageFile(ACCOUNTS_ROOT, segment);
}
