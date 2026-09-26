import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import {
    COUNTED_OUTCOMES,
    edgeRangeSchema,
    edgeSummary,
    edgeSummarySchema,
    MAX_EDGE_TRADES,
} from '~/lib/prop-accounts/edge';
import { PropAccountRepo } from '~/lib/prop-accounts/server';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';
import { PLAN_TIMEZONE } from '~/lib/trading/defaults';
import { createTRPCRouter } from '~/server/api/trpc';
import { tradeAssessments } from '~/server/db/schemas/trading';

import { propRateLimitedProcedure, PropRouterBucket } from './mutationGuard';

const edgeReportSchema = z.object({
    summary: edgeSummarySchema,
    truncated: z.boolean(),
});

const journalDay = sql`(${tradeAssessments.createdAt} at time zone ${PLAN_TIMEZONE})::date`;

const edgeProcedure = propRateLimitedProcedure(
    PropRouterBucket.Edge,
    'Too many requests in a short time; wait a minute and try again',
);

export const propEdgeRouter = createTRPCRouter({
    summary: edgeProcedure
        .input(edgeRangeSchema)
        .output(edgeReportSchema)
        .query(async ({ ctx, input }) => {
            const rulebook =
                (await new PropAccountRepo(
                    ctx.db,
                    ctx.userId,
                ).loadRulebookParameters()) ?? DEFAULT_RULEBOOK;
            const rows = await ctx.db
                .select({
                    createdAt: tradeAssessments.createdAt,
                    grade: tradeAssessments.grade,
                    id: tradeAssessments.id,
                    outcome: tradeAssessments.outcome,
                    outcomeR: tradeAssessments.outcomeR,
                    planId: tradeAssessments.planId,
                    score: tradeAssessments.score,
                })
                .from(tradeAssessments)
                .where(
                    and(
                        eq(tradeAssessments.userId, ctx.userId),
                        inArray(tradeAssessments.outcome, COUNTED_OUTCOMES),
                        isNotNull(tradeAssessments.outcomeR),
                        input.from === undefined
                            ? undefined
                            : sql`${journalDay} >= ${input.from}`,
                        input.to === undefined
                            ? undefined
                            : sql`${journalDay} <= ${input.to}`,
                    ),
                )
                .orderBy(desc(tradeAssessments.createdAt))
                .limit(MAX_EDGE_TRADES + 1);
            return {
                summary: edgeSummary(
                    rows.slice(0, MAX_EDGE_TRADES),
                    rulebook.strategy,
                ),
                truncated: rows.length > MAX_EDGE_TRADES,
            };
        }),
});
