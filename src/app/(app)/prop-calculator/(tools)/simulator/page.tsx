import { type Metadata } from 'next';

import { buildToolMetadata } from '~/app/(app)/prop-calculator/_components/pageMetadata';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';

import { SimulatorView } from './SimulatorView';

export const metadata: Metadata = buildToolMetadata(ToolId.Simulator);

export default function SimulatorPage() {
    return <SimulatorView />;
}
