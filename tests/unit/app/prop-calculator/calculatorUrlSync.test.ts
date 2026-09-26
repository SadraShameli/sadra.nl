import { describe, expect, it } from 'vitest';

import {
    CalculatorActionType,
    calculatorReducer,
    defaultCalculatorState,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    isLegacyHashSettled,
    legacyHashNavigation,
    type LegacyHashReplacement,
    legacyHashReplacement,
    nextUrl,
    stillPendingLegacyHash,
} from '~/app/(app)/prop-calculator/_components/calculatorUrlSync';
import { type CalculatorState } from '~/app/(app)/prop-calculator/_components/types';
import { encodeState } from '~/app/(app)/prop-calculator/_components/urlState';
import { shouldRunBaseSimulation } from '~/app/(app)/prop-calculator/_components/useBaseSimulation';
import { initialStateFromSearch } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { LegacySection } from '~/lib/site/legacyCalculatorLinks';
import { routes } from '~/lib/site/routes';

const { analysis, index, positionSize, rules, simulator, sizing } =
    routes.propCalculator;

interface Entry {
    hash: string;
    pathname: string;
    search: string;
}

class FakeBrowser {
    private cursor = 0;
    private entries: Entry[];
    pendingNavigation: null | string = null;
    writes = 0;

    constructor(url: string) {
        this.entries = [parse(url)];
    }

    get current(): Entry {
        const entry = this.entries[this.cursor];
        if (!entry) throw new Error('empty history');
        return entry;
    }

    get url(): string {
        const { hash, pathname, search } = this.current;
        return `${pathname}${search}${hash}`;
    }

    back(): void {
        this.cursor -= 1;
    }

    forward(): void {
        this.cursor += 1;
    }

    land(): void {
        if (this.pendingNavigation === null) return;
        this.replace(this.pendingNavigation);
        this.pendingNavigation = null;
    }

    navigate(url: string): void {
        this.pendingNavigation = url;
    }

    push(url: string): void {
        this.entries = [...this.entries.slice(0, this.cursor + 1), parse(url)];
        this.cursor += 1;
    }

    replace(url: string): void {
        this.entries[this.cursor] = parse(url);
    }

    sync(state: CalculatorState): void {
        const { hash, pathname, search } = this.current;
        const next = nextUrl(state, pathname, search, hash);
        if (next === null) return;
        this.writes += 1;
        this.pendingNavigation = null;
        this.replace(next);
    }
}

function canonical(
    pathname: string,
    state: CalculatorState,
    hash = '',
): string {
    return `${pathname}?${query(state)}${hash}`;
}

function mountWithLegacyHash(
    browser: FakeBrowser,
    state: CalculatorState,
): LegacyHashReplacement {
    const { hash, pathname } = browser.current;
    const pending = legacyHashReplacement(state, pathname, hash);
    if (pending === null) throw new Error('expected a legacy replacement');
    browser.navigate(pending.target);
    return pending;
}

function parse(url: string): Entry {
    const parsed = new URL(url, 'https://sadra.nl');
    return {
        hash: parsed.hash,
        pathname: parsed.pathname,
        search: parsed.search,
    };
}

function providerPass(
    browser: FakeBrowser,
    state: CalculatorState,
    pending: LegacyHashReplacement | null,
): void {
    if (!isLegacyHashSettled(true, pending, browser.current.pathname)) return;
    browser.sync(state);
}

function query(state: CalculatorState): string {
    return encodeState(state).toString();
}

function sharedState(): CalculatorState {
    return withWinrate(defaultCalculatorState(), 0.45);
}

function shouldBaseSimulationRun(
    pending: LegacyHashReplacement | null,
    pathname: string,
): boolean {
    return shouldRunBaseSimulation({
        hasConsumer: true,
        legacyHashSettled: isLegacyHashSettled(true, pending, pathname),
        mounted: true,
    });
}

function withWinrate(state: CalculatorState, value: number): CalculatorState {
    return calculatorReducer(state, {
        type: CalculatorActionType.SetWinrate,
        value,
    });
}

describe('nextUrl', () => {
    it('writes nothing on mount when the lazy init came from a canonical query', () => {
        const q0 = query(sharedState());
        const browser = new FakeBrowser(`${simulator}?${q0}`);
        const s0 = initialStateFromSearch(`?${q0}`);
        browser.sync(s0);
        expect(browser.writes).toBe(0);
        expect(browser.url).toBe(`${simulator}?${q0}`);
    });

    it('keeps the URL equal to the state through edit, navigate, Back and Forward', () => {
        const q0 = query(sharedState());
        const browser = new FakeBrowser(`${simulator}?${q0}`);
        let state = initialStateFromSearch(`?${q0}`);
        browser.sync(state);

        state = withWinrate(state, 0.5);
        browser.sync(state);
        expect(browser.url).toBe(canonical(simulator, state));

        const q1 = query(state);
        browser.push(`${analysis}?${q1}`);
        browser.sync(state);
        expect(browser.url).toBe(canonical(analysis, state));

        state = withWinrate(state, 0.55);
        browser.sync(state);
        expect(browser.url).toBe(canonical(analysis, state));

        browser.back();
        expect(browser.url).toBe(`${simulator}?${q1}`);
        browser.sync(state);
        expect(browser.url).toBe(canonical(simulator, state));

        browser.forward();
        const writesBefore = browser.writes;
        browser.sync(state);
        expect(browser.writes).toBe(writesBefore);
        expect(browser.url).toBe(canonical(analysis, state));
    });

    it('restores the query after clicking the active subnav item with the query dropped or stale', () => {
        const state = sharedState();
        const browser = new FakeBrowser(canonical(analysis, state));

        browser.push(analysis);
        browser.sync(state);
        expect(browser.url).toBe(canonical(analysis, state));

        const stale = query(defaultCalculatorState());
        browser.push(`${analysis}?${stale}`);
        browser.sync(state);
        expect(browser.url).toBe(canonical(analysis, state));
    });

    it('restores the state query on Back between two entries of the same path', () => {
        const older = defaultCalculatorState();
        const state = sharedState();
        const browser = new FakeBrowser(canonical(sizing, older));
        browser.push(canonical(sizing, state));
        browser.back();
        expect(browser.url).toBe(canonical(sizing, older));
        browser.sync(state);
        expect(browser.url).toBe(canonical(sizing, state));
    });

    it('writes the latest state after following a subnav href built from a debounced query', () => {
        const debounced = sharedState();
        const latest = withWinrate(debounced, 0.6);
        const browser = new FakeBrowser(canonical(simulator, latest));
        browser.push(`${sizing}?${query(debounced)}`);
        browser.sync(latest);
        expect(browser.url).toBe(canonical(sizing, latest));
    });

    it('writes a re-encoding query once, then nothing on the second pass', () => {
        const state = sharedState();
        const browser = new FakeBrowser(
            `${analysis}?${query(state)}&note=a+b%20c`,
        );
        browser.sync(state);
        expect(browser.writes).toBe(1);
        expect(browser.url).toBe(canonical(analysis, state));
        browser.sync(state);
        expect(browser.writes).toBe(1);
    });

    it('treats a differently encoded but equal query as already in step', () => {
        const state = sharedState();
        const encoded = query(state).replaceAll('-', '%2D');
        expect(encoded).not.toBe(query(state));
        const browser = new FakeBrowser(`${analysis}?${encoded}`);
        browser.sync(state);
        expect(browser.writes).toBe(0);
    });

    it('keeps the current hash on every write', () => {
        const state = sharedState();
        const browser = new FakeBrowser(`${analysis}#tail-risk`);
        browser.sync(state);
        expect(browser.url).toBe(canonical(analysis, state, '#tail-risk'));
        const next = withWinrate(state, 0.3);
        browser.sync(next);
        expect(browser.url).toBe(canonical(analysis, next, '#tail-risk'));
    });

    it('never writes on a page whose catalog entry does not use calculator inputs', () => {
        const state = sharedState();
        for (const pathname of [rules, positionSize, index, '/elsewhere']) {
            expect(nextUrl(state, pathname, '?x=1', '')).toBeNull();
            expect(nextUrl(state, pathname, '', '#a')).toBeNull();
        }
    });

    it('returns the exact target string', () => {
        const state = sharedState();
        expect(nextUrl(state, simulator, '', '#charts')).toBe(
            `${simulator}?${query(state)}#charts`,
        );
        expect(nextUrl(state, simulator, `?${query(state)}`, '')).toBeNull();
        expect(nextUrl(state, simulator, query(state), '')).toBeNull();
    });
});

describe('legacyHashNavigation', () => {
    it('replaces the route for a legacy hash before the first write and later writes keep the fragment', () => {
        const q0 = query(sharedState());
        const browser = new FakeBrowser(`${simulator}?${q0}#tail-risk`);
        let state = initialStateFromSearch(`?${q0}`);
        const { hash, pathname } = browser.current;
        const navigation = legacyHashNavigation(state, pathname, hash);
        expect(navigation).toEqual({
            fragment: LegacySection.TailRisk,
            route: analysis,
            target: `${analysis}?${q0}#tail-risk`,
        });
        if (navigation === null) throw new Error('expected a target');
        browser.replace(navigation.target);

        browser.sync(state);
        expect(browser.writes).toBe(0);

        state = withWinrate(state, 0.52);
        browser.sync(state);
        expect(browser.url).toBe(canonical(analysis, state, '#tail-risk'));
    });

    it('holds the writer and the base simulation until the replacement lands for a bare link', () => {
        const browser = new FakeBrowser(`${simulator}#tail-risk`);
        let state = initialStateFromSearch(browser.current.search);
        expect(nextUrl(state, simulator, '', '#tail-risk')).not.toBeNull();

        const pending = mountWithLegacyHash(browser, state);
        expect(pending).toEqual({
            fragment: LegacySection.TailRisk,
            from: simulator,
            route: analysis,
            target: `${analysis}?${query(state)}#tail-risk`,
        });

        providerPass(browser, state, pending);
        expect(browser.writes).toBe(0);
        expect(shouldBaseSimulationRun(pending, browser.current.pathname)).toBe(
            false,
        );

        browser.land();
        expect(browser.url).toBe(canonical(analysis, state, '#tail-risk'));
        expect(shouldBaseSimulationRun(pending, browser.current.pathname)).toBe(
            true,
        );
        providerPass(browser, state, pending);
        expect(browser.writes).toBe(0);

        state = withWinrate(state, 0.52);
        providerPass(browser, state, pending);
        expect(browser.url).toBe(canonical(analysis, state, '#tail-risk'));
    });

    it('holds the writer until the replacement lands for a query in a different parameter order', () => {
        const state = sharedState();
        const reordered = [...encodeState(state)]
            .toReversed()
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join('&');
        const browser = new FakeBrowser(`${simulator}?${reordered}#cash-flow`);
        const decoded = initialStateFromSearch(browser.current.search);
        expect(query(decoded)).toBe(query(state));
        expect(
            nextUrl(decoded, simulator, `?${reordered}`, '#cash-flow'),
        ).not.toBeNull();

        const pending = mountWithLegacyHash(browser, decoded);
        providerPass(browser, decoded, pending);
        expect(browser.writes).toBe(0);

        browser.land();
        expect(browser.url).toBe(
            canonical(routes.propCalculator.cashFlow, decoded, '#cash-flow'),
        );
    });

    it('returns null for an unknown hash, an empty hash, or a section on the current page', () => {
        const state = sharedState();
        expect(legacyHashNavigation(state, simulator, '')).toBeNull();
        expect(legacyHashNavigation(state, simulator, '#nope')).toBeNull();
        expect(legacyHashNavigation(state, simulator, '#charts')).toBeNull();
        expect(legacyHashNavigation(state, analysis, '#tail-risk')).toBeNull();
    });
});

describe('legacyHashReplacement', () => {
    it('records the source path, the section and the target of a legacy hash', () => {
        const state = sharedState();
        expect(legacyHashReplacement(state, simulator, '#tail-risk')).toEqual({
            fragment: LegacySection.TailRisk,
            from: simulator,
            route: analysis,
            target: `${analysis}?${query(state)}#tail-risk`,
        });
    });

    it('issues no replacement without a legacy hash or for a section on the current page', () => {
        const state = sharedState();
        expect(legacyHashReplacement(state, simulator, '')).toBeNull();
        expect(legacyHashReplacement(state, simulator, '#nope')).toBeNull();
        expect(legacyHashReplacement(state, analysis, '#tail-risk')).toBeNull();
    });
});

describe('isLegacyHashSettled', () => {
    const pending: LegacyHashReplacement = {
        fragment: LegacySection.TailRisk,
        from: simulator,
        route: analysis,
        target: `${analysis}?x=1#tail-risk`,
    };

    it('is never settled before mount', () => {
        expect(isLegacyHashSettled(false, null, simulator)).toBe(false);
        expect(isLegacyHashSettled(false, pending, analysis)).toBe(false);
    });

    it('settles on mount when no replacement was issued', () => {
        expect(isLegacyHashSettled(true, null, simulator)).toBe(true);
    });

    it('stays unsettled while the pathname is still the source page', () => {
        expect(isLegacyHashSettled(true, pending, simulator)).toBe(false);
    });

    it('settles once the pathname has left the source page', () => {
        expect(isLegacyHashSettled(true, pending, analysis)).toBe(true);
        expect(isLegacyHashSettled(true, pending, sizing)).toBe(true);
    });
});

describe('stillPendingLegacyHash', () => {
    const pending: LegacyHashReplacement = {
        fragment: LegacySection.TailRisk,
        from: simulator,
        route: analysis,
        target: `${analysis}?x=1#tail-risk`,
    };

    it('keeps the replacement pending while still on the source page', () => {
        expect(stillPendingLegacyHash(pending, simulator)).toBe(pending);
        expect(stillPendingLegacyHash(null, simulator)).toBeNull();
    });

    it('clears the replacement once it lands, so a later visit to the source page stays settled', () => {
        const cleared = stillPendingLegacyHash(pending, analysis);
        expect(cleared).toBeNull();
        expect(isLegacyHashSettled(true, cleared, simulator)).toBe(true);
    });
});
