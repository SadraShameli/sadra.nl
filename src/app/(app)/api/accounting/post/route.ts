import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { RunId } from '~/lib/accounting/core/ids';
import {
    CredentialRegistry,
    CredentialRole,
} from '~/lib/accounting/credentials/index';
import { runPush } from '~/lib/accounting/runner';
import { asSseResponse } from '~/lib/accounting/sse';
import { isRoot } from '~/lib/auth/roles';
import { getServerSession } from '~/lib/auth/server';
import { openSecret } from '~/lib/crypto/secrets';
import { checkRateLimit } from '~/lib/observability/rate-limit';
import { runPushRequestSchema } from '~/lib/schemas/accounting';
import { accountingCredential, db } from '~/server/db';

export async function POST(request: NextRequest) {
    const session = await getServerSession();
    if (!session?.user.id || !isRoot(session.user.role)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const userId = session.user.id;
    const isOk = await checkRateLimit({
        bucket: 'accounting:push',
        key: userId,
        max: 10,
        windowMs: 60 * 60 * 1000,
    });
    if (!isOk) {
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
            ciphertext: accountingCredential.ciphertext,
            id: accountingCredential.id,
            kind: accountingCredential.kind,
            meta: accountingCredential.meta,
        })
        .from(accountingCredential)
        .where(
            and(
                eq(accountingCredential.id, input.accountingCredentialId),
                eq(accountingCredential.userId, userId),
            ),
        )
        .limit(1);
    if (!row) {
        return NextResponse.json(
            { error: 'credential_not_found' },
            { status: 404 },
        );
    }
    const descriptor = CredentialRegistry.instance().get(row.kind);
    if (descriptor?.role !== CredentialRole.Accounting) {
        return NextResponse.json(
            { error: 'credential_not_accounting' },
            { status: 400 },
        );
    }
    if (row.ciphertext === null) {
        return NextResponse.json(
            { error: 'credential_missing_secret' },
            { status: 400 },
        );
    }
    const secret = await openSecret(row.ciphertext);
    await db
        .update(accountingCredential)
        .set({ lastUsedAt: new Date() })
        .where(eq(accountingCredential.id, row.id));

    const stream = runPush({
        accountingCredential: {
            id: row.id,
            kind: row.kind,
            meta: row.meta,
            secret,
        },
        runId: RunId(input.runId),
        userId,
    });

    return asSseResponse(stream);
}

export const runtime = 'nodejs';
export const maxDuration = 60;
