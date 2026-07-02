import { and, eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import type { BankAccount } from '~/lib/accounting/core/types';
import type {
    DecryptedCredential,
    FileCredential,
} from '~/lib/accounting/runner-types';

import { currencyCodeSchema } from '~/lib/accounting/core/currency';
import { type RuleSet } from '~/lib/accounting/core/rules/rule-set';
import { CredentialRegistry } from '~/lib/accounting/credentials/index';
import { loadRuleSet } from '~/lib/accounting/rules/load';
import { runPlan } from '~/lib/accounting/runner';
import { asSseResponse } from '~/lib/accounting/sse';
import { isRoot } from '~/lib/auth/roles';
import { getServerSession } from '~/lib/auth/server';
import { openSecret } from '~/lib/crypto/secrets';
import { captureError } from '~/lib/observability/logger';
import { checkRateLimit } from '~/lib/observability/rate-limit';
import { runPlanRequestSchema } from '~/lib/schemas/accounting';
import { accountingBankAccount, accountingCredential, db } from '~/server/db';

export async function POST(request: NextRequest) {
    const session = await getServerSession();
    if (!session?.user.id || !isRoot(session.user.role)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const userId = session.user.id;
    const isOk = await checkRateLimit({
        bucket: 'accounting:run',
        key: userId,
        max: 20,
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
            const descriptor = CredentialRegistry.instance().get(cred.kind);
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

    const fileInputs: { content: string; credential: FileCredential }[] = [];
    for (const file of input.files) {
        try {
            const credential = await loadFileCredential(
                file.credentialId,
                userId,
            );
            if (!credential) continue;
            const descriptor = CredentialRegistry.instance().get(
                credential.kind,
            );
            if (descriptor?.role === 'transactions') {
                fileInputs.push({ content: file.content, credential });
            }
        } catch (error) {
            captureError(error, {
                fields: { credentialId: file.credentialId },
                tag: 'accounting.run.loadFileCredential',
            });
        }
    }

    const { bankAccounts, ruleSet } = await loadRoutingConfig(
        input.accountingCredentialId,
        userId,
    );

    const stream = runPlan({
        accountingCredentialId: input.accountingCredentialId,
        apiCredentials,
        bankAccounts,
        fileInputs,
        ruleSet,
        startDate: input.startDate,
        userId,
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
    if (row.ciphertext === null) {
        throw new Error(`Credential "${row.id}" has no secret to open`);
    }
    const secret = await openSecret(row.ciphertext);
    return { id: row.id, kind: row.kind, meta: row.meta, secret };
}

async function loadFileCredential(
    id: string,
    userId: string,
): Promise<FileCredential | null> {
    const [row] = await db
        .select({
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
    return { id: row.id, kind: row.kind, meta: row.meta };
}

async function loadRoutingConfig(
    credentialId: string | undefined,
    userId: string,
): Promise<{ bankAccounts: BankAccount[]; ruleSet: RuleSet }> {
    if (!credentialId)
        return {
            bankAccounts: [],
            ruleSet: await loadRuleSet(undefined, userId),
        };
    const [ruleSet, bankRows] = await Promise.all([
        loadRuleSet(credentialId, userId),
        db
            .select()
            .from(accountingBankAccount)
            .where(
                and(
                    eq(accountingBankAccount.credentialId, credentialId),
                    eq(accountingBankAccount.userId, userId),
                ),
            ),
    ]);
    return {
        bankAccounts: bankRows.map((b) => ({
            currency: currencyCodeSchema.parse(b.currency),
            ledger: { id: b.ledgerId, label: b.ledgerLabel },
        })),
        ruleSet,
    };
}

export const runtime = 'nodejs';
export const maxDuration = 60;
