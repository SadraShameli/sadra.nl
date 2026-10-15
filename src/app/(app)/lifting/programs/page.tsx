import { type Metadata } from 'next';
import { Suspense } from 'react';

import { LiftingPageHeader } from '~/app/(app)/lifting/_components/LiftingPageHeader';
import { ProgramsLibrary } from '~/app/(app)/lifting/_components/ProgramsLibrary';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';

export const metadata: Metadata = {
    description: 'Pick a program or build your own.',
    title: 'Programs',
};

export default function LiftingProgramsPage() {
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
                <Suspense fallback={<ProgramsLibrary />}>
                    <LiftingProgramsContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function LiftingProgramsContent() {
    await requireSessionUser();
    return <ProgramsLibrary />;
}
