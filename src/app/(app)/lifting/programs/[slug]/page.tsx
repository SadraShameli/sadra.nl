import { type Metadata } from 'next';
import { type ReactNode, Suspense } from 'react';

import { LiftingDetailHeader } from '~/app/(app)/lifting/_components/LiftingDetailHeader';
import { LiftingDetailSkeleton } from '~/app/(app)/lifting/_components/LiftingSkeletons';
import { LiftingUserSection } from '~/app/(app)/lifting/_components/LiftingUserSection';
import { ProgramEnrollCard } from '~/app/(app)/lifting/_components/ProgramEnrollCard';
import { ProgramScheduleTabs } from '~/app/(app)/lifting/_components/ProgramScheduleTabs';
import { TitledCardSkeleton } from '~/components/PageSkeleton';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import {
    loadOfficialProgram,
    loadOfficialPrograms,
    type ProgramRow,
} from '~/lib/lifting/OfficialCatalog';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';
import { loadOrNotFound } from '~/trpc/loadOrNotFound';
import { api } from '~/trpc/server';

type ProgramPageProperties = PageProps<'/lifting/programs/[slug]'>;

export async function generateMetadata({
    params,
}: ProgramPageProperties): Promise<Metadata> {
    const { slug } = await params;
    return {
        description: 'Program detail and enrollment.',
        title: `Program · ${slug}`,
    };
}

export async function generateStaticParams() {
    const programs = await loadOfficialPrograms();
    return programs.map(({ slug }) => ({ slug }));
}

export default function LiftingProgramDetailPage({
    params,
}: ProgramPageProperties) {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-lifting__program',
                    'container pt-spacing pb-24',
                )}
            >
                <Suspense fallback={<LiftingDetailSkeleton />}>
                    <LiftingProgramDetailContent params={params} />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function CustomProgramDetail({ slug }: { readonly slug: string }) {
    await requireSessionUser();
    const program = await loadOrNotFound(() =>
        api.lifting.program.get({ slug }),
    );
    return (
        <LiftingUserSection>
            <ProgramOverview program={program}>
                <ProgramEnrollCard program={program} />
            </ProgramOverview>
        </LiftingUserSection>
    );
}

async function LiftingProgramDetailContent({
    params,
}: Pick<ProgramPageProperties, 'params'>) {
    const { slug } = await params;
    const official = await loadOfficialProgram(slug);
    return official ? (
        <ProgramOverview program={official}>
            <Suspense fallback={<TitledCardSkeleton title="Enroll" />}>
                <LiftingUserSection>
                    <ProgramEnrollCard program={official} />
                </LiftingUserSection>
            </Suspense>
        </ProgramOverview>
    ) : (
        <CustomProgramDetail slug={slug} />
    );
}

function ProgramOverview({
    children,
    program,
}: {
    readonly children: ReactNode;
    readonly program: ProgramRow;
}) {
    return (
        <div className="flex flex-col gap-8">
            <LiftingDetailHeader
                backLink={{ href: routes.lifting.programs, label: 'Programs' }}
                description={program.description}
                meta={[
                    program.category,
                    `${String(program.daysPerWeek)}× / week`,
                    `${String(program.lengthWeeks)} weeks`,
                ]}
                title={program.name}
            />
            {children}
            <ProgramScheduleTabs schedule={program.schedule} />
        </div>
    );
}
