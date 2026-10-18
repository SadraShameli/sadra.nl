import { type Metadata } from 'next';
import { Suspense } from 'react';

import { LiftingPageHeader } from '~/app/(app)/lifting/_components/LiftingPageHeader';
import { LogShellSkeleton } from '~/app/(app)/lifting/_components/LiftingSkeletons';
import { LogShell } from '~/app/(app)/lifting/_components/log/LogShell';
import { PageTransition } from '~/components/PageTransition';
import { requireSessionUser } from '~/lib/auth/guards';
import { cn } from '~/lib/utilities';
import { api } from '~/trpc/server';

export const metadata: Metadata = {
    description: 'Log a workout, one tap per set.',
    title: 'Log',
};

export default function LiftingLogPage() {
    return (
        <PageTransition>
            <main
                className={cn('app-lifting__log', 'container pt-spacing pb-24')}
            >
                <LiftingPageHeader
                    description="One tap per set. Quick capture, no friction."
                    title="Log"
                />
                <Suspense fallback={<LogShellSkeleton />}>
                    <LiftingLogContent />
                </Suspense>
            </main>
        </PageTransition>
    );
}

async function LiftingLogContent() {
    await requireSessionUser();
    const settings = await api.lifting.settings.get();
    return <LogShell initialSettings={settings} />;
}
