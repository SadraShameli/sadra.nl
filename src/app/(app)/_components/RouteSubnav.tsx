'use client';

import { type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from '~/components/ui/Button';
import { cn } from '~/lib/utilities';

export interface RouteSubnavItem {
    href: string;
    icon: LucideIcon;
    label: string;
}

interface RouteSubnavProperties {
    className?: string;
    items: readonly RouteSubnavItem[];
}

export function RouteSubnav({ className, items }: RouteSubnavProperties) {
    const pathname = usePathname();
    const [slot, setSlot] = useState<Element | null>(null);

    useEffect(() => {
        const target = document.querySelector('#navbar-subnav-slot');
        if (target) {
            setSlot(target);
            return;
        }
        const observer = new MutationObserver(() => {
            const found = document.querySelector('#navbar-subnav-slot');
            if (found) {
                setSlot(found);
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, []);

    if (!slot) return null;

    const bar = (
        <nav
            className={cn(
                'border-b border-border/40 bg-black/50 backdrop-blur-xl',
                className,
            )}
        >
            <div className="container mx-auto flex items-center gap-1 overflow-x-auto py-2">
                {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                        <Button
                            asChild
                            className="h-auto shrink-0 gap-2 px-3 py-1.5 text-xs font-medium tracking-wide whitespace-nowrap"
                            key={item.href}
                            size="sm"
                            variant={isActive ? 'secondary' : 'ghost'}
                        >
                            <Link
                                data-state={isActive ? 'active' : 'inactive'}
                                href={item.href}
                            >
                                <Icon className="size-3.5" />
                                {item.label}
                            </Link>
                        </Button>
                    );
                })}
            </div>
        </nav>
    );

    return createPortal(bar, slot);
}
