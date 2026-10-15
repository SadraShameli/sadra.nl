import { Skeleton } from '~/components/ui/Skeleton';

export function AccountsDataSkeleton() {
    return (
        <Skeleton aria-busy="true" className="min-h-screen w-full rounded-xl" />
    );
}
