import { describe, expect, it } from 'vitest';

import {
    legacyQueryRedirect,
    LegacySection,
    legacySectionRoute,
    legacySectionTarget,
} from '~/lib/site/legacyCalculatorLinks';
import { routes } from '~/lib/site/routes';

describe('legacyQueryRedirect', () => {
    it('sends a legacy calculator query to the simulator byte for byte', () => {
        expect(
            legacyQueryRedirect(
                '/prop-calculator',
                '?firm=apex&plan=apex-50000-eod&wr=0.400',
            ),
        ).toBe(
            '/prop-calculator/simulator?firm=apex&plan=apex-50000-eod&wr=0.400',
        );
    });

    it('keeps encoded characters and parameter order untouched', () => {
        const search = '?wr=0.400&firm=apex&lab=a%2Bb%20c&plan=x+y';
        expect(legacyQueryRedirect('/prop-calculator', search)).toBe(
            `/prop-calculator/simulator${search}`,
        );
    });

    it('returns null without a firm parameter', () => {
        expect(legacyQueryRedirect('/prop-calculator', '')).toBeNull();
        expect(legacyQueryRedirect('/prop-calculator', '?wr=0.4')).toBeNull();
        expect(
            legacyQueryRedirect('/prop-calculator', '?firmware=apex'),
        ).toBeNull();
    });

    it('returns null on any other path', () => {
        expect(
            legacyQueryRedirect('/prop-calculator/simulator', '?firm=apex'),
        ).toBeNull();
        expect(
            legacyQueryRedirect('/prop-calculator/', '?firm=apex'),
        ).toBeNull();
        expect(legacyQueryRedirect('/', '?firm=apex')).toBeNull();
        expect(
            legacyQueryRedirect('/prop-calculator/accounts', '?firm=apex'),
        ).toBeNull();
    });
});

const SECTION_TABLE: readonly [string, string][] = [
    ['simulator', routes.propCalculator.simulator],
    ['charts', routes.propCalculator.simulator],
    ['strategy', routes.propCalculator.analysis],
    ['tail-risk', routes.propCalculator.analysis],
    ['drawdown', routes.propCalculator.analysis],
    ['resilience', routes.propCalculator.analysis],
    ['rule-stress-test', routes.propCalculator.analysis],
    ['optimal-risk', routes.propCalculator.sizing],
    ['sensitivity', routes.propCalculator.sizing],
    ['plan-comparison', routes.propCalculator.compare],
    ['firm-comparison', routes.propCalculator.compare],
    ['cash-flow', routes.propCalculator.cashFlow],
    ['ladder-lab-section', routes.propCalculator.ladderLab],
    ['ladder-lab', routes.propCalculator.ladderLab],
    ['strategy-lab', routes.propCalculator.strategyLab],
    ['portfolio', routes.propCalculator.planner],
];

describe('legacySectionRoute', () => {
    it('maps the tail-risk example from a sibling tool page', () => {
        expect(
            legacySectionRoute('#tail-risk', routes.propCalculator.simulator),
        ).toEqual({
            fragment: LegacySection.TailRisk,
            route: '/prop-calculator/analysis',
        });
    });

    it('returns null for an unknown or empty hash', () => {
        for (const hash of ['', '#', '#nope', '#Tail-Risk', '#__proto__']) {
            expect(
                legacySectionRoute(hash, routes.propCalculator.simulator),
            ).toBeNull();
        }
    });

    it('returns null when the target is the current path', () => {
        expect(
            legacySectionRoute('#tail-risk', routes.propCalculator.analysis),
        ).toBeNull();
        expect(
            legacySectionRoute('#portfolio', routes.propCalculator.planner),
        ).toBeNull();
    });
});

describe('legacySectionTarget', () => {
    it('covers every legacy section id exactly once', () => {
        expect(SECTION_TABLE).toHaveLength(16);
        expect(new Set(SECTION_TABLE.map(([id]) => id)).size).toBe(16);
        expect(new Set<string>(Object.values(LegacySection)).size).toBe(16);
        for (const [id] of SECTION_TABLE) {
            expect(Object.values(LegacySection)).toContain(id);
        }
    });

    it.each(SECTION_TABLE)(
        'maps #%s to %s and keeps the id as the fragment',
        (id, route) => {
            expect(legacySectionTarget(`#${id}`)).toEqual({
                fragment: id,
                route,
            });
            expect(legacySectionTarget(id)).toEqual({ fragment: id, route });
        },
    );

    it('keeps the target when it is the page the link lands on', () => {
        expect(legacySectionTarget('#tail-risk')).toEqual({
            fragment: LegacySection.TailRisk,
            route: routes.propCalculator.analysis,
        });
        expect(legacySectionTarget('#portfolio')).toEqual({
            fragment: LegacySection.Portfolio,
            route: routes.propCalculator.planner,
        });
    });

    it('returns null for an unknown or empty hash', () => {
        for (const hash of [
            '',
            '#',
            '#nope',
            '#Tail-Risk',
            '#tail-risk?x=1',
            '#__proto__',
        ]) {
            expect(legacySectionTarget(hash)).toBeNull();
        }
    });

    it('resolves every legacy section to a tool page, never to the hub', () => {
        for (const section of Object.values(LegacySection)) {
            const target = legacySectionTarget(`#${section}`);
            expect(target?.fragment).toBe(section);
            expect(target?.route).toMatch(
                new RegExp(`^${routes.propCalculator.index}/[a-z-]+$`),
            );
        }
    });

    it('is the lookup legacySectionRoute filters by the current page', () => {
        const pathnames = [
            routes.propCalculator.index,
            ...SECTION_TABLE.map(([, route]) => route),
        ];
        for (const section of Object.values(LegacySection)) {
            const target = legacySectionTarget(`#${section}`);
            for (const pathname of pathnames) {
                expect(legacySectionRoute(`#${section}`, pathname)).toEqual(
                    target?.route === pathname ? null : target,
                );
            }
        }
    });
});
