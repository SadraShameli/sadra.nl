import { type ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Skeleton } from '~/components/ui/Skeleton';
import { cn } from '~/lib/utilities';

export function CardSkeleton({
    className,
    rowClassName,
    rows = 3,
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
                <Skeleton
                    className={cn('h-40 w-full rounded-md', bodyClassName)}
                />
            </CardContent>
        </Card>
    );
}
