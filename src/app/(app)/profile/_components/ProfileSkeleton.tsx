import { Card } from '~/components/ui/Card';
import { Skeleton } from '~/components/ui/Skeleton';

const NAV_ITEMS = 5;
const CONTENT_BLOCKS = 3;

export function ProfileSkeleton() {
    return (
        <>
            <Card aria-busy="true" className="p-0 md:sticky md:top-24">
                <div className="flex flex-col gap-2 p-4 md:py-6">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="mb-2 h-4 w-40" />
                    {Array.from({ length: NAV_ITEMS }, (_, index) => (
                        <Skeleton className="h-9 w-full" key={index} />
                    ))}
                </div>
            </Card>
            <Card aria-busy="true" className="min-w-0 p-0">
                <section className="flex min-w-0 flex-col gap-6 p-4 md:p-8">
                    <Skeleton className="h-8 w-40" />
                    {Array.from({ length: CONTENT_BLOCKS }, (_, index) => (
                        <Skeleton
                            className="h-40 w-full rounded-xl"
                            key={index}
                        />
                    ))}
                </section>
            </Card>
        </>
    );
}
