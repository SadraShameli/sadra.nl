import 'server-only';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import type { ProgramSchedule } from '~/lib/lifting/types';

import {
    enrollProgramInputSchema,
    exerciseSlugActionSchema,
    idActionSchema,
    programCategorySchema,
    updateUserProgramInputSchema,
} from '~/lib/lifting/schemas';
import { USER_PROGRAM_STATUS } from '~/lib/lifting/types';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { db, liftingProgram, liftingUserProgram } from '~/server/db';

const loadOfficialPrograms = async () => {
    return db
        .select()
        .from(liftingProgram)
        .where(
            and(
                eq(liftingProgram.isOfficial, true),
                isNull(liftingProgram.ownerId),
            ),
        )
        .orderBy(asc(liftingProgram.name));
};

const customProgramInputSchema = z.object({
    category: programCategorySchema,
    daysPerWeek: z.number().int().min(1).max(7),
    description: z.string().max(2000).optional(),
    lengthWeeks: z.number().int().min(1).max(52),
    name: z.string().trim().min(1).max(128),
    schedule: z.custom<ProgramSchedule>(),
});

export const liftingProgramRouter = createTRPCRouter({
    advance: protectedProcedure
        .input(idActionSchema)
        .mutation(async ({ ctx, input }) => {
            const enrollment = await ctx.db.query.liftingUserProgram.findFirst({
                where: (u, { and: a, eq: equals }) =>
                    a(equals(u.id, input.id), equals(u.userId, ctx.userId)),
                with: { program: true },
            });
            if (!enrollment) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Enrollment not found',
                });
            }
            const week =
                enrollment.program.schedule.weeks[enrollment.currentWeek - 1];
            if (!week) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Invalid program week',
                });
            }
            let nextDay = enrollment.currentDay + 1;
            let nextWeek = enrollment.currentWeek;
            let status = enrollment.status;
            if (nextDay > week.days.length) {
                nextDay = 1;
                nextWeek += 1;
            }
            if (nextWeek > enrollment.program.schedule.weeks.length) {
                status = USER_PROGRAM_STATUS.COMPLETED;
                nextWeek = enrollment.program.schedule.weeks.length;
                const finalWeek =
                    enrollment.program.schedule.weeks[nextWeek - 1];
                nextDay = finalWeek?.days.length ?? 1;
            }
            await ctx.db
                .update(liftingUserProgram)
                .set({
                    currentDay: nextDay,
                    currentWeek: nextWeek,
                    status,
                    updatedAt: new Date(),
                })
                .where(eq(liftingUserProgram.id, input.id));
            return { currentDay: nextDay, currentWeek: nextWeek, status };
        }),

    cloneToCustom: protectedProcedure
        .input(idActionSchema)
        .mutation(async ({ ctx, input }) => {
            const program = await ctx.db.query.liftingProgram.findFirst({
                where: (p, { eq: equals }) => equals(p.id, input.id),
            });
            if (!program) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Program not found',
                });
            }
            const slug = `${program.slug}-copy-${Date.now().toString(36)}`;
            const [row] = await ctx.db
                .insert(liftingProgram)
                .values({
                    category: program.category,
                    daysPerWeek: program.daysPerWeek,
                    description: program.description,
                    isOfficial: false,
                    isPublic: false,
                    lengthWeeks: program.lengthWeeks,
                    name: `${program.name} (copy)`,
                    ownerId: ctx.userId,
                    schedule: program.schedule,
                    slug,
                })
                .returning({
                    id: liftingProgram.id,
                    slug: liftingProgram.slug,
                });
            if (!row) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not clone program',
                });
            }
            return row;
        }),

    createCustom: protectedProcedure
        .input(customProgramInputSchema)
        .mutation(async ({ ctx, input }) => {
            const baseSlug = input.name
                .toLowerCase()
                .replaceAll(/[^a-z0-9]+/g, '-')
                .replaceAll(/^-+|-+$/g, '')
                .slice(0, 80);
            const slug = `${baseSlug || 'program'}-${Date.now().toString(36)}`;
            const [row] = await ctx.db
                .insert(liftingProgram)
                .values({
                    category: input.category,
                    daysPerWeek: input.daysPerWeek,
                    description: input.description ?? null,
                    isOfficial: false,
                    isPublic: false,
                    lengthWeeks: input.lengthWeeks,
                    name: input.name,
                    ownerId: ctx.userId,
                    schedule: input.schedule,
                    slug,
                })
                .returning({
                    id: liftingProgram.id,
                    slug: liftingProgram.slug,
                });
            if (!row) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not create program',
                });
            }
            return row;
        }),

    deleteCustom: protectedProcedure
        .input(idActionSchema)
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .delete(liftingProgram)
                .where(
                    and(
                        eq(liftingProgram.id, input.id),
                        eq(liftingProgram.ownerId, ctx.userId),
                        eq(liftingProgram.isOfficial, false),
                    ),
                );
            return { ok: true };
        }),

    enroll: protectedProcedure
        .input(enrollProgramInputSchema)
        .mutation(async ({ ctx, input }) => {
            const program = await ctx.db.query.liftingProgram.findFirst({
                where: (p, { eq: equals }) => equals(p.id, input.programId),
            });
            if (!program) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Program not found',
                });
            }
            await ctx.db
                .update(liftingUserProgram)
                .set({ status: USER_PROGRAM_STATUS.PAUSED })
                .where(
                    and(
                        eq(liftingUserProgram.userId, ctx.userId),
                        eq(
                            liftingUserProgram.status,
                            USER_PROGRAM_STATUS.ACTIVE,
                        ),
                    ),
                );
            const [row] = await ctx.db
                .insert(liftingUserProgram)
                .values({
                    oneRepMaxes: input.oneRepMaxes,
                    programId: input.programId,
                    startDate: input.startDate,
                    userId: ctx.userId,
                })
                .returning({ id: liftingUserProgram.id });
            if (!row) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Could not enroll',
                });
            }
            return row;
        }),

    get: protectedProcedure
        .input(exerciseSlugActionSchema)
        .query(async ({ ctx, input }) => {
            const row = await ctx.db.query.liftingProgram.findFirst({
                where: (p, { and: a, eq: equals, isNull: n, or: o }) =>
                    a(
                        equals(p.slug, input.slug),
                        o(n(p.ownerId), equals(p.ownerId, ctx.userId)),
                    ),
            });
            if (!row) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Program not found',
                });
            }
            return row;
        }),

    listMine: protectedProcedure.query(async ({ ctx }) => {
        const owned = await ctx.db
            .select()
            .from(liftingProgram)
            .where(eq(liftingProgram.ownerId, ctx.userId))
            .orderBy(asc(liftingProgram.name));
        const enrollments = await ctx.db
            .select()
            .from(liftingUserProgram)
            .where(eq(liftingUserProgram.userId, ctx.userId));
        return { enrollments, owned };
    }),

    listOfficial: protectedProcedure.query(async () => loadOfficialPrograms()),

    nextDay: protectedProcedure
        .input(idActionSchema)
        .query(async ({ ctx, input }) => {
            const enrollment = await ctx.db.query.liftingUserProgram.findFirst({
                where: (u, { and: a, eq: equals }) =>
                    a(equals(u.id, input.id), equals(u.userId, ctx.userId)),
                with: { program: true },
            });
            if (!enrollment) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Enrollment not found',
                });
            }
            const week =
                enrollment.program.schedule.weeks[enrollment.currentWeek - 1];
            const day = week?.days[enrollment.currentDay - 1];
            return { day: day ?? null, enrollment };
        }),

    unenroll: protectedProcedure
        .input(idActionSchema)
        .mutation(async ({ ctx, input }) => {
            await ctx.db
                .delete(liftingUserProgram)
                .where(
                    and(
                        eq(liftingUserProgram.id, input.id),
                        eq(liftingUserProgram.userId, ctx.userId),
                    ),
                );
            return { ok: true };
        }),

    updateEnrollment: protectedProcedure
        .input(updateUserProgramInputSchema)
        .mutation(async ({ ctx, input }) => {
            const { id, ...rest } = input;
            await ctx.db
                .update(liftingUserProgram)
                .set({ ...rest, updatedAt: new Date() })
                .where(
                    and(
                        eq(liftingUserProgram.id, id),
                        eq(liftingUserProgram.userId, ctx.userId),
                    ),
                );
            return { ok: true };
        }),
});
