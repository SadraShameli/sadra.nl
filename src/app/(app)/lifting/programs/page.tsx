import { type Metadata } from 'next';
import { Suspense } from 'react';

import { LiftingPageHeader } from '~/app/(app)/lifting/_components/LiftingPageHeader';
import { ProgramsLibrarySkeleton } from '~/app/(app)/lifting/_components/LiftingSkeletons';
import { ProgramsLibrary } from '~/app/(app)/lifting/_components/ProgramsLibrary';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import {
    loadOfficialPrograms,
    type ProgramRow,
} from '~/lib/lifting/OfficialCatalog';
import { cn } from '~/lib/utilities';

export const metadata: Metadata = {
    description: 'Pick a program or build your own.',
    title: 'Programs',
};

export default async function LiftingProgramsPage() {
    const officialPrograms = await loadOfficialPrograms();
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-lifting__programs',
                    'container pt-spacing pb-24',
                )}
            >
                <LiftingPageHeader
                    description="Follow a proven program or build your own."
                    title="Programs"
                />
                <Suspense fallback={<ProgramsLibrarySkeleton />}>
                    <LiftingProgramsContent
                        officialPrograms={officialPrograms}
                    />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function LiftingProgramsContent({
    officialPrograms,
}: {
    readonly officialPrograms: ProgramRow[];
}) {
    await requireSessionUser();
    return <ProgramsLibrary officialPrograms={officialPrograms} />;
}
