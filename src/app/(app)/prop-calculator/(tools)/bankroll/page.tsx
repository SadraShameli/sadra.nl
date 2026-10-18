import { type Metadata } from 'next';

import { buildToolMetadata } from '~/app/(app)/prop-calculator/_components/pageMetadata';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { PageTransition } from '~/components/PageTransition';

import { BankrollView } from './BankrollView';

export const metadata: Metadata = buildToolMetadata(ToolId.Bankroll);

export default function BankrollPage() {
    return (
        <PageTransition>
            <BankrollView />
        </PageTransition>
    );
}
