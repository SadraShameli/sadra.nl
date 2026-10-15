import { type Metadata } from 'next';

import { buildToolMetadata } from '~/app/(app)/prop-calculator/_components/pageMetadata';
import { ToolId } from '~/app/(app)/prop-calculator/_components/toolCatalog';
import { PageTransition } from '~/components/PageTransition';

import { PayoutPlannerView } from './PayoutPlannerView';

export const metadata: Metadata = buildToolMetadata(ToolId.PayoutPlanner);

export default function PayoutPlannerPage() {
    return (
        <PageTransition>
            <PayoutPlannerView />
        </PageTransition>
    );
}
