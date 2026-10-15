import { ExternalLink } from 'lucide-react';
import { type Metadata } from 'next';
import { type ReactNode, Suspense } from 'react';

import { ExerciseProgress } from '~/app/(app)/lifting/_components/ExerciseProgress';
import { LiftingDetailHeader } from '~/app/(app)/lifting/_components/LiftingDetailHeader';
import { LiftingDetailSkeleton } from '~/app/(app)/lifting/_components/LiftingSkeletons';
import { LiftingUserSection } from '~/app/(app)/lifting/_components/LiftingUserSection';
import { TitledCardSkeleton } from '~/components/PageSkeleton';
import { PageTransition } from '~/components/PageTransition';
import { Button } from '~/components/ui/Button';
import { requireSessionUser } from '~/lib/auth/guards';
import {
    type ExerciseRow,
    loadOfficialExercise,
    loadOfficialExercises,
} from '~/lib/lifting/OfficialCatalog';
import { cn } from '~/lib/utilities';
import { loadOrNotFound } from '~/trpc/loadOrNotFound';
import { api } from '~/trpc/server';

type ExercisePageProperties = PageProps<'/lifting/exercises/[slug]'>;

export async function generateMetadata({
    params,
}: ExercisePageProperties): Promise<Metadata> {
    const { slug } = await params;
    return {
        description: 'Exercise detail with history and PRs.',
        title: `Lifting · ${slug}`,
    };
}

export async function generateStaticParams() {
    const { rows } = await loadOfficialExercises();
    return rows.map(({ slug }) => ({ slug }));
}

export default function LiftingExerciseDetailPage({
    params,
}: ExercisePageProperties) {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-lifting__exercise-detail',
                    'container pt-spacing pb-24',
                )}
            >
                <Suspense fallback={<LiftingDetailSkeleton />}>
                    <LiftingExerciseDetailContent params={params} />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function CustomExerciseDetail({ slug }: { readonly slug: string }) {
    await requireSessionUser();
    const exercise = await loadOrNotFound(() =>
        api.lifting.exercise.get({ slug }),
    );
    return (
        <LiftingUserSection>
            <ExerciseOverview exercise={exercise}>
                <ExerciseProgress exerciseId={exercise.id} />
            </ExerciseOverview>
        </LiftingUserSection>
    );
}

function ExerciseOverview({
    children,
    exercise,
}: {
    readonly children: ReactNode;
    readonly exercise: ExerciseRow;
}) {
    return (
        <div className="flex flex-col gap-8">
            <LiftingDetailHeader
                description={exercise.instructions}
                eyebrow={`${exercise.equipment} · ${exercise.primaryMuscle}`}
                title={exercise.name}
            />
            {exercise.videoUrl && (
                <Button
                    asChild
                    className="w-fit gap-2"
                    type="button"
                    variant="outline"
                >
                    <a
                        href={exercise.videoUrl}
                        rel="noreferrer"
                        target="_blank"
                    >
                        <ExternalLink className="size-4" />
                        Watch demo
                    </a>
                </Button>
            )}
            {children}
        </div>
    );
}

function ExerciseProgressSkeleton() {
    return (
        <>
            <TitledCardSkeleton
                bodyClassName="h-48"
                title="Estimated 1RM trend"
            />
            <TitledCardSkeleton bodyClassName="h-64" title="Personal records" />
        </>
    );
}

async function LiftingExerciseDetailContent({
    params,
}: Pick<ExercisePageProperties, 'params'>) {
    const { slug } = await params;
    const official = await loadOfficialExercise(slug);
    return official ? (
        <ExerciseOverview exercise={official}>
            <Suspense fallback={<ExerciseProgressSkeleton />}>
                <LiftingUserSection>
                    <ExerciseProgress exerciseId={official.id} />
                </LiftingUserSection>
            </Suspense>
        </ExerciseOverview>
    ) : (
        <CustomExerciseDetail slug={slug} />
    );
}
