import { createTRPCRouter } from '~/server/api/trpc';

import { propAccountRouter } from './account';
import { propBankrollRouter } from './bankroll';
import { propCopyGroupRouter } from './copyGroup';
import { propDecisionRouter } from './decision';
import { propEdgeRouter } from './edge';
import { propEventRouter } from './event';
import { propExternalFirmRouter } from './externalFirm';
import { propFeeRouter } from './fee';
import { propFirmEngagementRouter } from './firmEngagement';
import { propFirmStatementRouter } from './firmStatement';
import { propPayoutRouter } from './payout';
import { propReviewRouter } from './review';
import { propRoundRouter } from './round';
import { propRulebookRouter } from './rulebook';
import { propScenarioRouter } from './scenario';
import { propSnapshotRouter } from './snapshot';
import { propViolationRouter } from './violation';

export const propAccountsRouter = createTRPCRouter({
    account: propAccountRouter,
    bankroll: propBankrollRouter,
    copyGroup: propCopyGroupRouter,
    decision: propDecisionRouter,
    edge: propEdgeRouter,
    event: propEventRouter,
    externalFirm: propExternalFirmRouter,
    fee: propFeeRouter,
    firmEngagement: propFirmEngagementRouter,
    firmStatement: propFirmStatementRouter,
    payout: propPayoutRouter,
    review: propReviewRouter,
    round: propRoundRouter,
    rulebook: propRulebookRouter,
    scenario: propScenarioRouter,
    snapshot: propSnapshotRouter,
    violation: propViolationRouter,
});
