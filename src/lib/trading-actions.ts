'use server';

import { and, desc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { auth } from '~/lib/auth';
import { DEFAULT_PLAN } from '~/lib/trading-defaults';
import type {
    Answers,
    AssessmentResult,
    Outcome,
    TradingPlanConfig,
} from '~/lib/trading-types';
import { db, tradeAssessments, tradingPlans } from '~/server/db';

async function requireUserId(): Promise<string> {
    const session = await auth();
    if (!session?.user?.id) redirect('/login');
    return session.user.id;
}

export async function createTradingPlan(formData: FormData): Promise<void> {
    const userId = await requireUserId();
    const name = ((formData.get('name') as string) ?? '').trim();
    if (!name) redirect('/profile?tab=trading-plan&error=plan_name_required');

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
            name,
            isActive: shouldBeActive,
            config: DEFAULT_PLAN,
        })
        .returning({ id: tradingPlans.id });

    redirect(
        `/profile?tab=trading-plan&plan=${created!.id}&success=plan_created`,
    );
}

export async function updateTradingPlan(
    planId: string,
    name: string,
    config: TradingPlanConfig,
): Promise<void> {
    const userId = await requireUserId();
    await db
        .update(tradingPlans)
        .set({ name, config, updatedAt: new Date() })
        .where(
            and(eq(tradingPlans.id, planId), eq(tradingPlans.userId, userId)),
        );
    redirect(`/profile?tab=trading-plan&plan=${planId}&success=plan_saved`);
}

export async function deleteTradingPlan(planId: string): Promise<void> {
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

export async function setActiveTradingPlan(planId: string): Promise<void> {
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
    planId: string,
): Promise<void> {
    await setActiveTradingPlan(planId);
    redirect(`/profile?tab=trading-plan&plan=${planId}&success=plan_activated`);
}

export async function cloneTradingPlan(planId: string): Promise<void> {
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

export async function saveAssessment(payload: {
    planId: string | null;
    planSnapshot: TradingPlanConfig;
    answers: Answers;
    result: AssessmentResult;
}): Promise<{ id: string }> {
    const userId = await requireUserId();
    const [row] = await db
        .insert(tradeAssessments)
        .values({
            userId,
            planId: payload.planId,
            planSnapshot: payload.planSnapshot,
            answers: payload.answers,
            result: payload.result,
            score: payload.result.score,
            grade: payload.result.grade,
            recommendation: payload.result.recommendation,
        })
        .returning({ id: tradeAssessments.id });
    return { id: row!.id };
}

export async function recordAssessmentOutcome(
    id: string,
    outcome: Outcome,
    outcomeR: number | null,
    notes: string | null,
): Promise<void> {
    const userId = await requireUserId();
    await db
        .update(tradeAssessments)
        .set({
            outcome,
            outcomeR,
            outcomeNotes: notes,
            outcomeRecordedAt: new Date(),
        })
        .where(
            and(
                eq(tradeAssessments.id, id),
                eq(tradeAssessments.userId, userId),
            ),
        );
}

export async function deleteAssessment(id: string): Promise<void> {
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

export async function reorderTradingPlans(orderedIds: string[]): Promise<void> {
    const userId = await requireUserId();
    await db.transaction(async (tx) => {
        for (let i = 0; i < orderedIds.length; i++) {
            await tx
                .update(tradingPlans)
                .set({ sortOrder: i })
                .where(
                    and(
                        eq(tradingPlans.id, orderedIds[i]!),
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
