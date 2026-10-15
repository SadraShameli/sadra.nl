import { sql } from 'drizzle-orm';
import { jsonb, text, timestamp, varchar } from 'drizzle-orm/pg-core';

import type { ThemeSource, ThemeStyles } from '~/lib/theme';

import { user } from './auth';
import { createTable } from './main';

export const userTheme = createTable('user_theme', {
    name: varchar('name', { length: 80 }).notNull(),
    source: varchar('source', { length: 16 }).$type<ThemeSource>().notNull(),
    styles: jsonb('styles').$type<ThemeStyles>().notNull(),
    themeId: varchar('theme_id', { length: 64 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    userId: text('user_id')
        .primaryKey()
        .references(() => user.id, { onDelete: 'cascade' }),
});
