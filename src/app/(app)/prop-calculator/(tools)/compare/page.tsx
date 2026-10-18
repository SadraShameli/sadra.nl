import { type Metadata } from 'next';

import { buildToolMetadata } from '~/app/(app)/prop-calculator/_components/pageMetadata';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { PageTransition } from '~/components/PageTransition';

import { CompareView } from './CompareView';

export const metadata: Metadata = buildToolMetadata(ToolId.Compare);

export default function ComparePage() {
    return (
        <PageTransition>
            <CompareView />
        </PageTransition>
    );
}
