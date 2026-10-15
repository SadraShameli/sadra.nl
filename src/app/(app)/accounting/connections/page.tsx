import { type Metadata } from 'next';

import { ConnectionsManager } from '~/app/(app)/accounting/_components/ConnectionsManager';
import { PageTransition } from '~/components/PageTransition';
import { cn } from '~/lib/utilities';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Connections · Accounting Importer',
};

export default function ConnectionsPage() {
    return (
        <PageTransition>
            <main
                className={cn(
                    'app-accounting__connections',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                            Connections
                        </h1>
                    </div>
                </header>

                <ConnectionsManager />
            </main>
        </PageTransition>
    );
}
