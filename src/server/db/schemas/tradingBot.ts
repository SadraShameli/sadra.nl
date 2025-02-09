import { sql } from 'drizzle-orm';
import {
    boolean,
    pgTableCreator,
    serial,
    timestamp,
    varchar,
} from 'drizzle-orm/pg-core';

export const createTableTradingBot = pgTableCreator(
    (name) => `trading_bot_${name}`,
);

export const tradingBotAccount = createTableTradingBot('account', {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    server: varchar('server', { length: 256 }).notNull(),
    login: varchar('login', { length: 256 }).notNull(),
    password: varchar('password', { length: 256 }).notNull(),
    enabled: boolean('enabled').default(false).notNull(),
    configName: varchar('config_name', { length: 256 }),
});
