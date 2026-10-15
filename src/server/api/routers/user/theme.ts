import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import {
    type AppliedTheme,
    renderThemeCss,
    themeFontFamilies,
    themeIdSchema,
    ThemeSource,
    type TweakcnTheme,
} from '~/lib/theme';
import {
    bundledThemeCatalog,
    InvalidThemeLinkError,
    ThemeNotFoundError,
    TweakcnClient,
    TweakcnUnavailableError,
} from '~/lib/theme/server';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';
import { type db as database, userTheme } from '~/server/db';

const THEME_PAGE_SIZE = 24;
const THEME_LINK_MAX_LENGTH = 300;
const THEME_SEARCH_MAX_LENGTH = 80;

const catalogInputSchema = z.object({
    page: z.number().int().min(1),
    search: z.string().max(THEME_SEARCH_MAX_LENGTH),
    source: z.enum([ThemeSource.Preset, ThemeSource.Community]).nullable(),
});

const selectInputSchema = z.object({
    id: themeIdSchema,
    source: z.enum([ThemeSource.Preset, ThemeSource.Community]),
});

const importInputSchema = z.object({
    link: z.string().trim().min(1).max(THEME_LINK_MAX_LENGTH),
});

type ThemeRow = Pick<
    typeof userTheme.$inferSelect,
    'name' | 'source' | 'styles' | 'themeId'
>;

function appliedThemeOf(row: ThemeRow): AppliedTheme {
    return {
        css: renderThemeCss(row.styles),
        fonts: themeFontFamilies(row.styles),
        id: row.themeId,
        name: row.name,
        source: row.source,
    };
}

async function importedTheme(link: string): Promise<TweakcnTheme> {
    try {
        const client = new TweakcnClient();
        return await client.fetchTheme(TweakcnClient.parseThemeReference(link));
    } catch (error) {
        if (
            error instanceof InvalidThemeLinkError ||
            error instanceof ThemeNotFoundError
        )
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: error.message,
            });
        if (error instanceof TweakcnUnavailableError)
            throw new TRPCError({
                code: 'SERVICE_UNAVAILABLE',
                message: error.message,
            });
        throw error;
    }
}

async function saveTheme(
    executor: typeof database,
    userId: string,
    theme: TweakcnTheme,
    source: ThemeSource,
): Promise<AppliedTheme> {
    const row: ThemeRow = {
        name: theme.name,
        source,
        styles: theme.styles,
        themeId: theme.id,
    };
    await executor
        .insert(userTheme)
        .values({ ...row, userId })
        .onConflictDoUpdate({
            set: { ...row, updatedAt: new Date() },
            target: userTheme.userId,
        });
    return appliedThemeOf(row);
}

export const themeRouter = createTRPCRouter({
    catalog: protectedProcedure
        .input(catalogInputSchema)
        .query(async ({ input }) => {
            const catalog = await bundledThemeCatalog.load();
            return catalog.page({
                page: input.page,
                pageSize: THEME_PAGE_SIZE,
                search: input.search,
                source: input.source,
            });
        }),

    current: protectedProcedure.query(async ({ ctx }) => {
        const [row] = await ctx.db
            .select({
                name: userTheme.name,
                source: userTheme.source,
                styles: userTheme.styles,
                themeId: userTheme.themeId,
            })
            .from(userTheme)
            .where(eq(userTheme.userId, ctx.userId))
            .limit(1);
        return row === undefined ? null : appliedThemeOf(row);
    }),

    import: protectedProcedure
        .input(importInputSchema)
        .mutation(async ({ ctx, input }) =>
            saveTheme(
                ctx.db,
                ctx.userId,
                await importedTheme(input.link),
                ThemeSource.Imported,
            ),
        ),

    reset: protectedProcedure.mutation(async ({ ctx }) => {
        await ctx.db.delete(userTheme).where(eq(userTheme.userId, ctx.userId));
        return null;
    }),

    select: protectedProcedure
        .input(selectInputSchema)
        .mutation(async ({ ctx, input }) => {
            const catalog = await bundledThemeCatalog.load();
            const theme = catalog.find(input.id, input.source);
            if (theme === null) throw new TRPCError({ code: 'NOT_FOUND' });
            return saveTheme(ctx.db, ctx.userId, theme, input.source);
        }),
});
