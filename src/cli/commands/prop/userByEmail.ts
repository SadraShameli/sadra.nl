import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { PropDatabase } from '~/lib/prop-accounts/server';

import { user } from '~/server/db/schemas/auth';

export type UserRow = typeof user.$inferSelect;

export async function findUserByEmail(
    database: PropDatabase,
    email: string,
): Promise<UserRow> {
    const [row] = await database
        .select()
        .from(user)
        .where(eq(sql`lower(${user.email})`, email.toLowerCase()))
        .limit(1);
    if (row === undefined) {
        throw new Error(`No user found for the email "${email}"`);
    }
    return row;
}

export function readUserEmail(raw: string | undefined): null | string {
    if (raw === undefined) return null;
    const parsed = z.email().safeParse(raw.trim());
    if (!parsed.success) {
        throw new Error(`--user-email must be an email address, got "${raw}"`);
    }
    return parsed.data;
}
