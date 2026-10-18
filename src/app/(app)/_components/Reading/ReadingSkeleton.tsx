import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utilities';

const STAT_SKELETONS = ['latest', 'high', 'low'] as const;
const FILTER_SKELETON_WIDTHS = ['w-36', 'w-56', 'w-56', 'w-56'] as const;

export function ReadingBodySkeleton() {
    return (
        <div aria-busy="true" aria-label="Loading readings">
            <div className="border-b border-line-faint px-4 py-3">
                <Skeleton className="h-10 w-full max-w-xl rounded-full" />
            </div>
            <div className="m-6 mb-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] overflow-hidden rounded-lg border border-line-faint">
                {STAT_SKELETONS.map((key) => (
                    <div className="flex flex-col gap-1.5 px-4 py-3" key={key}>
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-10 w-28" />
                    </div>
                ))}
            </div>
            <Skeleton className="m-6 h-64 rounded-md lg:h-80" />
        </div>
    );
}

export default function ReadingSkeleton() {
    return (
        <div
            aria-busy="true"
            className={cn(
                'app-reading',
                'overflow-hidden rounded-xl border border-line bg-surface-sunken',
            )}
        >
            <div className="flex flex-wrap items-center gap-2.5 border-b border-line-faint p-4">
                {FILTER_SKELETON_WIDTHS.map((width, index) => (
                    <Skeleton
                        className={cn('h-9 rounded-full', width)}
                        key={index}
                    />
                ))}
            </div>
            <ReadingBodySkeleton />
        </div>
    );
}
