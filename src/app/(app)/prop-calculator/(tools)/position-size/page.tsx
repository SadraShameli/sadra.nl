import { type Metadata } from 'next';

import { buildToolMetadata } from '~/app/(app)/prop-calculator/_components/pageMetadata';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { PageTransition } from '~/components/PageTransition';

import { PositionSizeView } from './PositionSizeView';

export const metadata: Metadata = buildToolMetadata(ToolId.PositionSize);

export default function PositionSizePage() {
    return (
        <PageTransition>
            <PositionSizeView />
        </PageTransition>
    );
}
