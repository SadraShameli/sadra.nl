import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import type { BookingRule } from '~/lib/accounting/core/types';

import { classifyTransaction } from '~/lib/accounting/core/orchestrator';
import {
    getCredentialDescriptor,
    listCredentialDescriptors,
    listCredentialDescriptorsByRole,
} from '~/lib/accounting/credentials/index';
import '~/lib/accounting/credentials/server';
import {
    getCredentialTest,
    getFieldOptionsLoader,
} from '~/lib/accounting/credentials/server';
import '~/lib/accounting/providers/index';
import { getProvider } from '~/lib/accounting/providers/provider';
import '~/lib/accounting/sources/index';
import {
    type ApiSource,
    findApiSourceByCredentialKind,
    getSource,
} from '~/lib/accounting/sources/source';
import { openSecret, sealSecret } from '~/lib/crypto/secrets';
import { captureError } from '~/lib/observability/logger';
import {
    bankAccountUpsertSchema,
    credentialCreateSchema,
    credentialIdSchema,
    credentialUpdateSchema,
    ruleCreateSchema,
    ruleUpdateSchema,
} from '~/lib/schemas/accounting';
import { createTRPCRouter, rootProcedure } from '~/server/api/trpc';
import {
    accountingBankAccount,
    accountingCredential,
    accountingRule,
    db,
} from '~/server/db';

const noop = (): void => undefined;

interface LoadedCredential {
    kind: string;
    label: string;
    meta: Record<string, unknown>;
    secret: string;
}

async function loadCredentialOrThrow(
    id: string,
    userId: string,
): Promise<LoadedCredential> {
    const [row] = await db
        .select()
        .from(accountingCredential)
        .where(
            and(
                eq(accountingCredential.id, id),
                eq(accountingCredential.userId, userId),
            ),
        )
        .limit(1);
    if (!row) {
        throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Credential not found',
        });
    }
    const secret = await openSecret(row.ciphertext);
    return {
        kind: row.kind,
        label: row.label,
        meta: row.meta,
        secret,
    };
}

async function loadFieldOptions(input: {
    fieldKey: string;
    kind: string;
    meta: Record<string, unknown>;
    secret: string;
}): Promise<{
    options: { description?: string; label: string; value: string }[];
}> {
    const descriptor = getCredentialDescriptor(input.kind);
    if (!descriptor) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Unknown credential kind "${input.kind}"`,
        });
    }
    const field = descriptor.metaFields.find((f) => f.key === input.fieldKey);
    if (field?.type !== 'select') {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Field "${input.fieldKey}" is not a select on ${descriptor.label}`,
        });
    }
    const loader = getFieldOptionsLoader(input.kind, input.fieldKey);
    if (!loader) {
        throw new TRPCError({
            code: 'NOT_IMPLEMENTED',
            message: `No options loader registered for ${descriptor.label}.${field.key}`,
        });
    }
    try {
        const options = await loader({
            meta: input.meta,
            secret: input.secret,
        });
        return { options };
    } catch (error) {
        captureError(error, {
            fields: { fieldKey: input.fieldKey, kind: input.kind },
            tag: 'accounting.fieldOptions.load',
        });
        throw new TRPCError({
            cause: error,
            code: 'BAD_REQUEST',
            message:
                error instanceof Error
                    ? error.message
                    : 'Could not load options',
        });
    }
}

function requireAccountingSession(cred: LoadedCredential) {
    const descriptor = getCredentialDescriptor(cred.kind);
    if (!descriptor) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Unknown credential kind "${cred.kind}"`,
        });
    }
    if (descriptor.role !== 'accounting' || !descriptor.accountingProviderId) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Credential "${descriptor.label}" cannot reach an accounting backend`,
        });
    }
    const provider = getProvider(descriptor.accountingProviderId);
    if (!provider) {
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Accounting provider "${descriptor.accountingProviderId}" not registered`,
        });
    }
    return { descriptor, provider };
}

function requireTransactionSource(cred: LoadedCredential): ApiSource {
    const descriptor = getCredentialDescriptor(cred.kind);
    if (!descriptor) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Unknown credential kind "${cred.kind}"`,
        });
    }
    const source = descriptor.transactionSourceId
        ? getSource(descriptor.transactionSourceId)
        : findApiSourceByCredentialKind(cred.kind);
    if (source?.kind !== 'api') {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Credential "${descriptor.label}" has no transaction source`,
        });
    }
    return source;
}

export const accountingRouter = createTRPCRouter({
    bankAccounts: createTRPCRouter({
        delete: rootProcedure
            .input(z.object({ id: z.uuid() }))
            .mutation(async ({ ctx, input }) => {
                await ctx.db
                    .delete(accountingBankAccount)
                    .where(
                        and(
                            eq(accountingBankAccount.id, input.id),
                            eq(accountingBankAccount.userId, ctx.userId),
                        ),
                    );
                return { ok: true };
            }),
        list: rootProcedure
            .input(z.object({ credentialId: z.uuid() }))
            .query(async ({ ctx, input }) => {
                const rows = await ctx.db
                    .select()
                    .from(accountingBankAccount)
                    .where(
                        and(
                            eq(
                                accountingBankAccount.credentialId,
                                input.credentialId,
                            ),
                            eq(accountingBankAccount.userId, ctx.userId),
                        ),
                    )
                    .orderBy(asc(accountingBankAccount.currency));
                return rows.map((r) => ({
                    currency: r.currency,
                    id: r.id,
                    ledger: { id: r.ledgerId, label: r.ledgerLabel },
                }));
            }),
        upsert: rootProcedure
            .input(bankAccountUpsertSchema)
            .mutation(async ({ ctx, input }) => {
                await loadCredentialOrThrow(input.credentialId, ctx.userId);
                const q = ctx.db
                    .insert(accountingBankAccount)
                    .values({
                        credentialId: input.credentialId,
                        currency: input.currency,
                        ledgerId: input.ledger.id,
                        ledgerLabel: input.ledger.label,
                        userId: ctx.userId,
                    })
                    .onConflictDoUpdate({
                        set: {
                            ledgerId: input.ledger.id,
                            ledgerLabel: input.ledger.label,
                            updatedAt: new Date(),
                        },
                        target: [
                            accountingBankAccount.userId,
                            accountingBankAccount.credentialId,
                            accountingBankAccount.currency,
                        ],
                    });
                await q;
                return { ok: true };
            }),
    }),

    credentials: createTRPCRouter({
        create: rootProcedure
            .input(credentialCreateSchema)
            .mutation(async ({ ctx, input }) => {
                const descriptor = getCredentialDescriptor(input.kind);
                if (!descriptor) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Unknown credential kind "${input.kind}"`,
                    });
                }
                const meta = descriptor.metaSchema.parse(input.meta);
                const ciphertext = await sealSecret(input.secret);
                const [row] = await ctx.db
                    .insert(accountingCredential)
                    .values({
                        ciphertext,
                        kind: input.kind,
                        label: input.label,
                        meta,
                        userId: ctx.userId,
                    })
                    .returning({ id: accountingCredential.id });
                if (!row) {
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Could not save credential',
                    });
                }
                return { id: row.id };
            }),
        delete: rootProcedure
            .input(credentialIdSchema)
            .mutation(async ({ ctx, input }) => {
                await ctx.db
                    .delete(accountingCredential)
                    .where(
                        and(
                            eq(accountingCredential.id, input.id),
                            eq(accountingCredential.userId, ctx.userId),
                        ),
                    );
                return { ok: true };
            }),
        list: rootProcedure.query(async ({ ctx }) => {
            const rows = await ctx.db
                .select({
                    createdAt: accountingCredential.createdAt,
                    id: accountingCredential.id,
                    isActive: accountingCredential.isActive,
                    kind: accountingCredential.kind,
                    label: accountingCredential.label,
                    lastUsedAt: accountingCredential.lastUsedAt,
                    meta: accountingCredential.meta,
                    updatedAt: accountingCredential.updatedAt,
                })
                .from(accountingCredential)
                .where(eq(accountingCredential.userId, ctx.userId))
                .orderBy(
                    asc(accountingCredential.kind),
                    asc(accountingCredential.label),
                );
            return rows;
        }),
        setActive: rootProcedure
            .input(credentialIdSchema)
            .mutation(async ({ ctx, input }) => {
                const cred = await loadCredentialOrThrow(input.id, ctx.userId);
                const role = getCredentialDescriptor(cred.kind)?.role;
                if (!role) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Unknown credential kind "${cred.kind}"`,
                    });
                }
                const roleKinds = listCredentialDescriptorsByRole(role).map(
                    (d) => d.id,
                );
                await ctx.db.transaction(async (tx) => {
                    await tx
                        .update(accountingCredential)
                        .set({ isActive: false })
                        .where(
                            and(
                                eq(accountingCredential.userId, ctx.userId),
                                inArray(accountingCredential.kind, roleKinds),
                            ),
                        );
                    await tx
                        .update(accountingCredential)
                        .set({ isActive: true })
                        .where(
                            and(
                                eq(accountingCredential.id, input.id),
                                eq(accountingCredential.userId, ctx.userId),
                            ),
                        );
                });
                return { ok: true };
            }),
        test: rootProcedure
            .input(credentialIdSchema)
            .mutation(async ({ ctx, input }) => {
                const cred = await loadCredentialOrThrow(input.id, ctx.userId);
                const descriptor = getCredentialDescriptor(cred.kind);
                if (!descriptor) {
                    return {
                        detail: `Unknown credential kind "${cred.kind}"`,
                        latencyMs: 0,
                        ok: false as const,
                    };
                }
                const testFn = getCredentialTest(cred.kind);
                if (!testFn) {
                    return {
                        detail: `No test implementation for "${descriptor.label}"`,
                        latencyMs: 0,
                        ok: false as const,
                    };
                }
                const started = Date.now();
                try {
                    const result = await testFn({
                        meta: cred.meta,
                        secret: cred.secret,
                    });
                    if (result.ok) {
                        await ctx.db
                            .update(accountingCredential)
                            .set({ lastUsedAt: new Date() })
                            .where(eq(accountingCredential.id, input.id));
                    }
                    return {
                        detail: result.detail,
                        latencyMs: Date.now() - started,
                        ok: result.ok,
                    };
                } catch (error) {
                    captureError(error, {
                        fields: { credentialId: input.id, kind: cred.kind },
                        tag: 'accounting.credential.test',
                    });
                    return {
                        detail:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        latencyMs: Date.now() - started,
                        ok: false as const,
                    };
                }
            }),
        update: rootProcedure
            .input(credentialUpdateSchema)
            .mutation(async ({ ctx, input }) => {
                const patch: Record<string, unknown> = {
                    updatedAt: new Date(),
                };
                if (input.label !== undefined) patch.label = input.label;
                if (input.meta !== undefined) {
                    const [row] = await ctx.db
                        .select({
                            kind: accountingCredential.kind,
                        })
                        .from(accountingCredential)
                        .where(
                            and(
                                eq(accountingCredential.id, input.id),
                                eq(accountingCredential.userId, ctx.userId),
                            ),
                        )
                        .limit(1);
                    if (!row) {
                        throw new TRPCError({
                            code: 'NOT_FOUND',
                            message: 'Credential not found',
                        });
                    }
                    const descriptor = getCredentialDescriptor(row.kind);
                    patch.meta = descriptor
                        ? descriptor.metaSchema.parse(input.meta)
                        : input.meta;
                }
                if (input.secret !== undefined) {
                    patch.ciphertext = await sealSecret(input.secret);
                }
                await ctx.db
                    .update(accountingCredential)
                    .set(patch)
                    .where(
                        and(
                            eq(accountingCredential.id, input.id),
                            eq(accountingCredential.userId, ctx.userId),
                        ),
                    );
                return { ok: true };
            }),
    }),

    descriptors: rootProcedure.query(() =>
        listCredentialDescriptors().map((d) => ({
            accountingProviderId: d.accountingProviderId ?? null,
            description: d.description ?? null,
            id: d.id,
            label: d.label,
            metaFields: d.metaFields,
            role: d.role,
            secret: d.secret,
            tone: d.tone,
            transactionSourceId: d.transactionSourceId ?? null,
        })),
    ),

    fieldOptions: createTRPCRouter({
        load: rootProcedure
            .input(
                z.object({
                    fieldKey: z.string().min(1).max(64),
                    kind: z.string().min(1).max(32),
                    meta: z.record(z.string(), z.unknown()).default({}),
                    secret: z.string().min(1),
                }),
            )
            .mutation(async ({ input }) => {
                return loadFieldOptions({
                    fieldKey: input.fieldKey,
                    kind: input.kind,
                    meta: input.meta,
                    secret: input.secret,
                });
            }),
        loadForCredential: rootProcedure
            .input(
                z.object({
                    credentialId: z.uuid(),
                    fieldKey: z.string().min(1).max(64),
                    metaOverride: z.record(z.string(), z.unknown()).optional(),
                }),
            )
            .mutation(async ({ ctx, input }) => {
                const cred = await loadCredentialOrThrow(
                    input.credentialId,
                    ctx.userId,
                );
                return loadFieldOptions({
                    fieldKey: input.fieldKey,
                    kind: cred.kind,
                    meta: { ...cred.meta, ...input.metaOverride },
                    secret: cred.secret,
                });
            }),
    }),

    ledgers: createTRPCRouter({
        list: rootProcedure
            .input(
                z.object({
                    category: z.string().min(1).max(16).optional(),
                    credentialId: z.uuid(),
                }),
            )
            .query(async ({ ctx, input }) => {
                const cred = await loadCredentialOrThrow(
                    input.credentialId,
                    ctx.userId,
                );
                const { provider } = requireAccountingSession(cred);
                const session = await provider.openSession({
                    meta: cred.meta,
                    secret: cred.secret,
                });
                try {
                    return await session.listLedgers({
                        category: input.category,
                    });
                } finally {
                    await session.close().catch(noop);
                }
            }),
    }),

    mutations: createTRPCRouter({
        latestDate: rootProcedure
            .input(z.object({ credentialId: z.uuid() }))
            .query(async ({ ctx, input }) => {
                const cred = await loadCredentialOrThrow(
                    input.credentialId,
                    ctx.userId,
                );
                const { provider } = requireAccountingSession(cred);
                const session = await provider.openSession({
                    meta: cred.meta,
                    secret: cred.secret,
                });
                try {
                    return await session.latestMutationDate();
                } finally {
                    await session.close().catch(noop);
                }
            }),

        list: rootProcedure
            .input(
                z.object({
                    credentialId: z.uuid(),
                    limit: z.number().int().min(1).max(2000).default(20),
                }),
            )
            .query(async ({ ctx, input }) => {
                const cred = await loadCredentialOrThrow(
                    input.credentialId,
                    ctx.userId,
                );
                const { provider } = requireAccountingSession(cred);
                const session = await provider.openSession({
                    meta: cred.meta,
                    secret: cred.secret,
                });
                try {
                    return await session.listMutations({
                        limit: input.limit,
                    });
                } finally {
                    await session.close().catch(noop);
                }
            }),
    }),

    rules: createTRPCRouter({
        create: rootProcedure
            .input(ruleCreateSchema)
            .mutation(async ({ ctx, input }) => {
                await loadCredentialOrThrow(input.credentialId, ctx.userId);
                const [row] = await ctx.db
                    .insert(accountingRule)
                    .values({
                        credentialId: input.credentialId,
                        direction: input.direction,
                        display: input.display,
                        ledgerId: input.ledger.id,
                        ledgerLabel: input.ledger.label,
                        match: input.match,
                        userId: ctx.userId,
                        vatCode: input.vatCode,
                    })
                    .returning({ id: accountingRule.id });
                if (!row) {
                    throw new TRPCError({
                        code: 'INTERNAL_SERVER_ERROR',
                        message: 'Could not create rule',
                    });
                }
                return { id: row.id };
            }),
        delete: rootProcedure
            .input(z.object({ id: z.uuid() }))
            .mutation(async ({ ctx, input }) => {
                await ctx.db
                    .delete(accountingRule)
                    .where(
                        and(
                            eq(accountingRule.id, input.id),
                            eq(accountingRule.userId, ctx.userId),
                        ),
                    );
                return { ok: true };
            }),
        list: rootProcedure
            .input(z.object({ credentialId: z.uuid() }))
            .query(async ({ ctx, input }) => {
                const rows = await ctx.db
                    .select()
                    .from(accountingRule)
                    .where(
                        and(
                            eq(accountingRule.credentialId, input.credentialId),
                            eq(accountingRule.userId, ctx.userId),
                        ),
                    )
                    .orderBy(asc(accountingRule.createdAt));
                return rows.map((r) => ({
                    direction: r.direction,
                    display: r.display,
                    id: r.id,
                    ledger: { id: r.ledgerId, label: r.ledgerLabel },
                    match: r.match,
                    vatCode: r.vatCode,
                }));
            }),
        update: rootProcedure
            .input(ruleUpdateSchema)
            .mutation(async ({ ctx, input }) => {
                const patch: Record<string, unknown> = {
                    updatedAt: new Date(),
                };
                if (input.direction !== undefined)
                    patch.direction = input.direction;
                if (input.display !== undefined) patch.display = input.display;
                if (input.ledger !== undefined) {
                    patch.ledgerId = input.ledger.id;
                    patch.ledgerLabel = input.ledger.label;
                }
                if (input.match !== undefined) patch.match = input.match;
                if (input.vatCode !== undefined) patch.vatCode = input.vatCode;
                await ctx.db
                    .update(accountingRule)
                    .set(patch)
                    .where(
                        and(
                            eq(accountingRule.id, input.id),
                            eq(accountingRule.userId, ctx.userId),
                        ),
                    );
                return { ok: true };
            }),
    }),

    summary: rootProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select({ kind: accountingCredential.kind })
            .from(accountingCredential)
            .where(eq(accountingCredential.userId, ctx.userId));
        const counts: Record<string, number> = {};
        for (const row of rows) {
            counts[row.kind] = (counts[row.kind] ?? 0) + 1;
        }
        return counts;
    }),

    transactions: createTRPCRouter({
        list: rootProcedure
            .input(
                z.object({
                    accountingCredentialId: z.uuid().optional(),
                    credentialId: z.uuid(),
                    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                }),
            )
            .query(async ({ ctx, input }) => {
                const cred = await loadCredentialOrThrow(
                    input.credentialId,
                    ctx.userId,
                );
                const source = requireTransactionSource(cred);
                const [txns, rules] = await Promise.all([
                    source.fetch({
                        from: input.from,
                        meta: cred.meta,
                        secret: cred.secret,
                        to: input.to,
                    }),
                    loadRules(input.accountingCredentialId, ctx.userId),
                ]);
                return txns.map((tx) => ({
                    ...tx,
                    match: classifyTransaction(tx, rules),
                }));
            }),
    }),
});

async function loadRules(
    credentialId: string | undefined,
    userId: string,
): Promise<BookingRule[]> {
    if (!credentialId) return [];
    const rows = await db
        .select()
        .from(accountingRule)
        .where(
            and(
                eq(accountingRule.credentialId, credentialId),
                eq(accountingRule.userId, userId),
            ),
        );
    return rows.map((r) => ({
        direction: r.direction,
        display: r.display,
        id: r.id,
        ledger: { id: r.ledgerId, label: r.ledgerLabel },
        match: r.match,
        vatCode: r.vatCode,
    }));
}
