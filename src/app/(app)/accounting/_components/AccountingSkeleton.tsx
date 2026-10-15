import { Skeleton } from '~/components/ui/Skeleton';
import { cn } from '~/lib/utilities';

export function AccountingPageSkeleton() {
    return (
        <main
            aria-busy="true"
            aria-label="Loading"
            className={cn('app-accounting__loading', 'container pt-spacing pb-24')}
        >
            <div aria-hidden className="mb-8 h-9 sm:h-10" />
            <Skeleton className="min-h-[36rem] w-full rounded-xl" />
        </main>
    );
}
