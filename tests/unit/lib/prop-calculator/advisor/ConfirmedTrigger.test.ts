import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    dollars,
    type FirmPolicySource,
    PolicySourceKind,
    PolicyVerification,
    SingleDayProfitTrigger,
} from '~/lib/prop-calculator';
import { isConfirmedTrigger } from '~/lib/prop-calculator/advisor/ConfirmedTrigger';
import { liveTriggerCeilingFor } from '~/lib/prop-calculator/advisor/DailyPlanCard';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

const CONFIRMED = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

const CONFLICT = {
    ...CONFIRMED,
    conflicting: CONFIRMED,
    verification: PolicyVerification.Conflict,
} as const;

const NEEDS_PASTE = {
    verification: PolicyVerification.NeedsPaste,
} as const;

function triggerWith(source?: FirmPolicySource): SingleDayProfitTrigger {
    return new SingleDayProfitTrigger(dollars(250), true, false, source);
}

describe('the one confirmed-trigger check (PT-36h review)', () => {
    it('is true only for a trigger whose source is Confirmed', () => {
        expect(isConfirmedTrigger(triggerWith(CONFIRMED))).toBe(true);
        for (const source of [CONFLICT, NEEDS_PASTE, undefined]) {
            expect(isConfirmedTrigger(triggerWith(source))).toBe(false);
        }
    });

    it('decides whether the single-day ceiling binds, through the same check', () => {
        expect(liveTriggerCeilingFor(triggerWith(CONFIRMED))).toBe(200);
        expect(liveTriggerCeilingFor(triggerWith(NEEDS_PASTE))).toBeNull();
        expect(liveTriggerCeilingFor(triggerWith(CONFLICT))).toBeNull();
        expect(liveTriggerCeilingFor(triggerWith())).toBeNull();
    });

    it('keeps the verification comparison out of DailyPlanCard.ts', () => {
        const text = readFileSync(
            path.join(
                REPO_ROOT,
                'src/lib/prop-calculator/advisor/DailyPlanCard.ts',
            ),
            'utf8',
        );

        expect(text).toContain('isConfirmedTrigger');
        expect(text).not.toContain('PolicyVerification');
    });
});
