import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getCredentialDescriptor } from '~/lib/accounting/credentials/index';
import { type DecryptedCredential, runPlan } from '~/lib/accounting/runner';
import { asSseResponse } from '~/lib/accounting/sse';
import { isRoot } from '~/lib/auth/roles';
import { getServerSession } from '~/lib/auth/server';
import { openSecret } from '~/lib/crypto/secrets';
import { captureError } from '~/lib/observability/logger';
import { checkRateLimit } from '~/lib/observability/rate-limit';
import { runPlanRequestSchema } from '~/lib/schemas/accounting';
import { accountingCredential, db } from '~/server/db';

export async function POST(request: NextRequest) {
    const session = await getServerSession();
    if (!session?.user.id || !isRoot(session.user.role)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const userId = session.user.id;
    const ok = await checkRateLimit({
        bucket: 'accounting:run',
        key: userId,
        max: 20,
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
    const parsed = runPlanRequestSchema.safeParse(body);
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

    const apiCredentials: DecryptedCredential[] = [];
    for (const credentialId of input.apiCredentialIds) {
        try {
            const cred = await loadCredential(credentialId, userId);
            if (!cred) continue;
            const descriptor = getCredentialDescriptor(cred.kind);
            if (descriptor?.role === 'transactions') {
                apiCredentials.push(cred);
            }
        } catch (error) {
            captureError(error, {
                fields: { credentialId },
                tag: 'accounting.run.loadCredential',
            });
        }
    }

    const stream = runPlan({
        apiCredentials,
        startDate: input.startDate,
        uploadedTransactions: input.uploadedTransactions,
    });

    return asSseResponse(stream);
}

async function loadCredential(
    id: string,
    userId: string,
): Promise<DecryptedCredential | null> {
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
                eq(accountingCredential.id, id),
                eq(accountingCredential.userId, userId),
            ),
        )
        .limit(1);
    if (!row) return null;
    const secret = await openSecret(row.ciphertext);
    return { id: row.id, kind: row.kind, meta: row.meta, secret };
}

export const runtime = 'nodejs';
export const maxDuration = 60;
