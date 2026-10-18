import { desc, eq } from 'drizzle-orm';
import 'server-only';

import { db, tradingPlans } from '~/server/db';

export async function loadTradingPlans(
    userId: string,
): Promise<(typeof tradingPlans.$inferSelect)[]> {
    return db
        .select()
        .from(tradingPlans)
        .where(eq(tradingPlans.userId, userId))
        .orderBy(tradingPlans.sortOrder, desc(tradingPlans.updatedAt));
}
