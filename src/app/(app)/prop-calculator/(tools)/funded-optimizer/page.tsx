import { type Metadata } from 'next';

import { buildToolMetadata } from '~/app/(app)/prop-calculator/_components/pageMetadata';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';

import { FundedOptimizerView } from './FundedOptimizerView';

export const metadata: Metadata = buildToolMetadata(ToolId.FundedOptimizer);

export default function FundedOptimizerPage() {
    return <FundedOptimizerView />;
}
