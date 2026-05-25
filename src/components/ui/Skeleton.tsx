import { cn } from '~/lib/utils';

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                'animate-pulse rounded-md bg-muted opacity-100 transition-opacity duration-300 starting:opacity-0',
                className,
            )}
            {...props}
        />
    );
}

export { Skeleton };
