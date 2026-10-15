import { type ReactNode } from 'react';

import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '~/components/ui/Card';
import { Skeleton } from '~/components/ui/Skeleton';
import { cn } from '~/lib/utilities';

export function PageSkeleton({
    children,
    className,
    hasDescription = true,
}: {
    readonly children: ReactNode;
    readonly className?: string;
    readonly hasDescription?: boolean;
}) {
    return (
        <main
            aria-busy="true"
            aria-label="Loading"
            className={cn('container pt-spacing pb-24', className)}
        >
            <PageHeaderSkeleton hasDescription={hasDescription} />
            {children}
        </main>
    );
}

export function PageHeaderSkeleton({
    className,
    hasDescription = true,
}: {
    readonly className?: string;
    readonly hasDescription?: boolean;
}) {
    return (
        <header className={cn('mb-8', className)}>
            <Skeleton className="h-9 w-48 sm:h-10 sm:w-64" />
            {hasDescription && (
                <Skeleton className="mt-2 h-5 w-full max-w-md sm:h-6" />
            )}
        </header>
    );
}

export function CardSkeleton({
    className,
    rows = 3,
    rowClassName,
}: {
    readonly className?: string;
    readonly rowClassName?: string;
    readonly rows?: number;
}) {
    return (
        <Card className={className}>
            <CardHeader>
                <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                {Array.from({ length: rows }, (_, index) => (
                    <Skeleton
                        className={cn('h-9 w-full', rowClassName)}
                        key={index}
                    />
                ))}
            </CardContent>
        </Card>
    );
}

export function StatCardSkeleton({ className }: { readonly className?: string }) {
    return (
        <Card className={cn('gap-2 py-4', className)}>
            <CardContent>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-1 h-8 w-16" />
            </CardContent>
        </Card>
    );
}

export function StatGridSkeleton({
    className,
    count,
}: {
    readonly className?: string;
    readonly count: number;
}) {
    return (
        <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-3', className)}>
            {Array.from({ length: count }, (_, index) => (
                <StatCardSkeleton key={index} />
            ))}
        </div>
    );
}

export function TitledCardSkeleton({
    bodyClassName,
    className,
    title,
}: {
    readonly bodyClassName?: string;
    readonly className?: string;
    readonly title: ReactNode;
}) {
    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <Skeleton className={cn('h-40 w-full rounded-md', bodyClassName)} />
            </CardContent>
        </Card>
    );
}

export function LabelledStatSkeleton({
    className,
    label,
}: {
    readonly className?: string;
    readonly label: ReactNode;
}) {
    return (
        <Card className={cn('gap-2 py-4', className)}>
            <CardContent>
                <p className="text-xs text-muted-foreground">{label}</p>
                <Skeleton className="mt-1 h-8 w-16" />
            </CardContent>
        </Card>
    );
}
