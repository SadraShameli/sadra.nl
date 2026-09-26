import { type Metadata } from 'next';

import { buildToolMetadata } from '~/app/(app)/prop-calculator/_components/pageMetadata';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';

import { PlannerView } from './PlannerView';

export const metadata: Metadata = buildToolMetadata(ToolId.Planner);

export default function PlannerPage() {
    return <PlannerView />;
}
