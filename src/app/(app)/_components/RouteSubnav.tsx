'use client';

import { type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
    activeSubnavHref,
    subnavHref,
    subnavItemKey,
    type SubnavLink,
    subnavLinkAttributes,
} from '~/app/(app)/_components/routeSubnavLinks';
import { Button } from '~/components/ui/Button';
import { cn } from '~/lib/utilities';

export interface RouteSubnavItem extends SubnavLink {
    icon: LucideIcon;
    label: string;
}

interface RouteSubnavProperties {
    ariaLabel?: string;
    className?: string;
    items: readonly RouteSubnavItem[];
    query?: string;
}

export function RouteSubnav({
    ariaLabel,
    className,
    items,
    query = '',
}: RouteSubnavProperties) {
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
            if (!found) {
                return;
            }

            setSlot(found);
            observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, []);

    if (!slot) return null;

    const activeHref = activeSubnavHref(pathname, items);
    const bar = (
        <nav
            aria-label={ariaLabel}
            className={cn(
                'border-b border-border/40 bg-black/50 backdrop-blur-xl',
                className,
            )}
        >
            <div className="container mx-auto flex items-center gap-1 overflow-x-auto py-2">
                {items.map((item) => {
                    const Icon = item.icon;
                    const attributes = subnavLinkAttributes(item, activeHref);
                    const isActive = attributes['data-state'] === 'active';
                    return (
                        <Button
                            asChild
                            className="h-auto shrink-0 gap-2 px-3 py-1.5 text-xs font-medium tracking-wide whitespace-nowrap"
                            key={subnavItemKey(item)}
                            size="sm"
                            variant={isActive ? 'secondary' : 'ghost'}
                        >
                            <Link
                                {...attributes}
                                href={subnavHref(item, query)}
                                prefetch={item.prefetch}
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
