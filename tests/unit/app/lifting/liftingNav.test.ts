import { describe, expect, it } from 'vitest';

import { activeSubnavGroup } from '~/app/(app)/_components/routeSubnavLinks';
import { LIFTING_NAV } from '~/app/(app)/lifting/_components/liftingNav';
import { compareText } from '~/lib/prop-accounts';
import { routes } from '~/lib/site/routes';

import { currentSubnavLabels, subnavPages } from '../subnavPages';

const { lifting } = routes;

const STATIC_LIFTING_PAGES: readonly string[] = Object.values(lifting)
    .filter((value) => typeof value === 'string')
    .filter(
        (value) =>
            value === lifting.index || value.startsWith(`${lifting.index}/`),
    );

function currentLabels(pathname: string): string[] {
    return currentSubnavLabels(pathname, LIFTING_NAV);
}

describe('LIFTING_NAV', () => {
    it('lists the short section nav in order', () => {
        expect(LIFTING_NAV.map((item) => item.label)).toEqual([
            'Today',
            'Log',
            'History',
            'Plans',
            'Exercises',
            'Progress',
        ]);
    });

    it('groups programs with routines, and analytics with body and goals', () => {
        const groups = LIFTING_NAV.filter((item) => item.pages !== undefined);
        expect(
            groups.map((item) => [
                item.label,
                item.pages?.map((page) => [page.label, page.href]),
            ]),
        ).toEqual([
            [
                'Plans',
                [
                    ['Programs', lifting.programs],
                    ['Routines', lifting.routines],
                ],
            ],
            [
                'Progress',
                [
                    ['Analytics', lifting.analytics],
                    ['Body', lifting.body],
                    ['Goals', lifting.goals],
                ],
            ],
        ]);
    });

    it('links each group to its first page', () => {
        for (const item of LIFTING_NAV) {
            if (item.pages === undefined) continue;
            expect(item.href).toBe(item.pages[0].href);
        }
    });

    it('reaches every lifting page exactly once, routines included', () => {
        const hrefs = subnavPages(LIFTING_NAV).map((page) => page.href);
        expect(new Set(hrefs).size).toBe(hrefs.length);
        expect(hrefs.toSorted(compareText)).toEqual(
            [...STATIC_LIFTING_PAGES].toSorted(compareText),
        );
        expect(hrefs).toContain(lifting.routines);
    });

    it('marks exactly one nav item current on every lifting page', () => {
        for (const pathname of STATIC_LIFTING_PAGES) {
            expect(currentLabels(pathname), pathname).toHaveLength(1);
        }
    });

    it('marks the group current on each of its pages', () => {
        expect(currentLabels(lifting.routines)).toEqual(['Plans']);
        expect(currentLabels(lifting.programs)).toEqual(['Plans']);
        expect(currentLabels(lifting.goals)).toEqual(['Progress']);
        expect(currentLabels(lifting.index)).toEqual(['Today']);
    });

    it('gives a page outside every group no group tabs', () => {
        expect(activeSubnavGroup(lifting.index, LIFTING_NAV)).toBeUndefined();
        expect(
            activeSubnavGroup(lifting.exercises, LIFTING_NAV),
        ).toBeUndefined();
        expect(activeSubnavGroup(lifting.body, LIFTING_NAV)?.label).toBe(
            'Progress',
        );
    });
});
