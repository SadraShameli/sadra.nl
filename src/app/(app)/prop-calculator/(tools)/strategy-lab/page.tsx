import { type Metadata } from 'next';

import { buildToolMetadata } from '~/app/(app)/prop-calculator/_components/pageMetadata';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { PageTransition } from '~/components/PageTransition';

import { StrategyLabView } from './StrategyLabView';

export const metadata: Metadata = buildToolMetadata(ToolId.StrategyLab);

export default function StrategyLabPage() {
    return (
        <PageTransition>
            <StrategyLabView />
        </PageTransition>
    );
}
