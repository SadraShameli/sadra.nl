'use client';

import {
    Dumbbell,
    LineChart,
    LogOut,
    type LucideIcon,
    Radio,
    Receipt,
    User,
    Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Avatar, AvatarFallback } from '~/components/ui/Avatar';
import { Button } from '~/components/ui/Button';
import { authClient } from '~/lib/auth/client';
import { profileTabUrl, routes } from '~/lib/site/routes';
import { cn } from '~/lib/utils';

import type { ProfileTabValue } from './profileTabs';

type NavItem = {
    href: string;
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
const ACCOUNTING_ITEM: NavItem = {
    href: routes.accounting.index,
    icon: Receipt,
    label: 'Accounting',
};

interface ProfileNavProps {
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
}: ProfileNavProps) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const items: NavItem[] = [ACCOUNT_ITEM];
    if (isAdmin) items.push(USERS_ITEM, SENSOR_HUB_ITEM);
    items.push(TRADING_PLAN_ITEM, LIFTING_ITEM);
    if (isRoot) items.push(ACCOUNTING_ITEM);
    const initial = ((name ?? email)[0] ?? '?').toUpperCase();

    return (
        <div className="flex flex-col gap-4 px-4 md:gap-6 md:px-2">
            <div className="flex items-center gap-3 rounded-xl bg-white/3 px-3 py-3">
                <Avatar className="size-10 rounded-full">
                    <AvatarFallback className="rounded-full bg-primary/15 font-semibold text-primary">
                        {initial}
                    </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                        {name ?? 'Unnamed'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                        {email}
                    </p>
                </div>
            </div>

            <nav className="flex flex-col gap-1">
                {items.map((item) => {
                    const isActive =
                        item.tab !== undefined && activeTab === item.tab;
                    return (
                        <Button
                            asChild
                            className={cn(
                                'w-full justify-start gap-2 px-3!',
                                isActive
                                    ? 'bg-primary/15 text-foreground hover:bg-primary/20'
                                    : 'text-muted-foreground hover:bg-white/3 hover:text-foreground',
                            )}
                            key={item.href}
                            size="sm"
                            variant="ghost"
                        >
                            <Link href={item.href}>
                                <item.icon className="size-4 shrink-0" />
                                <span className="whitespace-nowrap">
                                    {item.label}
                                </span>
                            </Link>
                        </Button>
                    );
                })}
            </nav>

            <div className="border-t pt-3">
                <Button
                    className="w-full justify-start gap-2 px-3! text-muted-foreground hover:bg-white/3 hover:text-foreground"
                    disabled={pending}
                    onClick={() =>
                        startTransition(async () => {
                            await authClient.signOut();
                            router.push(routes.home);
                            router.refresh();
                        })
                    }
                    size="sm"
                    variant="ghost"
                >
                    <LogOut className="size-4 shrink-0" />
                    <span>{pending ? 'Signing out…' : 'Sign out'}</span>
                </Button>
            </div>
        </div>
    );
}
