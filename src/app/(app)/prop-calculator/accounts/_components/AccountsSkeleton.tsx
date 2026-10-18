import { type ReactNode } from 'react';

import { CardSkeleton, TitledCardSkeleton } from '~/components/PageSkeleton';
import { Card, CardContent } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';

const REVIEW_NAV_ROWS = 6;

export function AccountDetailSkeleton() {
    return (
        <SkeletonStack label="Loading the account">
            <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-10 w-64" />
            </div>
            <Skeleton className="h-24 w-full rounded-lg" />
            <TitledCardSkeleton bodyClassName="h-16" title="Plan rules" />
            <TitledCardSkeleton bodyClassName="h-32" title="Account state" />
            <TitledCardSkeleton title="Snapshot history" />
        </SkeletonStack>
    );
}

export function AccountFormSkeleton() {
    return (
        <SkeletonStack label="Loading the account form">
            <CardSkeleton rows={3} />
            <CardSkeleton rows={4} />
            <CardSkeleton rows={2} />
        </SkeletonStack>
    );
}

export function AccountsDataSkeleton() {
    return (
        <SkeletonStack label="Loading">
            <CardSkeleton rows={4} />
            <CardSkeleton rows={3} />
        </SkeletonStack>
    );
}

export function FirmsSkeleton() {
    return (
        <SkeletonStack label="Loading your firms">
            <TitledCardSkeleton bodyClassName="h-56" title="Firm roster" />
            <TitledCardSkeleton bodyClassName="h-32" title="Scale gate" />
        </SkeletonStack>
    );
}

export function NextSlotSkeleton() {
    return (
        <SkeletonStack label="Loading next slot">
            <Skeleton className="h-9 w-full max-w-xl rounded-md" />
            <TitledCardSkeleton bodyClassName="h-56" title="Ranked" />
            <TitledCardSkeleton bodyClassName="h-24" title="Not rankable" />
        </SkeletonStack>
    );
}

export function OverviewSkeleton() {
    return (
        <SkeletonStack label="Loading your overview">
            <Skeleton className="h-9 w-full max-w-md rounded-md" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <CardSkeleton rows={2} />
            <CardSkeleton rows={6} />
        </SkeletonStack>
    );
}

export function RoundsSkeleton() {
    return (
        <SkeletonStack label="Loading your rounds">
            <TitledCardSkeleton bodyClassName="h-48" title="Your rounds" />
            <TitledCardSkeleton bodyClassName="h-24" title="Next round" />
            <CardSkeleton rows={3} />
        </SkeletonStack>
    );
}

export function RulebookSkeleton() {
    return (
        <SkeletonStack label="Loading your rulebook">
            <TitledCardSkeleton
                bodyClassName="h-20"
                title="Deviations from the skill"
            />
            <CardSkeleton rows={4} />
            <CardSkeleton rows={4} />
            <CardSkeleton rows={3} />
        </SkeletonStack>
    );
}

export function WeeklyReviewSkeleton() {
    return (
        <SkeletonStack label="Loading the weekly review">
            <TitledCardSkeleton bodyClassName="h-10" title="Adherence" />
            <div className="grid gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                <div className="flex flex-col gap-2 max-md:hidden">
                    {Array.from({ length: REVIEW_NAV_ROWS }, (_, index) => (
                        <Skeleton className="h-11 w-full" key={index} />
                    ))}
                </div>
                <Skeleton className="h-9 w-full md:hidden" />
                <Card>
                    <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: REVIEW_NAV_ROWS }, (_, index) => (
                            <div className="flex flex-col gap-2" key={index}>
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-9 w-full" />
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </SkeletonStack>
    );
}

function SkeletonStack({
    children,
    label,
}: {
    readonly children: ReactNode;
    readonly label: string;
}) {
    return (
        <div
            aria-busy="true"
            aria-label={label}
            className="flex flex-col gap-6"
            role="status"
        >
            {children}
        </div>
    );
}
