import Link from 'next/link';

import { cn } from '~/lib/utilities';

import { type NavLink } from './siteNavigation';

export function NavLinkList({
    className,
    links,
}: {
    readonly className?: string;
    readonly links: readonly NavLink[];
}) {
    return (
        <ul
            className={cn('m-0 flex list-none flex-col gap-0.5 p-0', className)}
        >
            {links.map((link) => (
                <li key={link.label}>
                    <Link
                        className="-mx-2 block rounded-lg px-2 py-1.5 text-sm text-ink-nav focus-camel transition-colors hover:bg-surface-high hover:text-ink"
                        href={link.href}
                    >
                        {link.label}
                    </Link>
                </li>
            ))}
        </ul>
    );
}
