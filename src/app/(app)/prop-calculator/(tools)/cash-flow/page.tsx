import { type Metadata } from 'next';

import { buildToolMetadata } from '~/app/(app)/prop-calculator/_components/pageMetadata';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';

import { CashFlowView } from './CashFlowView';

export const metadata: Metadata = buildToolMetadata(ToolId.CashFlow);

export default function CashFlowPage() {
    return <CashFlowView />;
}
