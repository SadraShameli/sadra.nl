import { type Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { ProgramDetail } from '~/app/(app)/lifting/_components/ProgramDetail';
import { getServerSession } from '~/lib/auth/server';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utils';
import { api, HydrateClient } from '~/trpc/server';

interface PageProps {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({
    params,
}: PageProps): Promise<Metadata> {
    const { slug } = await params;
    return {
        description: 'Program detail and enrollment.',
        title: `Program · ${slug}`,
    };
}

export const dynamic = 'force-dynamic';

export default async function LiftingProgramDetailPage({ params }: PageProps) {
    const session = await getServerSession();
    if (!session?.user.id) redirect(routes.auth.login);
    const { slug } = await params;
    try {
        const program = await api.lifting.program.get({ slug });
        void api.lifting.settings.get.prefetch();
        return (
            <HydrateClient>
                <main
                    className={cn(
                        'app-lifting__program',
                        'container pt-spacing pb-24',
                    )}
                >
                    <ProgramDetail program={program} />
                </main>
            </HydrateClient>
        );
    } catch {
        notFound();
    }
}
