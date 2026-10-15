import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { LiftingDetailSkeleton } from '~/app/(app)/lifting/_components/LiftingSkeletons';
import { ProgramDetail } from '~/app/(app)/lifting/_components/ProgramDetail';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

interface PageProperties {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({
    params,
}: PageProperties): Promise<Metadata> {
    const { slug } = await params;
    return {
        description: 'Program detail and enrollment.',
        title: `Program · ${slug}`,
    };
}

export default function LiftingProgramDetailPage({ params }: PageProperties) {
    return (
        <PageTransition>
            <main className={cn('app-lifting__program', 'container pt-spacing pb-24')}>
                <Suspense fallback={<LiftingDetailSkeleton />}>
                    <LiftingProgramDetailContent params={params} />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function LiftingProgramDetailContent({ params }: PageProperties) {
    await requireSessionUser();
    const { slug } = await params;
    const program = await loadLiftingProgramDetail(slug);
    void api.lifting.settings.get.prefetch();
    return <HydrateClient><ProgramDetail program={program} /></HydrateClient>;
}

async function loadLiftingProgramDetail(slug: string) {
    try {
        return await api.lifting.program.get({ slug });
    } catch {
        notFound();
    }
}
