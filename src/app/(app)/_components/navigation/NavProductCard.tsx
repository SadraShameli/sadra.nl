import Link from 'next/link';

import {
    Item,
    ItemContent,
    ItemDescription,
    ItemTitle,
} from '~/components/ui/item';

import { NavLinkList } from './NavLinkList';
import { type NavProduct } from './siteNavigation';

export function NavProductCard({ product }: { readonly product: NavProduct }) {
    return (
        <Item
            className="relative items-start rounded-xl border-line bg-surface-raised transition-colors hover:border-line-hover max-md:p-3.5 md:w-56"
            data-product={product.id}
            variant="outline"
        >
            <ItemContent className="gap-1.5">
                <ItemTitle>
                    <Link
                        className="font-serif text-lg/tight text-ink focus-camel transition-colors hover:text-camel max-md:text-base/tight max-md:after:absolute max-md:after:inset-0"
                        href={product.href}
                    >
                        {product.label}
                    </Link>
                </ItemTitle>
                <ItemDescription className="line-clamp-3 text-ink-muted max-md:text-xs">
                    {product.description}
                </ItemDescription>
                <NavLinkList
                    className="mt-2 hidden md:flex"
                    links={product.links}
                />
            </ItemContent>
        </Item>
    );
}
