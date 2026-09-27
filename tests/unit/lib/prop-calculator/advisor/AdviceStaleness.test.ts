import { describe, expect, it } from 'vitest';

import {
    ADVICE_STALE_SESSION_THRESHOLD,
    adviceStaleness,
    AdviceStalenessReason,
    isSnapshotStale,
    sessionsSinceSnapshot,
} from '~/lib/prop-calculator/advisor/AdviceStaleness';
import { SizingStage } from '~/lib/prop-calculator/advisor/SizingStage';

const FRIDAY = '2026-09-11';
const SATURDAY = '2026-09-12';
const SUNDAY = '2026-09-13';
const MONDAY = '2026-09-14';
const TUESDAY = '2026-09-15';
const WEDNESDAY = '2026-09-16';

describe('sessionsSinceSnapshot', () => {
    it('counts the weekday sessions since the snapshot, excluding today', () => {
        expect(sessionsSinceSnapshot(TUESDAY, WEDNESDAY)).toBe(1);
        expect(sessionsSinceSnapshot(MONDAY, WEDNESDAY)).toBe(2);
        expect(sessionsSinceSnapshot(WEDNESDAY, WEDNESDAY)).toBe(0);
    });

    it('anchors a weekend-dated snapshot on the preceding trading session, not the weekend day itself', () => {
        expect(sessionsSinceSnapshot(SATURDAY, MONDAY)).toBe(
            sessionsSinceSnapshot(FRIDAY, MONDAY),
        );
        expect(sessionsSinceSnapshot(SUNDAY, MONDAY)).toBe(
            sessionsSinceSnapshot(FRIDAY, MONDAY),
        );
        expect(sessionsSinceSnapshot(SATURDAY, TUESDAY)).toBe(2);
        expect(sessionsSinceSnapshot(SUNDAY, TUESDAY)).toBe(2);
    });
});

describe('isSnapshotStale', () => {
    it.each([SizingStage.Eval, SizingStage.Live])(
        'a %s snapshot from the last session is not stale',
        (stage) => {
            expect(isSnapshotStale(stage, TUESDAY, WEDNESDAY, 7)).toBe(false);
        },
    );

    it.each([SizingStage.Eval, SizingStage.Live])(
        'a %s snapshot two sessions old is stale',
        (stage) => {
            expect(isSnapshotStale(stage, MONDAY, WEDNESDAY, 7)).toBe(true);
        },
    );

    it.each([SizingStage.Eval, SizingStage.Live])(
        'a weekend-dated %s snapshot is stale once a session has elapsed since the preceding Friday',
        (stage) => {
            expect(isSnapshotStale(stage, SATURDAY, MONDAY, 7)).toBe(false);
            expect(isSnapshotStale(stage, SUNDAY, MONDAY, 7)).toBe(false);
            expect(isSnapshotStale(stage, SATURDAY, TUESDAY, 7)).toBe(true);
            expect(isSnapshotStale(stage, SUNDAY, TUESDAY, 7)).toBe(true);
        },
    );

    it('a funded snapshot is stale only after the funded stale days', () => {
        expect(
            isSnapshotStale(SizingStage.Funded, '2026-09-16', '2026-09-23', 7),
        ).toBe(false);
        expect(
            isSnapshotStale(SizingStage.Funded, '2026-09-15', '2026-09-23', 7),
        ).toBe(true);
    });
});

describe('adviceStaleness', () => {
    it('is fresh with no reasons when nothing is stale', () => {
        expect(
            adviceStaleness({
                asOf: TUESDAY,
                fundedStaleDays: 7,
                planRulesFingerprint: null,
                stage: SizingStage.Eval,
                today: WEDNESDAY,
            }),
        ).toEqual({ kind: 'fresh' });
    });

    it('flags a stale eval or live snapshot with the no-holiday disclosure and the snapshot date', () => {
        expect(
            adviceStaleness({
                asOf: MONDAY,
                fundedStaleDays: 7,
                planRulesFingerprint: null,
                stage: SizingStage.Live,
                today: WEDNESDAY,
            }),
        ).toEqual({
            kind: 'stale',
            noHolidayCalendarDisclosure: true,
            reasons: [AdviceStalenessReason.SessionSnapshotStale],
            snapshotAsOf: MONDAY,
        });
    });

    it('flags a stale funded snapshot without the no-holiday disclosure', () => {
        expect(
            adviceStaleness({
                asOf: '2026-09-15',
                fundedStaleDays: 7,
                planRulesFingerprint: null,
                stage: SizingStage.Funded,
                today: '2026-09-23',
            }),
        ).toEqual({
            kind: 'stale',
            noHolidayCalendarDisclosure: false,
            reasons: [AdviceStalenessReason.FundedSnapshotStale],
            snapshotAsOf: '2026-09-15',
        });
    });

    it('flags a plan-rules fingerprint mismatch even on a fresh snapshot', () => {
        expect(
            adviceStaleness({
                asOf: TUESDAY,
                fundedStaleDays: 7,
                planRulesFingerprint: { atAdvice: 'v1', current: 'v2' },
                stage: SizingStage.Eval,
                today: WEDNESDAY,
            }),
        ).toEqual({
            kind: 'stale',
            noHolidayCalendarDisclosure: true,
            reasons: [AdviceStalenessReason.PlanRulesChanged],
            snapshotAsOf: TUESDAY,
        });
    });

    it('matches a fingerprint that has not changed and stays fresh', () => {
        expect(
            adviceStaleness({
                asOf: TUESDAY,
                fundedStaleDays: 7,
                planRulesFingerprint: { atAdvice: 'v1', current: 'v1' },
                stage: SizingStage.Eval,
                today: WEDNESDAY,
            }).kind,
        ).toBe('fresh');
    });

    it('reports both reasons when the snapshot is stale and the plan rules changed', () => {
        const result = adviceStaleness({
            asOf: MONDAY,
            fundedStaleDays: 7,
            planRulesFingerprint: { atAdvice: 'v1', current: 'v2' },
            stage: SizingStage.Eval,
            today: WEDNESDAY,
        });
        expect(result.kind).toBe('stale');
        expect(result.kind === 'stale' && result.reasons).toEqual([
            AdviceStalenessReason.SessionSnapshotStale,
            AdviceStalenessReason.PlanRulesChanged,
        ]);
    });

    it('keeps the threshold constant at 2 sessions', () => {
        expect(ADVICE_STALE_SESSION_THRESHOLD).toBe(2);
    });
});
