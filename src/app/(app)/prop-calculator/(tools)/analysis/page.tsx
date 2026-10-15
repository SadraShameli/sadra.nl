import { type Metadata } from 'next';

import { buildToolMetadata } from '~/app/(app)/prop-calculator/_components/pageMetadata';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { PageTransition } from '~/components/PageTransition';

import { AnalysisView } from './AnalysisView';

export const metadata: Metadata = buildToolMetadata(ToolId.Analysis);

export default function AnalysisPage() {
    return (
        <PageTransition>
            <AnalysisView />
        </PageTransition>
    );
}
