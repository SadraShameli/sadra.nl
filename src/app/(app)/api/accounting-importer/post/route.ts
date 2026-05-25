import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getCredentialDescriptor } from '~/lib/accounting-importer/credentials/index';
import { runPush } from '~/lib/accounting-importer/runner';
import { asSseResponse } from '~/lib/accounting-importer/sse';
import { isRoot } from '~/lib/auth/roles';
import { getServerSession } from '~/lib/auth/server';
import { openSecret } from '~/lib/crypto/secrets';
import { checkRateLimit } from '~/lib/observability/rate-limit';
import { runPushRequestSchema } from '~/lib/schemas/accounting-importer';
import { accountingImporterCredential, db } from '~/server/db';

export async function POST(request: NextRequest) {
    const session = await getServerSession();
    if (!session?.user.id || !isRoot(session.user.role)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const userId = session.user.id;
    const ok = await checkRateLimit({
        bucket: 'accounting-importer:push',
        key: userId,
        max: 10,
        windowMs: 60 * 60 * 1000,
    });
    if (!ok) {
        return NextResponse.json(
            { error: 'too_many_requests' },
            { status: 429 },
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    const parsed = runPushRequestSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            {
                details: z.treeifyError(parsed.error),
                error: 'invalid_payload',
            },
            { status: 400 },
        );
    }
    const input = parsed.data;

    const [row] = await db
        .select({
            ciphertext: accountingImporterCredential.ciphertext,
            id: accountingImporterCredential.id,
            kind: accountingImporterCredential.kind,
            meta: accountingImporterCredential.meta,
        })
        .from(accountingImporterCredential)
        .where(
            and(
                eq(
                    accountingImporterCredential.id,
                    input.accountingCredentialId,
                ),
                eq(accountingImporterCredential.userId, userId),
            ),
        )
        .limit(1);
    if (!row) {
        return NextResponse.json(
            { error: 'credential_not_found' },
            { status: 404 },
        );
    }
    const descriptor = getCredentialDescriptor(row.kind);
    if (descriptor?.role !== 'accounting') {
        return NextResponse.json(
            { error: 'credential_not_accounting' },
            { status: 400 },
        );
    }
    const secret = await openSecret(row.ciphertext);
    await db
        .update(accountingImporterCredential)
        .set({ lastUsedAt: new Date() })
        .where(eq(accountingImporterCredential.id, row.id));

    const stream = runPush({
        accountingCredential: {
            id: row.id,
            kind: row.kind,
            meta: row.meta,
            secret,
        },
        bookings: input.bookings,
    });

    return asSseResponse(stream);
}

export const runtime = 'nodejs';
export const maxDuration = 60;
