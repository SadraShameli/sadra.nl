'use client';

import {
    Activity,
    BarChart3,
    Calendar,
    Dumbbell,
    Flag,
    Home,
    LineChart,
    Ruler,
} from 'lucide-react';

import {
    RouteSubnav,
    type RouteSubnavItem,
} from '~/app/(app)/_components/RouteSubnav';
import { routes } from '~/lib/site/routes';

const ITEMS: readonly RouteSubnavItem[] = [
    { href: routes.lifting.index, icon: Home, label: 'Today' },
    { href: routes.lifting.log, icon: Activity, label: 'Log' },
    { href: routes.lifting.history, icon: Calendar, label: 'History' },
    { href: routes.lifting.exercises, icon: Dumbbell, label: 'Exercises' },
    { href: routes.lifting.programs, icon: LineChart, label: 'Programs' },
    { href: routes.lifting.analytics, icon: BarChart3, label: 'Analytics' },
    { href: routes.lifting.body, icon: Ruler, label: 'Body' },
    { href: routes.lifting.goals, icon: Flag, label: 'Goals' },
];

export function LiftingSubnav() {
    return <RouteSubnav className="app-lifting__subnav" items={ITEMS} />;
}
