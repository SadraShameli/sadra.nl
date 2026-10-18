import { type RouteSubnavItem } from '~/app/(app)/_components/RouteSubnav';
import { subnavGroup } from '~/app/(app)/_components/routeSubnavLinks';
import { routes } from '~/lib/site/routes';

export const LIFTING_NAV: readonly RouteSubnavItem[] = [
    { href: routes.lifting.index, label: 'Today' },
    { href: routes.lifting.log, label: 'Log' },
    { href: routes.lifting.history, label: 'History' },
    subnavGroup('Plans', [
        { href: routes.lifting.programs, label: 'Programs' },
        { href: routes.lifting.routines, label: 'Routines' },
    ]),
    { href: routes.lifting.exercises, label: 'Exercises' },
    subnavGroup('Progress', [
        { href: routes.lifting.analytics, label: 'Analytics' },
        { href: routes.lifting.body, label: 'Body' },
        { href: routes.lifting.goals, label: 'Goals' },
    ]),
];
