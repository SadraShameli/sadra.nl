'use server';

import { and, desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { auth } from '~/lib/auth/config';
import {
    type AssessmentIdActionInput,
    assessmentIdActionSchema,
    type CreateTradingPlanInput,
    createTradingPlanInputSchema,
    type DeletePrepInput,
    deletePrepInputSchema,
    type PlanIdActionInput,
    planIdActionSchema,
    type RecordAssessmentOutcomeInput,
    recordAssessmentOutcomeInputSchema,
    type ReorderTradingPlansInput,
    reorderTradingPlansInputSchema,
    type SaveAssessmentInput,
    saveAssessmentInputSchema,
    type SavePrepInput,
    savePrepInputSchema,
    type UpdateTradingPlanInput,
    updateTradingPlanInputSchema,
} from '~/lib/schemas/trading';
import { profileTabs, routes, withQuery } from '~/lib/site/routes';
import { DEFAULT_PLAN } from '~/lib/trading/defaults';
import { PREP_CHECK_KEYS } from '~/lib/trading/types';
import {
    dailyPreparations,
    db,
    tradeAssessments,
    tradingPlans,
} from '~/server/db';

export async function cloneTradingPlan(
    input: PlanIdActionInput,
): Promise<void> {
    const { planId } = planIdActionSchema.parse(input);
    const userId = await requireUserId();

    const [source] = await db
        .select()
        .from(tradingPlans)
        .where(
            and(eq(tradingPlans.id, planId), eq(tradingPlans.userId, userId)),
        )
        .limit(1);

    if (!source) {
        redirect(
            withQuery(routes.profile, {
                error: 'plan_not_found',
                tab: profileTabs.tradingPlan,
            }),
        );
    }

    const [copy] = await db
        .insert(tradingPlans)
        .values({
            config: source.config,
            isActive: false,
            name: `${source.name} (copy)`,
            userId,
        })
        .returning({ id: tradingPlans.id });

    if (!copy) throw new Error('Failed to clone trading plan');
    redirect(
        withQuery(routes.profile, {
            plan: copy.id,
            success: 'plan_cloned',
            tab: profileTabs.tradingPlan,
        }),
    );
}

export async function createTradingPlan(
    input: CreateTradingPlanInput,
): Promise<void> {
    const data = createTradingPlanInputSchema.parse(input);
    const userId = await requireUserId();

    const existing = await db
        .select({ id: tradingPlans.id })
        .from(tradingPlans)
        .where(eq(tradingPlans.userId, userId))
        .limit(1);
    const shouldBeActive = existing.length === 0;

    const [created] = await db
        .insert(tradingPlans)
        .values({
            config: DEFAULT_PLAN,
            isActive: shouldBeActive,
            name: data.name,
            userId,
        })
        .returning({ id: tradingPlans.id });

    if (!created) throw new Error('Failed to create trading plan');
    redirect(
        withQuery(routes.profile, {
            plan: created.id,
            success: 'plan_created',
            tab: profileTabs.tradingPlan,
        }),
    );
}

export async function deleteAllAssessments(): Promise<void> {
    const userId = await requireUserId();
    await db
        .delete(tradeAssessments)
        .where(eq(tradeAssessments.userId, userId));
}

export async function deleteAssessment(
    input: AssessmentIdActionInput,
): Promise<void> {
    const { id } = assessmentIdActionSchema.parse(input);
    const userId = await requireUserId();
    await db
        .delete(tradeAssessments)
        .where(
            and(
                eq(tradeAssessments.id, id),
                eq(tradeAssessments.userId, userId),
            ),
        );
}

export async function deletePrep(input: DeletePrepInput): Promise<void> {
    const data = deletePrepInputSchema.parse(input);
    const userId = await requireUserId();
    await db
        .delete(dailyPreparations)
        .where(
            and(
                eq(dailyPreparations.userId, userId),
                eq(dailyPreparations.date, data.date),
            ),
        );
}

export async function deleteTradingPlan(
    input: PlanIdActionInput,
): Promise<void> {
    const { planId } = planIdActionSchema.parse(input);
    const userId = await requireUserId();

    const all = await db
        .select({ id: tradingPlans.id, isActive: tradingPlans.isActive })
        .from(tradingPlans)
        .where(eq(tradingPlans.userId, userId));

    if (all.length <= 1) {
        redirect(
            withQuery(routes.profile, {
                error: 'plan_last_remaining',
                tab: profileTabs.tradingPlan,
            }),
        );
    }

    const target = all.find((p) => p.id === planId);
    if (!target) {
        redirect(
            withQuery(routes.profile, {
                error: 'plan_not_found',
                tab: profileTabs.tradingPlan,
            }),
        );
    }

    await db
        .delete(tradingPlans)
        .where(
            and(eq(tradingPlans.id, planId), eq(tradingPlans.userId, userId)),
        );

    if (target.isActive) {
        const next = all.find((p) => p.id !== planId);
        if (next) {
            await db
                .update(tradingPlans)
                .set({ isActive: true })
                .where(eq(tradingPlans.id, next.id));
        }
    }

    redirect(
        withQuery(routes.profile, {
            success: 'plan_deleted',
            tab: profileTabs.tradingPlan,
        }),
    );
}

export async function ensureUserHasPlan(): Promise<{
    created: boolean;
    planId: string;
}> {
    const userId = await requireUserId();
    const existing = await db
        .select({ id: tradingPlans.id, isActive: tradingPlans.isActive })
        .from(tradingPlans)
        .where(eq(tradingPlans.userId, userId))
        .orderBy(desc(tradingPlans.isActive), desc(tradingPlans.updatedAt));

    const [first] = existing;
    if (first) {
        return { created: false, planId: first.id };
    }

    const [created] = await db
        .insert(tradingPlans)
        .values({
            config: DEFAULT_PLAN,
            isActive: true,
            name: 'My trading plan',
            userId,
        })
        .returning({ id: tradingPlans.id });

    if (!created) throw new Error('Failed to create trading plan');
    return { created: true, planId: created.id };
}

export async function recordAssessmentOutcome(
    input: RecordAssessmentOutcomeInput,
): Promise<void> {
    const data = recordAssessmentOutcomeInputSchema.parse(input);
    const userId = await requireUserId();
    const updated = await db
        .update(tradeAssessments)
        .set({
            actualRiskTaken: data.actualRiskTaken,
            executionDeviations: data.executionDeviations,
            followedPlan: data.followedPlan,
            outcome: data.outcome,
            outcomeNotes: data.notes,
            outcomeR: data.outcomeR,
            outcomeRecordedAt: new Date(),
        })
        .where(
            and(
                eq(tradeAssessments.id, data.id),
                eq(tradeAssessments.userId, userId),
            ),
        )
        .returning({ id: tradeAssessments.id });
    if (updated.length === 0) {
        throw new Error('Assessment not found or access denied');
    }
}

export async function reorderTradingPlans(
    input: ReorderTradingPlansInput,
): Promise<void> {
    const data = reorderTradingPlansInputSchema.parse(input);
    const userId = await requireUserId();
    await db.transaction(async (tx) => {
        for (const [i, id] of data.orderedIds.entries()) {
            await tx
                .update(tradingPlans)
                .set({ sortOrder: i })
                .where(
                    and(
                        eq(tradingPlans.id, id),
                        eq(tradingPlans.userId, userId),
                    ),
                );
        }
    });
}

export async function saveAssessment(
    input: SaveAssessmentInput,
): Promise<{ id: string }> {
    const data = saveAssessmentInputSchema.parse(input);
    const userId = await requireUserId();
    const [row] = await db
        .insert(tradeAssessments)
        .values({
            answers: data.answers,
            grade: data.result.grade,
            planId: data.planId,
            planSnapshot: data.planSnapshot,
            recommendation: data.result.recommendation,
            result: data.result,
            score: data.result.score,
            userId,
        })
        .returning({ id: tradeAssessments.id });
    if (!row) throw new Error('Failed to record assessment');
    return { id: row.id };
}

export async function savePrep(input: SavePrepInput): Promise<void> {
    const data = savePrepInputSchema.parse(input);
    const userId = await requireUserId();
    const completed = PREP_CHECK_KEYS.filter((k) => data.checks[k]).length;
    const score = (completed / PREP_CHECK_KEYS.length) * 100;
    await db
        .insert(dailyPreparations)
        .values({
            checks: data.checks,
            date: data.date,
            notes: data.notes,
            planId: data.planId,
            score,
            userId,
        })
        .onConflictDoUpdate({
            set: {
                checks: data.checks,
                notes: data.notes,
                planId: data.planId,
                score,
                updatedAt: new Date(),
            },
            target: [dailyPreparations.userId, dailyPreparations.date],
        });
}

export async function setActiveTradingPlan(
    input: PlanIdActionInput,
): Promise<void> {
    const { planId } = planIdActionSchema.parse(input);
    const userId = await requireUserId();
    await db.transaction(async (tx) => {
        await tx
            .update(tradingPlans)
            .set({ isActive: false })
            .where(eq(tradingPlans.userId, userId));
        await tx
            .update(tradingPlans)
            .set({ isActive: true })
            .where(
                and(
                    eq(tradingPlans.id, planId),
                    eq(tradingPlans.userId, userId),
                ),
            );
    });
}

export async function updateTradingPlan(
    input: UpdateTradingPlanInput,
): Promise<void> {
    const data = updateTradingPlanInputSchema.parse(input);
    const userId = await requireUserId();
    await db
        .update(tradingPlans)
        .set({ config: data.config, name: data.name, updatedAt: new Date() })
        .where(
            and(
                eq(tradingPlans.id, data.planId),
                eq(tradingPlans.userId, userId),
            ),
        );
    redirect(
        withQuery(routes.profile, {
            plan: data.planId,
            success: 'plan_saved',
            tab: profileTabs.tradingPlan,
        }),
    );
}

async function requireUserId(): Promise<string> {
    const session = await auth();
    if (!session?.user.id) redirect(routes.auth.login);
    return session.user.id;
}
