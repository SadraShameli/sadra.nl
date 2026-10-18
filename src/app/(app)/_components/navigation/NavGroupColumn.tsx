import Link from 'next/link';

import { NavLinkList } from './NavLinkList';
import { type NavGroup } from './siteNavigation';

export function NavGroupColumn({ group }: { readonly group: NavGroup }) {
    return (
        <div className="flex min-w-44 flex-col gap-3">
            {group.href === undefined ? (
                <span className="type-eyebrow text-camel">{group.label}</span>
            ) : (
                <Link
                    className="w-fit type-eyebrow text-camel focus-camel transition-colors hover:text-ink"
                    href={group.href}
                >
                    {group.label}
                </Link>
            )}
            {group.links.length === 0 ? null : (
                <NavLinkList links={group.links} />
            )}
        </div>
    );
}
