import { type Metadata } from 'next';

import { TransactionsBrowser } from '~/app/(app)/accounting/_components/TransactionsBrowser';
import { cn } from '~/lib/utilities';
import { api, HydrateClient } from '~/trpc/server';

export const metadata: Metadata = {
    robots: { follow: false, index: false },
    title: 'Transactions · Accounting Importer',
};

export default function TransactionsPage() {
    void api.accounting.credentials.list.prefetch();

    return (
        <HydrateClient>
            <main
                className={cn(
                    'app-accounting__transactions',
                    'container pt-spacing pb-24',
                )}
            >
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Recent transactions
                    </h1>
                </header>
                <TransactionsBrowser />
            </main>
        </HydrateClient>
    );
}
