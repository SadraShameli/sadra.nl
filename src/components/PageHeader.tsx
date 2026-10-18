import { ArrowLeft } from 'lucide-react';
import { type Route } from 'next';
import Link from 'next/link';
import { type ComponentProps, type ReactNode, type Ref } from 'react';

import { cn } from '~/lib/utilities';

export interface PageHeaderBackLink {
    readonly href: Route;
    readonly label: string;
}

export function PageHeader({
    actions,
    backLink,
    className,
    eyebrow,
    lead,
    meta,
    title,
    titleReference,
}: {
    readonly actions?: ReactNode;
    readonly backLink?: PageHeaderBackLink;
    readonly className?: string;
    readonly eyebrow?: string;
    readonly lead?: ReactNode;
    readonly meta?: ReactNode;
    readonly title: ReactNode;
    readonly titleReference?: Ref<HTMLHeadingElement>;
}) {
    return (
        <header
            className={cn(
                'app-tool__header',
                'mb-10 flex flex-wrap items-end justify-between gap-6',
                className,
            )}
        >
            <div className="flex max-w-2xl flex-col gap-4">
                {backLink !== undefined && (
                    <Link
                        className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
                        href={backLink.href}
                    >
                        <ArrowLeft aria-hidden className="size-4" />
                        {backLink.label}
                    </Link>
                )}
                {eyebrow !== undefined && (
                    <div className="type-eyebrow text-camel">{eyebrow}</div>
                )}
                <PageTitle
                    ref={titleReference}
                    tabIndex={titleReference === undefined ? undefined : -1}
                >
                    {title}
                </PageTitle>
                {lead === undefined ? null : (
                    <ToolPageLead>{lead}</ToolPageLead>
                )}
                {meta === undefined ? null : (
                    <div className="flex flex-wrap items-center gap-2">
                        {meta}
                    </div>
                )}
            </div>
            {actions === undefined ? null : (
                <div className="flex flex-wrap items-center gap-2">
                    {actions}
                </div>
            )}
        </header>
    );
}

function PageTitle({
    children,
    className,
    ...properties
}: ComponentProps<'h1'>) {
    return (
        <h1
            className={cn(
                'm-0 type-display-page text-balance text-ink outline-none',
                className,
            )}
            {...properties}
        >
            {children}
        </h1>
    );
}

function ToolPageLead({ children }: { readonly children: ReactNode }) {
    return (
        <p className="m-0 max-w-measure type-small text-ink-muted">
            {children}
        </p>
    );
}
