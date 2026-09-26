import { createTRPCRouter } from '~/server/api/trpc';

import { propAccountRouter } from './account';
import { propCopyGroupRouter } from './copyGroup';
import { propDecisionRouter } from './decision';
import { propEdgeRouter } from './edge';
import { propEventRouter } from './event';
import { propFeeRouter } from './fee';
import { propPayoutRouter } from './payout';
import { propRulebookRouter } from './rulebook';
import { propScenarioRouter } from './scenario';
import { propSnapshotRouter } from './snapshot';

export const propAccountsRouter = createTRPCRouter({
    account: propAccountRouter,
    copyGroup: propCopyGroupRouter,
    decision: propDecisionRouter,
    edge: propEdgeRouter,
    event: propEventRouter,
    fee: propFeeRouter,
    payout: propPayoutRouter,
    rulebook: propRulebookRouter,
    scenario: propScenarioRouter,
    snapshot: propSnapshotRouter,
});
