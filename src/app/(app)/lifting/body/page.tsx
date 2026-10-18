import { type Metadata } from 'next';
import { Suspense } from 'react';

import { BodyView } from '~/app/(app)/lifting/_components/BodyView';
import { LiftingPageHeader } from '~/app/(app)/lifting/_components/LiftingPageHeader';
import { BodyViewSkeleton } from '~/app/(app)/lifting/_components/LiftingSkeletons';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

export const metadata: Metadata = {
    description: 'Track bodyweight and tape measurements.',
    title: 'Body',
};

export default function LiftingBodyPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-lifting__body',
                    'container pt-spacing pb-24',
                )}
            >
                <LiftingPageHeader
                    description="Track bodyweight and tape measurements."
                    title="Body"
                />
                <Suspense fallback={<BodyViewSkeleton />}>
                    <LiftingBodyContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function LiftingBodyContent() {
    await requireSessionUser();
    await api.lifting.settings.get.prefetch();
    return (
        <HydrateClient>
            <BodyView />
        </HydrateClient>
    );
}
