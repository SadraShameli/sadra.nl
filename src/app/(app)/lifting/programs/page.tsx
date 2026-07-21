import { type Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getServerSession } from '~/lib/auth/server';
import { routes } from '~/lib/site/routes';
import { cn } from '~/lib/utilities';

import { ProgramsLibrary } from '../_components/ProgramsLibrary';

export const metadata: Metadata = {
    description: 'Pick a program or build your own.',
    title: 'Programs',
};

export const dynamic = 'force-dynamic';

export default async function LiftingProgramsPage() {
    const session = await getServerSession();
    if (!session?.user.id) redirect(routes.auth.login);
    return (
        <main
            className={cn(
                'app-lifting__programs',
                'container pt-spacing pb-24',
            )}
        >
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    Programs
                </h1>
                <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                    Follow a proven program or build your own.
                </p>
            </header>
            <ProgramsLibrary />
        </main>
    );
}
