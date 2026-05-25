import { describe, expect, it } from 'vitest';

import {
    apiRoutes,
    disallowedCrawlPaths,
    indexableRoutes,
    profileTabs,
    routes,
    withQuery,
} from '~/lib/site/routes';

describe('routes', () => {
    it('declares stable string constants at every leaf', () => {
        expect(routes.home).toBe('/');
        expect(routes.auth.login).toBe('/login');
        expect(routes.tradeChecklist.journal).toBe('/trade-checklist/journal');
        expect(routes.legal.privacy).toBe('/legal/privacy');
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
