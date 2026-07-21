import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import 'server-only';
import { z } from 'zod';

import { LedgerId, RunId, UserId } from '~/lib/accounting/core/ids';
import { Rule } from '~/lib/accounting/core/rules/rule';
import { RuleSet } from '~/lib/accounting/core/rules/rule-set';
import { BOOKING_DIRECTIONS } from '~/lib/accounting/core/types';
import {
    CredentialRegistry,
    CredentialRole,
    MetaFieldType,
} from '~/lib/accounting/credentials/index';
import '~/lib/accounting/credentials/server';
import {
    getCredentialTest,
    getFieldOptionsLoader,
} from '~/lib/accounting/credentials/server';
import '~/lib/accounting/providers/index';
import { ProviderRegistry } from '~/lib/accounting/providers/provider';
import { loadRuleSet } from '~/lib/accounting/rules/load';
import { accountingRunRepo } from '~/lib/accounting/runs/repo';
import '~/lib/accounting/sources/index';
import {
    type ApiSource,
    SourceRegistry,
} from '~/lib/accounting/sources/source';
import { openSecret, sealSecret } from '~/lib/crypto/secrets';
import { captureError } from '~/lib/observability/logger';
import {
    bankAccountUpsertSchema,
    credentialCreateSchema,
    credentialIdSchema,
    credentialUpdateSchema,
    ledgerReferenceSchema,
    ruleBacktestSchema,
    ruleCreateSchema,
    ruleReorderSchema,
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
    secret: null | string;
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
    const secret =
        row.ciphertext === null ? null : await openSecret(row.ciphertext);
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
    const descriptor = CredentialRegistry.instance().get(input.kind);
    if (!descriptor) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Unknown credential kind "${input.kind}"`,
        });
    }
    const field = descriptor.metaFields.find((f) => f.key === input.fieldKey);
    if (field?.type !== MetaFieldType.Select) {
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
    const descriptor = CredentialRegistry.instance().get(cred.kind);
    if (!descriptor) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Unknown credential kind "${cred.kind}"`,
        });
    }
    if (
        descriptor.role !== CredentialRole.Accounting ||
        !descriptor.accountingProviderId
    ) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Credential "${descriptor.label}" cannot reach an accounting backend`,
        });
    }
    const provider = ProviderRegistry.instance().get(
        descriptor.accountingProviderId,
    );
    if (!provider) {
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Accounting provider "${descriptor.accountingProviderId}" not registered`,
        });
    }
    return { descriptor, provider };
}

function requireSecret(cred: LoadedCredential): string {
    if (cred.secret === null) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Credential kind "${cred.kind}" has no secret to use here`,
        });
    }
    return cred.secret;
}

function requireTransactionSource(cred: LoadedCredential): ApiSource {
    const descriptor = CredentialRegistry.instance().get(cred.kind);
    if (!descriptor) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Unknown credential kind "${cred.kind}"`,
        });
    }
    const source = descriptor.transactionSourceId
        ? SourceRegistry.instance().get(descriptor.transactionSourceId)
        : SourceRegistry.instance().findByCredentialKind(cred.kind);
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
                const descriptor = CredentialRegistry.instance().get(
                    input.kind,
                );
                if (!descriptor) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Unknown credential kind "${input.kind}"`,
                    });
                }
                const meta = descriptor.metaSchema.parse(input.meta);
                const ciphertext = input.secret
                    ? await sealSecret(input.secret)
                    : null;
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
                const role = CredentialRegistry.instance().get(cred.kind)?.role;
                if (!role) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: `Unknown credential kind "${cred.kind}"`,
                    });
                }
                const roleKinds = CredentialRegistry.instance()
                    .listByRole(role)
                    .map((d) => d.id);
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
                const descriptor = CredentialRegistry.instance().get(cred.kind);
                if (!descriptor) {
                    return {
                        detail: `Unknown credential kind "${cred.kind}"`,
                        latencyMs: 0,
                        ok: false as const,
                    };
                }
                const testFunction = getCredentialTest(cred.kind);
                if (!testFunction) {
                    return {
                        detail: `No test implementation for "${descriptor.label}"`,
                        latencyMs: 0,
                        ok: false as const,
                    };
                }
                if (cred.secret === null) {
                    return {
                        detail: `"${descriptor.label}" has no secret to test`,
                        latencyMs: 0,
                        ok: false as const,
                    };
                }
                const started = Date.now();
                try {
                    const result = await testFunction({
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
                    const descriptor = CredentialRegistry.instance().get(
                        row.kind,
                    );
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
        CredentialRegistry.instance()
            .list()
            .map((d) => ({
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
                    secret: requireSecret(cred),
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
                    secret: requireSecret(cred),
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
                    secret: requireSecret(cred),
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
                    dateFrom: z
                        .string()
                        .regex(/^\d{4}-\d{2}-\d{2}$/)
                        .optional(),
                    dateTo: z
                        .string()
                        .regex(/^\d{4}-\d{2}-\d{2}$/)
                        .optional(),
                    limit: z.number().int().min(1).max(2000).default(20),
                    offset: z.number().int().min(0).default(0),
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
                    secret: requireSecret(cred),
                });
                try {
                    return await session.listMutations({
                        dateFrom: input.dateFrom,
                        dateTo: input.dateTo,
                        limit: input.limit,
                        offset: input.offset,
                    });
                } finally {
                    await session.close().catch(noop);
                }
            }),
    }),

    rules: createTRPCRouter({
        backtest: rootProcedure
            .input(ruleBacktestSchema)
            .query(async ({ ctx, input }) => {
                const cred = await loadCredentialOrThrow(
                    input.credentialId,
                    ctx.userId,
                );
                const source = requireTransactionSource(cred);
                const txns = await source.fetch({
                    from: input.from,
                    meta: cred.meta,
                    secret: requireSecret(cred),
                    to: input.to,
                });
                const candidate = new RuleSet([
                    Rule.fromRow({
                        currency: input.currency,
                        dateFrom: input.dateFrom,
                        dateTo: input.dateTo,
                        direction: input.direction,
                        display: 'backtest',
                        id: 'backtest',
                        ledger: { id: LedgerId(''), label: '' },
                        match: input.match,
                        matchType: input.matchType,
                        maxAmount: input.maxAmount,
                        minAmount: input.minAmount,
                        taxCode: 'backtest',
                    }),
                ]);
                const matched = txns.filter(
                    (tx) => candidate.findMatch(tx) !== null,
                );
                const totalByCurrency: Record<string, number> = {};
                for (const tx of matched) {
                    totalByCurrency[tx.sourceCurrency] =
                        (totalByCurrency[tx.sourceCurrency] ?? 0) +
                        Math.abs(tx.sourceAmount);
                }
                return {
                    matchCount: matched.length,
                    sample: matched.slice(0, 5),
                    totalByCurrency,
                    transactionCount: txns.length,
                };
            }),
        create: rootProcedure
            .input(ruleCreateSchema)
            .mutation(async ({ ctx, input }) => {
                await loadCredentialOrThrow(input.credentialId, ctx.userId);
                const existing = await ctx.db
                    .select({ id: accountingRule.id })
                    .from(accountingRule)
                    .where(eq(accountingRule.credentialId, input.credentialId));
                const [row] = await ctx.db
                    .insert(accountingRule)
                    .values({
                        credentialId: input.credentialId,
                        currency: input.currency,
                        dateFrom: input.dateFrom,
                        dateTo: input.dateTo,
                        direction: input.direction,
                        display: input.display,
                        ledgerId: input.ledger.id,
                        ledgerLabel: input.ledger.label,
                        match: input.match,
                        matchType: input.matchType ?? 'contains',
                        maxAmount: input.maxAmount,
                        minAmount: input.minAmount,
                        sortOrder: existing.length,
                        userId: ctx.userId,
                        vatCode: input.taxCode,
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
                    .orderBy(asc(accountingRule.sortOrder));
                return rows.map((r) => ({
                    currency: r.currency,
                    dateFrom: r.dateFrom,
                    dateTo: r.dateTo,
                    direction: r.direction,
                    display: r.display,
                    id: r.id,
                    ledger: { id: r.ledgerId, label: r.ledgerLabel },
                    match: r.match,
                    matchType: r.matchType,
                    maxAmount: r.maxAmount,
                    minAmount: r.minAmount,
                    sortOrder: r.sortOrder,
                    taxCode: r.vatCode,
                }));
            }),
        reorder: rootProcedure
            .input(ruleReorderSchema)
            .mutation(async ({ ctx, input }) => {
                await ctx.db.transaction(async (tx) => {
                    for (const [index, id] of input.orderedIds.entries()) {
                        await tx
                            .update(accountingRule)
                            .set({ sortOrder: index, updatedAt: new Date() })
                            .where(
                                and(
                                    eq(accountingRule.id, id),
                                    eq(
                                        accountingRule.credentialId,
                                        input.credentialId,
                                    ),
                                    eq(accountingRule.userId, ctx.userId),
                                ),
                            );
                    }
                });
                return { ok: true };
            }),
        update: rootProcedure
            .input(ruleUpdateSchema)
            .mutation(async ({ ctx, input }) => {
                const patch: Record<string, unknown> = {
                    updatedAt: new Date(),
                };
                if (input.currency !== undefined)
                    patch.currency = input.currency;
                if (input.dateFrom !== undefined)
                    patch.dateFrom = input.dateFrom;
                if (input.dateTo !== undefined) patch.dateTo = input.dateTo;
                if (input.direction !== undefined)
                    patch.direction = input.direction;
                if (input.display !== undefined) patch.display = input.display;
                if (input.ledger !== undefined) {
                    patch.ledgerId = input.ledger.id;
                    patch.ledgerLabel = input.ledger.label;
                }
                if (input.match !== undefined) patch.match = input.match;
                if (input.matchType !== undefined)
                    patch.matchType = input.matchType;
                if (input.maxAmount !== undefined)
                    patch.maxAmount = input.maxAmount;
                if (input.minAmount !== undefined)
                    patch.minAmount = input.minAmount;
                if (input.taxCode !== undefined) patch.vatCode = input.taxCode;
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

    runs: createTRPCRouter({
        get: rootProcedure
            .input(z.object({ id: z.uuid() }))
            .query(async ({ ctx, input }) => {
                const run = await accountingRunRepo.get(
                    RunId(input.id),
                    UserId(ctx.userId),
                );
                if (!run) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'Run not found',
                    });
                }
                return run;
            }),
        list: rootProcedure
            .input(
                z.object({
                    limit: z.number().int().min(1).max(100).default(20),
                    offset: z.number().int().min(0).default(0),
                }),
            )
            .query(async ({ ctx, input }) => {
                const runs = await accountingRunRepo.list(UserId(ctx.userId), {
                    limit: input.limit,
                    offset: input.offset,
                });
                return runs.map((r) => ({
                    accountingCredentialId: r.accountingCredentialId,
                    createdAt: r.createdAt,
                    id: r.id,
                    startDate: r.startDate,
                    status: r.status,
                    summary: r.summary,
                }));
            }),
        updateBooking: rootProcedure
            .input(
                z.object({
                    patch: z.object({
                        counterpartLedger: ledgerReferenceSchema.optional(),
                        counterpartName: z.string().min(1).optional(),
                        direction: z.enum(BOOKING_DIRECTIONS).optional(),
                        isRefund: z.boolean().optional(),
                        taxCode: z.string().min(1).max(32).optional(),
                    }),
                    runId: z.uuid(),
                    txnId: z.string().min(1),
                }),
            )
            .mutation(async ({ ctx, input }) => {
                try {
                    await accountingRunRepo.updateBooking(
                        RunId(input.runId),
                        UserId(ctx.userId),
                        input.txnId,
                        input.patch,
                    );
                } catch (error) {
                    throw new TRPCError({
                        cause: error,
                        code: 'BAD_REQUEST',
                        message:
                            error instanceof Error
                                ? error.message
                                : 'Could not update booking',
                    });
                }
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

    taxCodes: createTRPCRouter({
        list: rootProcedure
            .input(z.object({ credentialId: z.uuid() }))
            .query(async ({ ctx, input }) => {
                const cred = await loadCredentialOrThrow(
                    input.credentialId,
                    ctx.userId,
                );
                const { provider } = requireAccountingSession(cred);
                const session = await provider.openSession({
                    meta: cred.meta,
                    secret: requireSecret(cred),
                });
                try {
                    const catalog = await session.taxCodes();
                    return catalog.list().map((opt) => ({
                        code: opt.code.toString(),
                        label: opt.label,
                    }));
                } finally {
                    await session.close().catch(noop);
                }
            }),
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
                const [txns, ruleSet] = await Promise.all([
                    source.fetch({
                        from: input.from,
                        meta: cred.meta,
                        secret: requireSecret(cred),
                        to: input.to,
                    }),
                    loadRuleSet(input.accountingCredentialId, ctx.userId),
                ]);
                return txns.map((tx) => ({
                    ...tx,
                    match: ruleSet.classify(tx),
                }));
            }),
    }),
});
