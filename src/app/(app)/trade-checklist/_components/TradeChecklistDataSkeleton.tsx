import { Skeleton } from '~/components/ui/Skeleton';

export function TradeChecklistDataSkeleton() {
    return (
        <Skeleton aria-busy="true" className="min-h-144 w-full rounded-xl" />
    );
}
