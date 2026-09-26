import { type Metadata } from 'next';

import { buildToolMetadata } from '~/app/(app)/prop-calculator/_components/pageMetadata';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';

import { LadderLabView } from './LadderLabView';

export const metadata: Metadata = buildToolMetadata(ToolId.LadderLab);

export default function LadderLabPage() {
    return <LadderLabView />;
}
