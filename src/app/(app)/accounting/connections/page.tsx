import { type Metadata } from 'next';

import { cn } from '~/lib/utilities';

import { ConnectionsManager } from '../_components/ConnectionsManager';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Connections · Accounting Importer',
};

export default function ConnectionsPage() {
    return (
        <main
            className={cn(
                'app-accounting__connections',
                'container pt-spacing pb-24',
            )}
        >
            <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Connections
                    </h1>
                </div>
            </header>

            <ConnectionsManager />
        </main>
    );
}
