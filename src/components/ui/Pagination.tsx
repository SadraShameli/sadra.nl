import {
    ChevronLeftIcon,
    ChevronRightIcon,
    MoreHorizontalIcon,
} from 'lucide-react';
import * as React from 'react';

import { type Button, buttonVariants } from '~/components/ui/Button';
import { cn } from '~/lib/utilities';

type PaginationLinkProperties = Pick<
    React.ComponentProps<typeof Button>,
    'size'
> &
    React.ComponentProps<'a'> & {
        isActive?: boolean;
    };

function Pagination({ className, ...properties }: React.ComponentProps<'nav'>) {
    return (
        <nav
            aria-label="pagination"
            className={cn('mx-auto flex w-full justify-center', className)}
            data-slot="pagination"
            role="navigation"
            {...properties}
        />
    );
}

function PaginationContent({
    className,
    ...properties
}: React.ComponentProps<'ul'>) {
    return (
        <ul
            className={cn('flex flex-row items-center gap-1', className)}
            data-slot="pagination-content"
            {...properties}
        />
    );
}

function PaginationEllipsis({
    className,
    ...properties
}: React.ComponentProps<'span'>) {
    return (
        <span
            aria-hidden
            className={cn('flex size-9 items-center justify-center', className)}
            data-slot="pagination-ellipsis"
            {...properties}
        >
            <MoreHorizontalIcon className="size-4" />
            <span className="sr-only">More pages</span>
        </span>
    );
}

function PaginationItem({ ...properties }: React.ComponentProps<'li'>) {
    return <li data-slot="pagination-item" {...properties} />;
}

function PaginationLink({
    children,
    className,
    isActive,
    size = 'icon',
    ...properties
}: PaginationLinkProperties) {
    return (
        <a
            aria-current={isActive ? 'page' : undefined}
            className={cn(
                buttonVariants({
                    size,
                    variant: isActive ? 'outline' : 'ghost',
                }),
                className,
            )}
            data-active={isActive}
            data-slot="pagination-link"
            {...properties}
        >
            {children}
        </a>
    );
}

function PaginationNext({
    className,
    ...properties
}: React.ComponentProps<typeof PaginationLink>) {
    return (
        <PaginationLink
            aria-label="Go to next page"
            className={cn('gap-1 px-2.5 sm:pr-2.5', className)}
            size="default"
            {...properties}
        >
            <span className="hidden sm:block">Next</span>
            <ChevronRightIcon />
        </PaginationLink>
    );
}

function PaginationPrevious({
    className,
    ...properties
}: React.ComponentProps<typeof PaginationLink>) {
    return (
        <PaginationLink
            aria-label="Go to previous page"
            className={cn('gap-1 px-2.5 sm:pl-2.5', className)}
            size="default"
            {...properties}
        >
            <ChevronLeftIcon />
            <span className="hidden sm:block">Previous</span>
        </PaginationLink>
    );
}

export {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
};
