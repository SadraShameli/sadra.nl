import Link from 'next/link';

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
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                    {group.links.map((link) => (
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
            )}
        </div>
    );
}
