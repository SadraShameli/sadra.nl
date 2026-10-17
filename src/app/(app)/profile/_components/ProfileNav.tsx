'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
    Dumbbell,
    LayoutTemplate,
    LineChart,
    LogOut,
    type LucideIcon,
    Radio,
    Receipt,
    User,
    Users,
} from 'lucide-react';
import { type Route } from 'next';
import Link from 'next/link';
import { useTransition } from 'react';

import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { authClient } from '~/lib/auth/client';
import { profileTabUrl, routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

import type { ProfileTabValue } from './profileTabs';

type NavItem = {
    href: Route;
    icon: LucideIcon;
    label: string;
    tab?: ProfileTabValue;
};

const ACCOUNT_ITEM: NavItem = {
    href: profileTabUrl('account'),
    icon: User,
    label: 'Account',
    tab: 'account',
};
const USERS_ITEM: NavItem = {
    href: profileTabUrl('users'),
    icon: Users,
    label: 'Users',
    tab: 'users',
};
const SENSOR_HUB_ITEM: NavItem = {
    href: profileTabUrl('sensor-hub'),
    icon: Radio,
    label: 'Sensor Hub',
    tab: 'sensor-hub',
};
const TRADING_PLAN_ITEM: NavItem = {
    href: profileTabUrl('trading'),
    icon: LineChart,
    label: 'Trading',
    tab: 'trading',
};
const LIFTING_ITEM: NavItem = {
    href: profileTabUrl('lifting'),
    icon: Dumbbell,
    label: 'Lifting',
    tab: 'lifting',
};
const CONTENTS_ITEM: NavItem = {
    href: profileTabUrl('contents'),
    icon: LayoutTemplate,
    label: 'Contents',
    tab: 'contents',
};
const ACCOUNTING_ITEM: NavItem = {
    href: routes.accounting.index,
    icon: Receipt,
    label: 'Accounting',
};

interface ProfileNavProperties {
    activeTab: ProfileTabValue;
    email: string;
    isAdmin: boolean;
    isRoot: boolean;
    name: null | string;
}

export function ProfileNav({
    activeTab,
    email,
    isAdmin,
    isRoot,
    name,
}: ProfileNavProperties) {
    const queryClient = useQueryClient();
    const [pending, startTransition] = useTransition();
    const items: NavItem[] = [
        ACCOUNT_ITEM,
        ...(isAdmin ? [USERS_ITEM, SENSOR_HUB_ITEM] : []),
        TRADING_PLAN_ITEM,
        LIFTING_ITEM,
        ...(isRoot ? [CONTENTS_ITEM, ACCOUNTING_ITEM] : []),
    ];
    const initial = ((name ?? email)[0] ?? '?').toUpperCase();

    return (
        <div className="flex flex-col gap-5 px-4 md:px-2">
            <div className="flex flex-col items-start gap-4 px-3 pt-2">
                <Avatar className="size-14">
                    <AvatarFallback className="bg-camel font-serif text-2xl text-on-camel">
                        {initial}
                    </AvatarFallback>
                </Avatar>
                <div className="flex w-full min-w-0 flex-col gap-1">
                    <p className="m-0 truncate type-display-item text-ink">
                        {name ?? 'Unnamed'}
                    </p>
                    <p className="m-0 truncate text-sm text-ink-muted">
                        {email}
                    </p>
                </div>
            </div>

            <Separator />

            <nav className="flex flex-col gap-1">
                {items.map((item) => {
                    const isActive =
                        item.tab !== undefined && activeTab === item.tab;
                    return (
                        <Button
                            asChild
                            className={cn(
                                'w-full justify-start gap-2.5 px-3!',
                                isActive && 'bg-surface-high text-ink',
                            )}
                            key={item.href}
                            variant="capsule"
                        >
                            <Link
                                aria-current={isActive ? 'page' : undefined}
                                href={item.href}
                            >
                                <item.icon className="size-4 shrink-0" />
                                <span className="whitespace-nowrap">
                                    {item.label}
                                </span>
                            </Link>
                        </Button>
                    );
                })}
            </nav>

            <Separator />

            <div>
                <Button
                    className="w-full justify-start gap-2.5 px-3!"
                    disabled={pending}
                    onClick={() =>
                        startTransition(async () => {
                            await authClient.signOut();
                            queryClient.clear();
                            window.location.assign(routes.home);
                        })
                    }
                    variant="capsule"
                >
                    <LogOut className="size-4 shrink-0" />
                    <span>{pending ? 'Signing out…' : 'Sign out'}</span>
                </Button>
            </div>
        </div>
    );
}
