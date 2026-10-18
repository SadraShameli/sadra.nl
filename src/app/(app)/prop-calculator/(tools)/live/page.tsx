import { type Metadata } from 'next';

import { buildToolMetadata } from '~/app/(app)/prop-calculator/_components/pageMetadata';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { PageTransition } from '~/components/PageTransition';

import { LiveView } from './LiveView';

export const metadata: Metadata = buildToolMetadata(ToolId.Live);

export default function LivePage() {
    return (
        <PageTransition>
            <LiveView />
        </PageTransition>
    );
}
