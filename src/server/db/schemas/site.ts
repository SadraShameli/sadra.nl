import { sql } from 'drizzle-orm';
import { integer, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { createTable } from './main';

export const siteShowcase = createTable('site_showcase', {
    averageRHundredths: integer('average_r_hundredths').notNull(),
    todayProfitAndLossCents: integer('profit_and_loss_cents').notNull(),
    totalPayoutCents: integer('total_profit_and_loss_cents')
        .notNull()
        .default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    userId: text('user_id')
        .primaryKey()
        .references(() => user.id, { onDelete: 'cascade' }),
    winRatePercent: integer('win_rate_percent').notNull(),
});
