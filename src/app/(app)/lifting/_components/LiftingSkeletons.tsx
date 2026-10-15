import {
    CardSkeleton,
    LabelledStatSkeleton,
    PageHeaderSkeleton,
    TitledCardSkeleton,
} from '~/components/PageSkeleton';
import { Skeleton } from '~/components/ui/Skeleton';

const DETAIL_BODY_ROWS = 6;
const GOAL_STAT_LABELS = ['Active', 'Achieved', 'Failed', 'Paused'] as const;
const BODY_STAT_LABELS = [
    'Entries',
    'Latest weight',
    'Latest bodyfat',
    'Weight 30-day',
] as const;
const LOG_EXERCISE_BLOCKS = 2;

export function BodyViewSkeleton() {
    return (
        <div aria-busy="true" className="flex flex-col gap-6">
            <TitledCardSkeleton bodyClassName="h-24" title="Add measurement" />
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {BODY_STAT_LABELS.map((label) => (
                    <LabelledStatSkeleton key={label} label={label} />
                ))}
            </section>
            <TitledCardSkeleton bodyClassName="h-48" title="Trend" />
            <TitledCardSkeleton bodyClassName="h-64" title="History" />
        </div>
    );
}

export function GoalsViewSkeleton() {
    return (
        <div aria-busy="true" className="flex flex-col gap-6">
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {GOAL_STAT_LABELS.map((label) => (
                    <LabelledStatSkeleton key={label} label={label} />
                ))}
            </section>
            <TitledCardSkeleton bodyClassName="h-24" title="New goal" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                <TitledCardSkeleton
                    bodyClassName="h-32"
                    title="Achievement heatmap"
                />
                <TitledCardSkeleton
                    bodyClassName="h-72 w-72"
                    title="Target calendar"
                />
            </div>
            <TitledCardSkeleton bodyClassName="h-64" title="All goals" />
        </div>
    );
}

export function HistoryViewSkeleton() {
    return <TitledCardSkeleton bodyClassName="h-96" title="Workouts" />;
}

export function LiftingDetailSkeleton() {
    return (
        <div aria-busy="true" className="flex flex-col gap-8">
            <PageHeaderSkeleton className="mb-0" />
            <CardSkeleton rows={DETAIL_BODY_ROWS} />
        </div>
    );
}

export function LogShellSkeleton() {
    return (
        <div aria-busy="true">
            <Skeleton className="mb-4 h-16 w-full rounded-2xl" />
            <div className="flex flex-col gap-4">
                {Array.from({ length: LOG_EXERCISE_BLOCKS }, (_, index) => (
                    <Skeleton className="h-48 w-full rounded-2xl" key={index} />
                ))}
            </div>
        </div>
    );
}
