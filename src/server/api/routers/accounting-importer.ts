import 'server-only';

import '~/lib/accounting-importer/credentials/server';
import '~/lib/accounting-importer/providers/index';
import '~/lib/accounting-importer/sources/index';
import { TRPCError } from '@trpc/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import {
    getCredentialDescriptor,
    listCredentialDescriptors,
} from '~/lib/accounting-importer/credentials/index';
import {
    getCredentialTest,
    getFieldOptionsLoader,
} from '~/lib/accounting-importer/credentials/server';
import { getProvider } from '~/lib/accounting-importer/providers/provider';
import { openSecret, sealSecret } from '~/lib/crypto/secrets';
import { captureError } from '~/lib/observability/logger';
import {
    credentialCreateSchema,
    credentialIdSchema,
    credentialUpdateSchema,
} from '~/lib/schemas/accounting-importer';
import { createTRPCRouter, rootProcedure } from '~/server/api/trpc';
import { accountingImporterCredential, db } from '~/server/db';

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
        .from(accountingImporterCredential)
        .where(
            and(
                eq(accountingImporterCredential.id, id),
                eq(accountingImporterCredential.userId, userId),
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
            tag: 'accounting-importer.fieldOptions.load',
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

export const accountingImporterRouter = createTRPCRouter({
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
                    .insert(accountingImporterCredential)
                    .values({
                        ciphertext,
                        kind: input.kind,
                        label: input.label,
                        meta,
                        userId: ctx.userId,
                    })
                    .returning({ id: accountingImporterCredential.id });
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
                    .delete(accountingImporterCredential)
                    .where(
                        and(
                            eq(accountingImporterCredential.id, input.id),
                            eq(accountingImporterCredential.userId, ctx.userId),
                        ),
                    );
                return { ok: true };
            }),
        list: rootProcedure.query(async ({ ctx }) => {
            const rows = await ctx.db
                .select({
                    createdAt: accountingImporterCredential.createdAt,
                    id: accountingImporterCredential.id,
                    kind: accountingImporterCredential.kind,
                    label: accountingImporterCredential.label,
                    lastUsedAt: accountingImporterCredential.lastUsedAt,
                    meta: accountingImporterCredential.meta,
                    updatedAt: accountingImporterCredential.updatedAt,
                })
                .from(accountingImporterCredential)
                .where(eq(accountingImporterCredential.userId, ctx.userId))
                .orderBy(
                    asc(accountingImporterCredential.kind),
                    asc(accountingImporterCredential.label),
                );
            return rows;
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
                            .update(accountingImporterCredential)
                            .set({ lastUsedAt: new Date() })
                            .where(
                                eq(accountingImporterCredential.id, input.id),
                            );
                    }
                    return {
                        detail: result.detail,
                        latencyMs: Date.now() - started,
                        ok: result.ok,
                    };
                } catch (error) {
                    captureError(error, {
                        fields: { credentialId: input.id, kind: cred.kind },
                        tag: 'accounting-importer.credential.test',
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
                            kind: accountingImporterCredential.kind,
                        })
                        .from(accountingImporterCredential)
                        .where(
                            and(
                                eq(accountingImporterCredential.id, input.id),
                                eq(
                                    accountingImporterCredential.userId,
                                    ctx.userId,
                                ),
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
                    .update(accountingImporterCredential)
                    .set(patch)
                    .where(
                        and(
                            eq(accountingImporterCredential.id, input.id),
                            eq(accountingImporterCredential.userId, ctx.userId),
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

    summary: rootProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db
            .select({ kind: accountingImporterCredential.kind })
            .from(accountingImporterCredential)
            .where(eq(accountingImporterCredential.userId, ctx.userId));
        const counts: Record<string, number> = {};
        for (const row of rows) {
            counts[row.kind] = (counts[row.kind] ?? 0) + 1;
        }
        return counts;
    }),
});
