import {
    dayNumberOf,
    isoDaysBetween,
    isWeekendDay,
    weekdaysInRange,
} from '~/lib/prop-calculator/core';

import { SizingStage } from './SizingStage';

export const ADVICE_STALE_SESSION_THRESHOLD = 2;

export enum AdviceStalenessKind {
    Fresh = 'fresh',
    Stale = 'stale',
}

export enum AdviceStalenessReason {
    FundedSnapshotStale = 'funded-snapshot-stale',
    PlanRulesChanged = 'plan-rules-changed',
    SessionSnapshotStale = 'session-snapshot-stale',
}

export type AdviceStaleness = FreshAdviceStaleness | StaleAdviceStaleness;

export interface AdviceStalenessInput {
    readonly asOf: string;
    readonly fundedStaleDays: number;
    readonly planRulesFingerprint: null | PlanRulesFingerprintCheck;
    readonly stage: SizingStage;
    readonly today: string;
}

export interface FreshAdviceStaleness {
    readonly kind: AdviceStalenessKind.Fresh;
}

export interface PlanRulesFingerprintCheck {
    readonly atAdvice: null | string;
    readonly current: string;
}

export interface StaleAdviceStaleness {
    readonly kind: AdviceStalenessKind.Stale;
    readonly noHolidayCalendarDisclosure: boolean;
    readonly reasons: readonly AdviceStalenessReason[];
    readonly snapshotAsOf: string;
}

export function adviceStaleness(input: AdviceStalenessInput): AdviceStaleness {
    const reasons: AdviceStalenessReason[] = [];
    if (
        isSnapshotStale(
            input.stage,
            input.asOf,
            input.today,
            input.fundedStaleDays,
        )
    ) {
        reasons.push(
            input.stage === SizingStage.Funded
                ? AdviceStalenessReason.FundedSnapshotStale
                : AdviceStalenessReason.SessionSnapshotStale,
        );
    }
    if (
        input.planRulesFingerprint !== null &&
        input.planRulesFingerprint.atAdvice !== null &&
        input.planRulesFingerprint.current !==
            input.planRulesFingerprint.atAdvice
    ) {
        reasons.push(AdviceStalenessReason.PlanRulesChanged);
    }
    if (reasons.length === 0) return { kind: AdviceStalenessKind.Fresh };
    return {
        kind: AdviceStalenessKind.Stale,
        noHolidayCalendarDisclosure: input.stage !== SizingStage.Funded,
        reasons,
        snapshotAsOf: input.asOf,
    };
}

export function isSnapshotStale(
    stage: SizingStage,
    asOf: string,
    today: string,
    fundedStaleDays: number,
): boolean {
    switch (stage) {
        case SizingStage.Eval:
        case SizingStage.Live: {
            return (
                sessionsSinceSnapshot(asOf, today) >=
                ADVICE_STALE_SESSION_THRESHOLD
            );
        }
        case SizingStage.Funded: {
            return isoDaysBetween(asOf, today) > fundedStaleDays;
        }
    }
}

export function sessionsSinceSnapshot(asOf: string, today: string): number {
    return weekdaysInRange(
        lastTradingDayOnOrBefore(dayNumberOf(asOf)),
        dayNumberOf(today),
    );
}

function lastTradingDayOnOrBefore(day: number): number {
    let candidate = day;
    while (isWeekendDay(candidate)) candidate -= 1;
    return candidate;
}
