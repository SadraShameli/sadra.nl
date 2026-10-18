import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    FragmentScrollStep,
    hubLegacyTarget,
    scrollPlan,
} from '~/app/(app)/prop-calculator/_components/legacyFragmentScroll';
import {
    LegacySection,
    legacySectionTarget,
} from '~/lib/site/legacyCalculatorLinks';
import { routes } from '~/lib/site/routes';

const WATCHER_PATH = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
    '_components',
    'legacyFragmentScroll.ts',
);

describe('scrollPlan', () => {
    it('waits while the target section is not mounted yet', () => {
        expect(scrollPlan(LegacySection.TailRisk, new Set())).toBe(
            FragmentScrollStep.Pending,
        );
        expect(
            scrollPlan(
                LegacySection.TailRisk,
                new Set([LegacySection.Drawdown, LegacySection.Strategy]),
            ),
        ).toBe(FragmentScrollStep.Pending);
    });

    it('scrolls once the target section is mounted', () => {
        expect(
            scrollPlan(
                LegacySection.TailRisk,
                new Set([LegacySection.Strategy, LegacySection.TailRisk]),
            ),
        ).toBe(FragmentScrollStep.ScrollTo);
    });

    it('never scrolls a second time', () => {
        expect(
            scrollPlan(
                LegacySection.TailRisk,
                new Set([LegacySection.TailRisk]),
                true,
            ),
        ).toBe(FragmentScrollStep.NoOp);
        expect(scrollPlan(LegacySection.TailRisk, new Set(), true)).toBe(
            FragmentScrollStep.NoOp,
        );
    });

    it('reuses the one legacy section table instead of rebuilding the id set', () => {
        const source = readFileSync(WATCHER_PATH, 'utf8');
        expect(source).not.toMatch(
            /Object\.(values|keys)\(\s*LegacySection\s*\)/,
        );
        expect(source).not.toMatch(/new Set<string>/);
    });

    it('treats every legacy section id as a scroll target', () => {
        for (const section of Object.values(LegacySection)) {
            expect(scrollPlan(section, new Set([section]))).toBe(
                FragmentScrollStep.ScrollTo,
            );
        }
    });
});

describe('hubLegacyTarget', () => {
    it('sends a legacy section hash on the hub to its tool page, keeping the fragment', () => {
        expect(hubLegacyTarget('#tail-risk', '', undefined)).toEqual({
            fragment: LegacySection.TailRisk,
            href: `${routes.propCalculator.analysis}#tail-risk`,
            route: routes.propCalculator.analysis,
        });
    });

    it('maps every legacy section to the page of the section table', () => {
        for (const section of Object.values(LegacySection)) {
            const route = legacySectionTarget(`#${section}`)?.route;
            expect(route).toBeDefined();
            expect(hubLegacyTarget(`#${section}`, '', undefined)?.href).toBe(
                `${route ?? ''}#${section}`,
            );
        }
    });

    it('carries the last tool query so the inputs survive', () => {
        expect(
            hubLegacyTarget('#cash-flow', '', 'firm=apex&wr=0.4')?.href,
        ).toBe(`${routes.propCalculator.cashFlow}?firm=apex&wr=0.4#cash-flow`);
    });

    it('prefers the query of the link itself over the last tool query', () => {
        expect(
            hubLegacyTarget('#portfolio', '?wr=0.5&pf=a%2Cb', 'firm=apex')
                ?.href,
        ).toBe(`${routes.propCalculator.planner}?wr=0.5&pf=a%2Cb#portfolio`);
    });

    it('ignores an empty query', () => {
        expect(hubLegacyTarget('#strategy', '?', '')?.href).toBe(
            `${routes.propCalculator.analysis}#strategy`,
        );
    });

    it('does nothing for an unknown or empty hash', () => {
        expect(hubLegacyTarget('', '', 'firm=apex')).toBeNull();
        expect(hubLegacyTarget('#', '', undefined)).toBeNull();
        expect(hubLegacyTarget('#nope', '?firm=apex', undefined)).toBeNull();
        expect(hubLegacyTarget('#Tail-Risk', '', undefined)).toBeNull();
    });
});
