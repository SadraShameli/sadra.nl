import { desc, eq } from 'drizzle-orm';
import 'server-only';

import { db, tradingPlans } from '~/server/db';

export async function loadActiveTradingPlan(
    userId: string,
): Promise<typeof tradingPlans.$inferSelect | undefined> {
    const [active] = await db
        .select()
        .from(tradingPlans)
        .where(eq(tradingPlans.userId, userId))
        .orderBy(
            desc(tradingPlans.isActive),
            tradingPlans.sortOrder,
            desc(tradingPlans.updatedAt),
        )
        .limit(1);
    return active;
}
