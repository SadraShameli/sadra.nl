import { type Metadata } from 'next';

import { buildToolMetadata } from '~/app/(app)/prop-calculator/_components/pageMetadata';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';

import { CompareView } from './CompareView';

export const metadata: Metadata = buildToolMetadata(ToolId.Compare);

export default function ComparePage() {
    return <CompareView />;
}
