'use server';

import { and, desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { auth } from '~/lib/auth';
import {
    assessmentIdActionSchema,
    createTradingPlanInputSchema,
    planIdActionSchema,
    recordAssessmentOutcomeInputSchema,
    reorderTradingPlansInputSchema,
    saveAssessmentInputSchema,
    updateTradingPlanInputSchema,
    type AssessmentIdActionInput,
    type CreateTradingPlanInput,
    type PlanIdActionInput,
    type RecordAssessmentOutcomeInput,
    type ReorderTradingPlansInput,
    type SaveAssessmentInput,
    type UpdateTradingPlanInput,
} from '~/lib/schemas/trading';
import { DEFAULT_PLAN } from '~/lib/trading-defaults';
import { db, tradeAssessments, tradingPlans } from '~/server/db';

async function requireUserId(): Promise<string> {
    const session = await auth();
    if (!session?.user?.id) redirect('/login');
    return session.user.id;
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
            userId,
            name: data.name,
            isActive: shouldBeActive,
            config: DEFAULT_PLAN,
        })
        .returning({ id: tradingPlans.id });

    redirect(
        `/profile?tab=trading-plan&plan=${created!.id}&success=plan_created`,
    );
}

export async function updateTradingPlan(
    input: UpdateTradingPlanInput,
): Promise<void> {
    const data = updateTradingPlanInputSchema.parse(input);
    const userId = await requireUserId();
    await db
        .update(tradingPlans)
        .set({ name: data.name, config: data.config, updatedAt: new Date() })
        .where(
            and(
                eq(tradingPlans.id, data.planId),
                eq(tradingPlans.userId, userId),
            ),
        );
    redirect(
        `/profile?tab=trading-plan&plan=${data.planId}&success=plan_saved`,
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
        redirect('/profile?tab=trading-plan&error=plan_last_remaining');
    }

    const target = all.find((p) => p.id === planId);
    if (!target) {
        redirect('/profile?tab=trading-plan&error=plan_not_found');
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

    redirect('/profile?tab=trading-plan&success=plan_deleted');
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

export async function setActiveAndRedirectProfile(
    input: PlanIdActionInput,
): Promise<void> {
    const { planId } = planIdActionSchema.parse(input);
    await setActiveTradingPlan({ planId });
    redirect(`/profile?tab=trading-plan&plan=${planId}&success=plan_activated`);
}

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
        redirect('/profile?tab=trading-plan&error=plan_not_found');
    }

    const [copy] = await db
        .insert(tradingPlans)
        .values({
            userId,
            name: `${source.name} (copy)`,
            isActive: false,
            config: source.config,
        })
        .returning({ id: tradingPlans.id });

    redirect(`/profile?tab=trading-plan&plan=${copy!.id}&success=plan_cloned`);
}

export async function saveAssessment(
    input: SaveAssessmentInput,
): Promise<{ id: string }> {
    const data = saveAssessmentInputSchema.parse(input);
    const userId = await requireUserId();
    const [row] = await db
        .insert(tradeAssessments)
        .values({
            userId,
            planId: data.planId,
            planSnapshot: data.planSnapshot,
            answers: data.answers,
            result: data.result,
            score: data.result.score,
            grade: data.result.grade,
            recommendation: data.result.recommendation,
        })
        .returning({ id: tradeAssessments.id });
    return { id: row!.id };
}

export async function recordAssessmentOutcome(
    input: RecordAssessmentOutcomeInput,
): Promise<void> {
    const data = recordAssessmentOutcomeInputSchema.parse(input);
    const userId = await requireUserId();
    await db
        .update(tradeAssessments)
        .set({
            outcome: data.outcome,
            outcomeR: data.outcomeR,
            outcomeNotes: data.notes,
            outcomeRecordedAt: new Date(),
        })
        .where(
            and(
                eq(tradeAssessments.id, data.id),
                eq(tradeAssessments.userId, userId),
            ),
        );
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

export async function deleteAllAssessments(): Promise<void> {
    const userId = await requireUserId();
    await db
        .delete(tradeAssessments)
        .where(eq(tradeAssessments.userId, userId));
}

export async function reorderTradingPlans(
    input: ReorderTradingPlansInput,
): Promise<void> {
    const data = reorderTradingPlansInputSchema.parse(input);
    const userId = await requireUserId();
    await db.transaction(async (tx) => {
        for (let i = 0; i < data.orderedIds.length; i++) {
            await tx
                .update(tradingPlans)
                .set({ sortOrder: i })
                .where(
                    and(
                        eq(tradingPlans.id, data.orderedIds[i]!),
                        eq(tradingPlans.userId, userId),
                    ),
                );
        }
    });
}

export async function ensureUserHasPlan(): Promise<{
    planId: string;
    created: boolean;
}> {
    const userId = await requireUserId();
    const existing = await db
        .select({ id: tradingPlans.id, isActive: tradingPlans.isActive })
        .from(tradingPlans)
        .where(eq(tradingPlans.userId, userId))
        .orderBy(desc(tradingPlans.isActive), desc(tradingPlans.updatedAt));

    if (existing.length > 0) {
        return { planId: existing[0]!.id, created: false };
    }

    const [created] = await db
        .insert(tradingPlans)
        .values({
            userId,
            name: 'My trading plan',
            isActive: true,
            config: DEFAULT_PLAN,
        })
        .returning({ id: tradingPlans.id });

    return { planId: created!.id, created: true };
}
