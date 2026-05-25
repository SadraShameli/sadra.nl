'use client';

import { BookOpen, KeyRound, LayoutDashboard, ListChecks } from 'lucide-react';

import {
    RouteSubnav,
    type RouteSubnavItem,
} from '~/app/(app)/_components/RouteSubnav';
import { routes } from '~/lib/site/routes';

const ITEMS: readonly RouteSubnavItem[] = [
    {
        href: routes.accountingImporter.index,
        icon: LayoutDashboard,
        label: 'Dashboard',
    },
    {
        href: routes.accountingImporter.connections,
        icon: KeyRound,
        label: 'Connections',
    },
    {
        href: routes.accountingImporter.ledgers,
        icon: BookOpen,
        label: 'Ledgers',
    },
    {
        href: routes.accountingImporter.mutations,
        icon: ListChecks,
        label: 'Mutations',
    },
];

export function AccountingImporterSubnav() {
    return (
        <RouteSubnav
            className="app-accounting-importer__subnav"
            items={ITEMS}
        />
    );
}
