'use client';

import {
    BarChart3,
    Calendar as CalendarIcon,
    CheckSquare,
    ClipboardList,
    Search,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '~/lib/utils';

const ITEMS = [
    { href: '/trade-checklist', icon: ClipboardList, label: 'Checklist' },
    { href: '/trade-checklist/journal', icon: Search, label: 'Journal' },
    { href: '/trade-checklist/analytics', icon: BarChart3, label: 'Analytics' },
    {
        href: '/trade-checklist/calendar',
        icon: CalendarIcon,
        label: 'Calendar',
    },
    { href: '/trade-checklist/prep', icon: CheckSquare, label: 'Pre-market' },
];

export function TradeChecklistSubnav() {
    const pathname = usePathname();
    const [slot, setSlot] = useState<Element | null>(null);

    useEffect(() => {
        setSlot(document.querySelector('#navbar-subnav-slot'));
    }, []);

    if (!slot) return null;

    const bar = (
        <div className="border-b border-border/40 bg-black/50 backdrop-blur-xl">
            <div className="container mx-auto flex items-center gap-1 overflow-x-auto py-2">
                {ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                        <Link
                            className={cn(
                                'inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium tracking-wide whitespace-nowrap transition',
                                active
                                    ? 'bg-accent text-foreground'
                                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                            )}
                            href={item.href}
                            key={item.href}
                        >
                            <Icon className="size-3.5" />
                            {item.label}
                        </Link>
                    );
                })}
            </div>
        </div>
    );

    return createPortal(bar, slot);
}
