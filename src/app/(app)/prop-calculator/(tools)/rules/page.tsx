import { type Metadata } from 'next';

import { buildToolMetadata } from '~/app/(app)/prop-calculator/_components/pageMetadata';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';

import { RulesView } from './RulesView';

export const metadata: Metadata = buildToolMetadata(ToolId.Rules);

export default function RulesPage() {
    return <RulesView />;
}
