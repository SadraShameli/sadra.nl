import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    apiRoutes,
    disallowedCrawlPaths,
    indexableRoutes,
    profileTabs,
    routes,
    withQuery,
} from '~/lib/site/routes';

const APP_ROOT = path.join(process.cwd(), 'src', 'app');

function pageRoutes(): ReadonlySet<string> {
    const found = new Set<string>();
    const walk = (directory: string, segments: readonly string[]) => {
        for (const entry of readdirSync(directory)) {
            const full = path.join(directory, entry);
            if (statSync(full).isDirectory()) {
                const isGroup = entry.startsWith('(') && entry.endsWith(')');
                walk(full, isGroup ? segments : [...segments, entry]);
            } else if (entry === 'page.tsx') {
                found.add(`/${segments.join('/')}`);
            }
        }
    };
    walk(APP_ROOT, []);
    return found;
}

function propCalculatorToolRoutes(): string[] {
    return Object.values(routes.propCalculator).filter(
        (route) => typeof route === 'string',
    );
}

describe('routes', () => {
    it('declares stable string constants at every leaf', () => {
        expect(routes.home).toBe('/');
        expect(routes.auth.login).toBe('/login');
        expect(routes.tradeChecklist.journal).toBe('/trade-checklist/journal');
        expect(routes.legal.privacy).toBe('/legal/privacy');
    });
});

describe('routes.propCalculator', () => {
    it('pins the hub and every tool route', () => {
        expect(routes.propCalculator.index).toBe('/prop-calculator');
        expect(routes.propCalculator.simulator).toBe(
            '/prop-calculator/simulator',
        );
        expect(routes.propCalculator.analysis).toBe(
            '/prop-calculator/analysis',
        );
        expect(routes.propCalculator.sizing).toBe('/prop-calculator/sizing');
        expect(routes.propCalculator.compare).toBe('/prop-calculator/compare');
        expect(routes.propCalculator.cashFlow).toBe(
            '/prop-calculator/cash-flow',
        );
        expect(routes.propCalculator.ladderLab).toBe(
            '/prop-calculator/ladder-lab',
        );
        expect(routes.propCalculator.strategyLab).toBe(
            '/prop-calculator/strategy-lab',
        );
        expect(routes.propCalculator.planner).toBe('/prop-calculator/planner');
        expect(routes.propCalculator.positionSize).toBe(
            '/prop-calculator/position-size',
        );
        expect(routes.propCalculator.fundedOptimizer).toBe(
            '/prop-calculator/funded-optimizer',
        );
        expect(routes.propCalculator.live).toBe('/prop-calculator/live');
        expect(routes.propCalculator.rules).toBe('/prop-calculator/rules');
        expect(routes.propCalculator.payoutPlanner).toBe(
            '/prop-calculator/payout-planner',
        );
    });

    it('pins every accounts route', () => {
        const { accounts } = routes.propCalculator;
        expect(accounts.index).toBe('/prop-calculator/accounts');
        expect(accounts.new).toBe('/prop-calculator/accounts/new');
        expect(accounts.detail('abc-123')).toBe(
            '/prop-calculator/accounts/abc-123',
        );
        expect(accounts.edit('abc-123')).toBe(
            '/prop-calculator/accounts/abc-123/edit',
        );
        expect(accounts.review).toBe('/prop-calculator/accounts/review');
        expect(accounts.ledger).toBe('/prop-calculator/accounts/ledger');
        expect(accounts.import).toBe('/prop-calculator/accounts/import');
        expect(accounts.rulebook).toBe('/prop-calculator/accounts/rulebook');
        expect(accounts.copyGroups).toBe(
            '/prop-calculator/accounts/copy-groups',
        );
        expect(accounts.nextSlot).toBe('/prop-calculator/accounts/next-slot');
        expect(accounts.edge).toBe('/prop-calculator/accounts/edge');
    });

    it('keeps the hub, not the whole object, in the indexable list', () => {
        expect(indexableRoutes).toContain('/prop-calculator');
        expect(
            indexableRoutes.every((route) => typeof route === 'string'),
        ).toBe(true);
    });

    it('lists the hub and every tool page that exists in the sitemap, once each', () => {
        const pages = pageRoutes();
        const shipped = propCalculatorToolRoutes().filter((route) =>
            pages.has(route),
        );
        expect(shipped).toContain(routes.propCalculator.index);
        expect(shipped).toContain(routes.propCalculator.simulator);
        for (const route of shipped) {
            expect(
                indexableRoutes.filter((indexed) => indexed === route),
            ).toHaveLength(1);
        }
    });

    it('never sends crawlers to a tool route that has no page yet', () => {
        const pages = pageRoutes();
        const unshipped = new Set(
            propCalculatorToolRoutes().filter((route) => !pages.has(route)),
        );
        expect(indexableRoutes.filter((route) => unshipped.has(route))).toEqual(
            [],
        );
    });

    it('keeps the private accounts area out of crawlers', () => {
        const { accounts } = routes.propCalculator;
        expect(disallowedCrawlPaths).toContain(accounts.index);
        expect(
            indexableRoutes.filter(
                (route) =>
                    route === accounts.index ||
                    route.startsWith(`${accounts.index}/`),
            ),
        ).toEqual([]);
    });
});

describe('apiRoutes.recording', () => {
    it('builds /api/recording/:id', () => {
        expect(apiRoutes.recording(7)).toBe('/api/recording/7');
        expect(apiRoutes.recording('42')).toBe('/api/recording/42');
    });
});

describe('indexableRoutes', () => {
    it('includes home and excludes profile/auth pages', () => {
        expect(indexableRoutes).toContain(routes.home);
        expect(indexableRoutes).toContain(routes.portfolio);
        expect(indexableRoutes).not.toContain(routes.profile);
        expect(indexableRoutes).not.toContain(routes.auth.login);
    });

    it('contains no duplicates', () => {
        expect(new Set(indexableRoutes).size).toBe(indexableRoutes.length);
    });

    it('lists only routes that resolve to a page', () => {
        const pages = pageRoutes();
        expect(indexableRoutes.filter((route) => !pages.has(route))).toEqual(
            [],
        );
    });
});

describe('disallowedCrawlPaths', () => {
    it('disallows authenticated/internal paths', () => {
        expect(disallowedCrawlPaths).toContain('/api/');
        expect(disallowedCrawlPaths).toContain(routes.profile);
        expect(disallowedCrawlPaths).toContain(routes.auth.error);
    });
});

describe('profileTabs', () => {
    it('exposes all tab keys', () => {
        expect(profileTabs.account).toBe('account');
        expect(profileTabs.tradingPlan).toBe('trading');
        expect(profileTabs.sensorHub).toBe('sensor-hub');
        expect(profileTabs.sessions).toBe('sessions');
    });
});

describe('withQuery', () => {
    it('returns the bare path when no params are set', () => {
        expect(withQuery('/profile', {})).toBe('/profile');
    });

    it('drops null, undefined and empty-string params', () => {
        const out = withQuery('/profile', {
            empty: '',
            error: null,
            success: undefined,
            tab: 'trading-plan',
        });
        expect(out).toBe('/profile?tab=trading-plan');
    });

    it('coerces number values to strings', () => {
        expect(withQuery('/foo', { plan: 42 })).toBe('/foo?plan=42');
    });

    it('encodes unsafe characters in values', () => {
        const out = withQuery('/foo', { q: 'a b&c=d' });
        expect(out).toBe('/foo?q=a+b%26c%3Dd');
    });

    it('returns the bare path when every value is dropped', () => {
        expect(withQuery('/foo', { error: undefined, success: null })).toBe(
            '/foo',
        );
    });
});
