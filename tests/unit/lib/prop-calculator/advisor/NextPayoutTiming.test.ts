import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    NEXT_PAYOUT_AMONG_PAYING_TEXT,
    NEXT_PAYOUT_ELIGIBILITY_CHECK_TEXT,
    NEXT_PAYOUT_ELIGIBLE_NOW_CAVEAT_TEXT,
    NEXT_PAYOUT_ELIGIBLE_NOW_TEXT,
    NEXT_PAYOUT_NO_TRIAL_PAID_TEXT,
    nextPayoutEvidenceText,
    type NextPayoutProjection,
    NextPayoutTimingKind,
    nextPayoutTimingOf,
} from '~/lib/prop-calculator/advisor';

function projection(
    overrides: Partial<NextPayoutProjection> = {},
): NextPayoutProjection {
    return {
        accountLostBeforeFirstPayoutProbability: 0.25,
        accountLostBeforeFirstPayoutStandardError: 0.01,
        alreadyEligible: false,
        expectedCalendarDaysToFirstPayout: { standardError: 0.5, value: 12.3 },
        expectedResetFeeBeforeFirstPayout: { standardError: 0, value: 0 },
        expectedSessionDaysToFirstPayout: { standardError: 0.4, value: 9 },
        firstPayoutCausedBreachProbability: null,
        firstPayoutCausedBreachStandardError: null,
        payingTrials: 100,
        trials: 200,
        ...overrides,
    };
}

describe('nextPayoutTimingOf', () => {
    it('reads an already-eligible projection from the engine flag, not from zero days', () => {
        const timing = nextPayoutTimingOf(
            projection({
                alreadyEligible: true,
                expectedCalendarDaysToFirstPayout: {
                    standardError: 0,
                    value: 0,
                },
                payingTrials: 200,
            }),
        );
        expect(timing.kind).toBe(NextPayoutTimingKind.AlreadyEligible);
    });

    it('reports that no trial paid, even though the empty mean reads zero days', () => {
        const timing = nextPayoutTimingOf(
            projection({
                expectedCalendarDaysToFirstPayout: {
                    standardError: null,
                    value: 0,
                },
                expectedSessionDaysToFirstPayout: {
                    standardError: null,
                    value: 0,
                },
                payingTrials: 0,
            }),
        );
        expect(timing.kind).toBe(NextPayoutTimingKind.NoTrialPaid);
    });

    it('keeps the projected days and their standard errors for a projection that pays', () => {
        const timing = nextPayoutTimingOf(projection());
        expect(timing).toEqual({
            calendarDays: { standardError: 0.5, value: 12.3 },
            kind: NextPayoutTimingKind.InDays,
            sessionDays: { standardError: 0.4, value: 9 },
        });
    });

    it('does not call a zero-day mean of paying trials eligible when the engine did not say so', () => {
        const timing = nextPayoutTimingOf(
            projection({
                expectedCalendarDaysToFirstPayout: {
                    standardError: 0,
                    value: 0,
                },
            }),
        );
        expect(timing.kind).toBe(NextPayoutTimingKind.InDays);
    });

    it('checks the no-payout case before the eligible flag, as the account list does', () => {
        const timing = nextPayoutTimingOf(
            projection({ alreadyEligible: true, payingTrials: 0 }),
        );
        expect(timing.kind).toBe(NextPayoutTimingKind.NoTrialPaid);
    });
});

describe('next payout timing texts', () => {
    it('says eligible now and no trial paid in words with no day count', () => {
        expect(NEXT_PAYOUT_ELIGIBLE_NOW_TEXT).toBe('Eligible now');
        expect(NEXT_PAYOUT_NO_TRIAL_PAID_TEXT).toBe(
            'No simulated trial reached a payout within the horizon',
        );
        expect(NEXT_PAYOUT_ELIGIBLE_NOW_TEXT).not.toMatch(/days/);
        expect(NEXT_PAYOUT_NO_TRIAL_PAID_TEXT).not.toMatch(/0\.0/);
    });

    it('words the paying share with the trial counts', () => {
        expect(nextPayoutEvidenceText(projection())).toBe(
            '100 of 200 trials reached a payout (50.0%)',
        );
        expect(
            nextPayoutEvidenceText(
                projection({ payingTrials: 1234, trials: 2000 }),
            ),
        ).toBe('1,234 of 2,000 trials reached a payout (61.7%)');
    });

    it('attributes an already-eligible projection to the eligibility check instead of a placeholder trial count', () => {
        const text = nextPayoutEvidenceText(
            projection({ alreadyEligible: true, payingTrials: 200 }),
        );
        expect(text).toBe(NEXT_PAYOUT_ELIGIBILITY_CHECK_TEXT);
        expect(text).toContain("the engine's payout eligibility check");
        expect(text).not.toMatch(/\d/);
    });

    it('carries the live trigger and payout count caveat on an already-eligible projection, and only on that one (PT-68e, F-V18)', () => {
        expect(NEXT_PAYOUT_ELIGIBLE_NOW_CAVEAT_TEXT).toContain('live trigger');
        expect(NEXT_PAYOUT_ELIGIBLE_NOW_CAVEAT_TEXT).toContain('payout count');
        expect(NEXT_PAYOUT_ELIGIBLE_NOW_CAVEAT_TEXT).not.toMatch(/\d/);
        expect(
            nextPayoutEvidenceText(
                projection({ alreadyEligible: true, payingTrials: 200 }),
            ),
        ).toContain(NEXT_PAYOUT_ELIGIBLE_NOW_CAVEAT_TEXT);
        expect(nextPayoutEvidenceText(projection())).not.toContain(
            NEXT_PAYOUT_ELIGIBLE_NOW_CAVEAT_TEXT,
        );
        expect(
            nextPayoutEvidenceText(projection({ payingTrials: 0 })),
        ).not.toContain(NEXT_PAYOUT_ELIGIBLE_NOW_CAVEAT_TEXT);
    });

    it('words the conditional mean as among the trials that paid', () => {
        expect(NEXT_PAYOUT_AMONG_PAYING_TEXT).toBe(
            'among the trials that paid',
        );
    });
});

describe('one already-eligible rule on the advice panel, the payout planner and the CLI (PT-68c)', () => {
    const SURFACES = [
        path.join(
            'src',
            'app',
            '(app)',
            'prop-calculator',
            'accounts',
            '_components',
            'advice',
            'adviceViewModel.ts',
        ),
        path.join(
            'src',
            'app',
            '(app)',
            'prop-calculator',
            '(tools)',
            'payout-planner',
            'PayoutPlannerView.tsx',
        ),
        path.join('src', 'cli', 'commands', 'prop', 'advise', 'command.ts'),
    ];

    it('reads the timing through nextPayoutTimingOf and never infers eligibility itself', () => {
        for (const surface of SURFACES) {
            const source = readFileSync(
                path.join(process.cwd(), surface),
                'utf8',
            );
            expect(source, surface).toContain('nextPayoutTimingOf(');
            expect(source, surface).not.toContain('alreadyEligible');
            expect(source, surface).not.toMatch(/payingTrials\s*[=!]==\s*0/);
        }
    });

    it('never prints the day estimate of a projection without going through the timing', () => {
        for (const surface of SURFACES) {
            const source = readFileSync(
                path.join(process.cwd(), surface),
                'utf8',
            );
            expect(source, surface).not.toMatch(
                /projection\.expected(?:Calendar|Session)DaysToFirstPayout/,
            );
        }
    });
});

describe('one next-payout wording on the account list and the from-state card (PT-68d)', () => {
    const SURFACES = [
        path.join(
            'src',
            'app',
            '(app)',
            'prop-calculator',
            'accounts',
            '_components',
            'accountValueColumns.ts',
        ),
        path.join(
            'src',
            'app',
            '(app)',
            'prop-calculator',
            'accounts',
            '_components',
            'overview',
            'accountFromStateModel.ts',
        ),
    ];

    function sourceOf(surface: string): string {
        return readFileSync(path.join(process.cwd(), surface), 'utf8');
    }

    it('reads the timing through nextPayoutTimingOf and never infers eligibility or a missing payout itself', () => {
        for (const surface of SURFACES) {
            const source = sourceOf(surface);
            expect(source, surface).toContain('nextPayoutTimingOf(');
            expect(source, surface).not.toContain('alreadyEligible');
            expect(source, surface).not.toMatch(
                /payingTrials\s*(?:[<>]=?|[=!]==)\s*0/,
            );
        }
    });

    it('takes the eligible-now, no-trial-paid and paying-share wording from the timing module, never its own copy', () => {
        for (const surface of SURFACES) {
            const source = sourceOf(surface);
            expect(source, surface).toContain('NEXT_PAYOUT_ELIGIBLE_NOW_TEXT');
            expect(source, surface).toContain('NEXT_PAYOUT_NO_TRIAL_PAID_TEXT');
            expect(source, surface).toContain('nextPayoutEvidenceText(');
            expect(source, surface).not.toMatch(/eligible now['"`]/i);
            expect(source, surface).not.toMatch(
                /No simulated (?:trial reached a )?payout/,
            );
            expect(source, surface).not.toContain('trials reached a payout');
        }
    });
});

describe('one eligible-now caveat on every surface (PT-68e, F-V18)', () => {
    const SURFACES = [
        path.join(
            'src',
            'app',
            '(app)',
            'prop-calculator',
            'accounts',
            '_components',
            'accountValueColumns.ts',
        ),
        path.join(
            'src',
            'app',
            '(app)',
            'prop-calculator',
            'accounts',
            '_components',
            'overview',
            'accountFromStateModel.ts',
        ),
        path.join(
            'src',
            'app',
            '(app)',
            'prop-calculator',
            'accounts',
            '_components',
            'advice',
            'adviceViewModel.ts',
        ),
    ];

    it('never words the live trigger and payout count limits itself', () => {
        for (const surface of SURFACES) {
            const source = readFileSync(
                path.join(process.cwd(), surface),
                'utf8',
            );
            expect(source, surface).not.toMatch(/live trigger/i);
            expect(source, surface).not.toMatch(/payout count/i);
        }
    });

    it('reads the caveat from the timing module on the account list', () => {
        const source = readFileSync(
            path.join(process.cwd(), SURFACES[0] ?? ''),
            'utf8',
        );
        expect(source).toContain('NEXT_PAYOUT_ELIGIBLE_NOW_CAVEAT_TEXT');
    });
});
