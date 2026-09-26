import { type Metadata } from 'next';

import { buildToolMetadata } from '~/app/(app)/prop-calculator/_components/pageMetadata';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';

import { SizingView } from './SizingView';

export const metadata: Metadata = buildToolMetadata(ToolId.Sizing);

export default function SizingPage() {
    return <SizingView />;
}
