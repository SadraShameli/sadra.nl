import { describe, expect, it } from 'vitest';

import {
    payoutBlockReasonText,
    payoutFirmMinimumMessage,
    payoutPathStepText,
    type PayoutPlannerAccountInput,
    PayoutPlannerResultKind,
    payoutWaitText,
    planPayoutOutlook,
    planPayoutReadiness,
} from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';
import {
    dollars,
    findFirm,
    FirmId,
    PayoutGate,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    type PayoutBlockReason,
    PayoutBlockReasonKind,
    type PayoutPathStep,
    PayoutWaitBasis,
    RetainedCushionBasis,
    wouldTriggerLiveBlockReason,
} from '~/lib/prop-calculator/advisor';
import { ValueResultKind } from '~/lib/prop-calculator/advisor/value';
import {
    MffuVariant,
    type Plan,
    TopStepVariant,
} from '~/lib/prop-calculator/core';

function requirePlan(value: null | Plan | undefined, message: string): Plan {
    if (value === null || value === undefined) throw new Error(message);
    return value;
}

function specFor(plan: Plan, trials: number): DocumentedPolicySpec {
    const { policy } = buildEnginePolicy({
        fundedHorizonDays: 60,
        plan,
        rulebook: DEFAULT_RULEBOOK,
    });
    return {
        enginePolicy: policy,
        rulebook: DEFAULT_RULEBOOK,
        run: { maxEvalDays: 150, seed: 42, trials },
    };
}

function stepFor(
    path: readonly PayoutPathStep[],
    gate: PayoutPathStep['gate'],
): PayoutPathStep {
    const step = path.find((candidate) => candidate.gate === gate);
    if (step === undefined) {
        throw new Error(`expected a payoutPath step for gate "${gate}"`);
    }
    return step;
}

const TOPSTEP_50K = requirePlan(
    findFirm(FirmId.TopStep)?.findPlanBySerial(
        serializePlanId({
            accountSize: 50_000,
            firm: FirmId.TopStep,
            variant: TopStepVariant.StandardStandard,
        }),
    ),
    'expected the TopStep 50K Standard/Standard plan to resolve',
);

const MFF_PRO_50K = requirePlan(
    findFirm(FirmId.Mffu)?.findPlanBySerial(
        serializePlanId({
            accountSize: 50_000,
            firm: FirmId.Mffu,
            variant: MffuVariant.Pro,
        }),
    ),
    'expected the MFF Pro 50K plan to resolve',
);

function baseInput(
    plan: Plan,
    overrides: Partial<PayoutPlannerAccountInput> = {},
): PayoutPlannerAccountInput {
    return {
        asOf: '2026-06-01',
        balance: dollars(plan.accountSize + 15_000),
        floorAtLastPayout: null,
        lastPayoutOn: null,
        payoutsTaken: 0,
        peak: null,
        plan,
        qualifyingDaysSinceLastPayout: 10,
        requestSize: dollars(750),
        rulebook: DEFAULT_RULEBOOK,
        ...overrides,
    };
}

describe('planPayoutReadiness: implausible snapshots (both mis-entry directions)', () => {
    it('rejects a balance far below the starting floor (looks $0-based)', () => {
        const result = planPayoutReadiness(
            baseInput(TOPSTEP_50K, { balance: dollars(100) }),
        );
        expect(result.kind).toBe(PayoutPlannerResultKind.Implausible);
        if (result.kind !== PayoutPlannerResultKind.Implausible) return;
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.issues[0]?.message).toMatch(/\$0-based/);
    });

    it('rejects a balance far above the account size ceiling', () => {
        const result = planPayoutReadiness(
            baseInput(TOPSTEP_50K, { balance: dollars(500_000) }),
        );
        expect(result.kind).toBe(PayoutPlannerResultKind.Implausible);
        if (result.kind !== PayoutPlannerResultKind.Implausible) return;
        expect(result.issues.length).toBeGreaterThan(0);
        expect(result.issues[0]?.message).toMatch(/account size/);
    });
});

describe('planPayoutReadiness: readiness at the effective request', () => {
    it('is eligible well past every gate, with the rule-capped withdrawable as the primary number and a net after split', () => {
        const result = planPayoutReadiness(baseInput(TOPSTEP_50K));
        expect(result.kind).toBe(PayoutPlannerResultKind.Ready);
        if (result.kind !== PayoutPlannerResultKind.Ready) return;
        expect(result.readiness.requestedAmount).toBeGreaterThan(0);
        expect(result.ruleCappedWithdrawable).toBeGreaterThan(0);
        expect(result.netAfterSplit).toBeGreaterThan(0);
        expect(result.netAfterSplit).toBeLessThan(
            result.readiness.requestedAmount,
        );
    });

    it('does not say no profit or time reaches a nothing-withdrawable block on the blocked result', () => {
        const result = planPayoutReadiness(
            baseInput(TOPSTEP_50K, {
                balance: dollars(TOPSTEP_50K.accountSize + 2000),
                qualifyingDaysSinceLastPayout: 5,
            }),
        );
        if (result.kind !== PayoutPlannerResultKind.Blocked) {
            throw new Error('expected a blocked result');
        }
        expect(result.readiness.reason).toEqual({
            gate: PayoutGate.NothingWithdrawable,
            kind: PayoutBlockReasonKind.Gate,
        });
        expect(result.readiness.wait).toBeNull();
        expect(result.waitText).not.toContain(NO_FURTHER_TEXT);
        expect(result.waitText).toMatch(/^wait: more profit or time/);
    });

    it('reports the blocking gate text and a "wait" message when the day gate is not met', () => {
        const result = planPayoutReadiness(
            baseInput(TOPSTEP_50K, { qualifyingDaysSinceLastPayout: 0 }),
        );
        expect(result.kind).toBe(PayoutPlannerResultKind.Blocked);
        if (result.kind !== PayoutPlannerResultKind.Blocked) return;
        expect(result.readiness.reason.kind).toBe(PayoutBlockReasonKind.Gate);
        expect(result.blockingGateText.length).toBeGreaterThan(0);
        expect(result.waitText).toMatch(/^wait:/);
    });

    it('never reports PayoutPending: the planner has no stored pending payout', () => {
        const result = planPayoutReadiness(
            baseInput(TOPSTEP_50K, { qualifyingDaysSinceLastPayout: 0 }),
        );
        if (result.kind !== PayoutPlannerResultKind.Blocked) {
            throw new Error('expected a blocked result for this scenario');
        }
        expect(result.readiness.reason.kind).not.toBe(
            PayoutBlockReasonKind.PayoutPending,
        );
    });
});

describe('planPayoutReadiness: firm minimum above the request (MFF Pro $1,000)', () => {
    it('flags a $500 request against the $1,000 firm minimum', () => {
        const result = planPayoutReadiness(
            baseInput(MFF_PRO_50K, { requestSize: dollars(500) }),
        );
        const notice =
            result.kind === PayoutPlannerResultKind.Implausible
                ? null
                : result.firmMinimumNotice;
        expect(notice).not.toBeNull();
        if (notice === null) return;
        expect(notice.minimumRequestAmount).toBe(1000);
        expect(notice.requestedAmount).toBe(500);
        expect(payoutFirmMinimumMessage(notice)).toBe(
            'firm minimum $1,000 is above your $500 request',
        );
    });

    it('carries no firm-minimum notice once the request already meets the minimum', () => {
        const result = planPayoutReadiness(
            baseInput(MFF_PRO_50K, { requestSize: dollars(1500) }),
        );
        const notice =
            result.kind === PayoutPlannerResultKind.Implausible
                ? null
                : result.firmMinimumNotice;
        expect(notice).toBeNull();
    });
});

const NO_FURTHER_TEXT = 'no further profit or time reaches this payout';
const TERMINAL_GATES: readonly PayoutGate[] = [
    PayoutGate.AccountConcluded,
    PayoutGate.LadderExhausted,
    PayoutGate.LifetimeDollarCapReached,
];
const CLEARABLE_NULL_WAIT_GATES: readonly PayoutGate[] = [
    PayoutGate.BelowFullRequest,
    PayoutGate.BelowMinRequest,
    PayoutGate.EarlyWithdrawalBelowFloor,
    PayoutGate.EarlyWithdrawalBelowMinimum,
    PayoutGate.FundedConsistency,
    PayoutGate.LadderStepUnaffordable,
    PayoutGate.NothingWithdrawable,
];

describe('planPayoutReadiness: the retained cushion and its basis on the Ready result', () => {
    it('carries the cushion kept and what set it, for the default rulebook', () => {
        const result = planPayoutReadiness(baseInput(TOPSTEP_50K));
        if (result.kind !== PayoutPlannerResultKind.Ready) {
            throw new Error('expected a ready result');
        }
        expect(result.retainedCushion).toEqual({
            amount: DEFAULT_RULEBOOK.payout.retainedCushionCents / 100,
            basis: RetainedCushionBasis.RulebookSize,
        });
    });

    it('names the Hard Rule 2 minimum when the rulebook cushion is below it', () => {
        const result = planPayoutReadiness(
            baseInput(TOPSTEP_50K, {
                rulebook: {
                    ...DEFAULT_RULEBOOK,
                    payout: {
                        ...DEFAULT_RULEBOOK.payout,
                        retainedCushionCents: 1,
                    },
                },
            }),
        );
        if (result.kind !== PayoutPlannerResultKind.Ready) {
            throw new Error('expected a ready result');
        }
        expect(result.retainedCushion.basis).toBe(
            RetainedCushionBasis.HardRule2Default,
        );
        expect(result.retainedCushion.amount).toBeGreaterThan(0.01);
    });
});

describe('payoutWaitText with a block reason: no false claim that nothing can clear the block', () => {
    it.each(TERMINAL_GATES)('keeps the terminal claim for %s', (gate) => {
        expect(
            payoutWaitText(null, { gate, kind: PayoutBlockReasonKind.Gate }),
        ).toContain(NO_FURTHER_TEXT);
    });

    it.each(CLEARABLE_NULL_WAIT_GATES)(
        'never claims no profit or time reaches %s',
        (gate) => {
            const text = payoutWaitText(null, {
                gate,
                kind: PayoutBlockReasonKind.Gate,
            });
            expect(text).not.toContain(NO_FURTHER_TEXT);
            expect(text).toMatch(/^wait: more profit or time/);
        },
    );

    it('never claims it for a pending payout', () => {
        expect(
            payoutWaitText(null, { kind: PayoutBlockReasonKind.PayoutPending }),
        ).not.toContain(NO_FURTHER_TEXT);
    });

    it('keeps the terminal claim for a live-account trigger', () => {
        expect(
            payoutWaitText(
                null,
                wouldTriggerLiveBlockReason({
                    paidPayoutsSinceLastLiveAccount: 2,
                    triggerAtPayoutCount: 3,
                }),
            ),
        ).toContain(NO_FURTHER_TEXT);
    });

    it('prefers a computed wait over the reason', () => {
        expect(
            payoutWaitText(
                { basis: PayoutWaitBasis.Profit, profitStillNeeded: 250 },
                {
                    gate: PayoutGate.AccountConcluded,
                    kind: PayoutBlockReasonKind.Gate,
                },
            ),
        ).toBe('wait: $250 more profit');
    });
});

describe('payoutWaitText', () => {
    const REASON: PayoutBlockReason = {
        gate: PayoutGate.NothingWithdrawable,
        kind: PayoutBlockReasonKind.Gate,
    };

    it('formats each wait basis', () => {
        expect(
            payoutWaitText(
                { basis: PayoutWaitBasis.Profit, profitStillNeeded: 250 },
                REASON,
            ),
        ).toBe('wait: $250 more profit');
        expect(
            payoutWaitText(
                { basis: PayoutWaitBasis.QualifyingDays, daysStillNeeded: 3 },
                REASON,
            ),
        ).toBe('wait: 3 qualifying days');
        expect(
            payoutWaitText(
                { basis: PayoutWaitBasis.CalendarDays, daysStillNeeded: 1 },
                REASON,
            ),
        ).toBe('wait: 1 calendar day');
        expect(
            payoutWaitText({ basis: PayoutWaitBasis.NoClosedForm }, REASON),
        ).toMatch(/^wait:/);
        expect(payoutWaitText(null, REASON)).toMatch(/^wait:/);
    });
});

describe('payoutBlockReasonText', () => {
    it('gives readable text for every gate reason', () => {
        expect(
            payoutBlockReasonText({
                gate: 'below-min-request' as never,
                kind: PayoutBlockReasonKind.Gate,
            }),
        ).toMatch(/minimum request/);
    });

    it('names the trigger count for a would-trigger-live block reason (PT-34b)', () => {
        const text = payoutBlockReasonText(
            wouldTriggerLiveBlockReason({
                paidPayoutsSinceLastLiveAccount: 2,
                triggerAtPayoutCount: 3,
            }),
        );
        expect(text).toContain('2');
        expect(text).toContain('3');
    });
});

describe('planPayoutReadiness: payoutPath (F-V19)', () => {
    it('lists the day-gate step in order with the remaining days when blocked on it', () => {
        const result = planPayoutReadiness(
            baseInput(TOPSTEP_50K, { qualifyingDaysSinceLastPayout: 0 }),
        );
        expect(result.kind).toBe(PayoutPlannerResultKind.Blocked);
        if (
            result.kind !== PayoutPlannerResultKind.Blocked &&
            result.kind !== PayoutPlannerResultKind.Ready
        ) {
            return;
        }
        const dayGate = stepFor(result.path, PayoutGate.DayGateNotMet);
        expect(dayGate.satisfied).toBe(false);
        expect(dayGate.remaining).toBeGreaterThan(0);
    });

    it('marks every gate satisfied, with no remaining dollars or days, once eligible', () => {
        const result = planPayoutReadiness(baseInput(TOPSTEP_50K));
        expect(result.kind).toBe(PayoutPlannerResultKind.Ready);
        if (result.kind !== PayoutPlannerResultKind.Ready) return;
        for (const step of result.path) {
            expect(step.satisfied).toBe(true);
            expect(payoutPathStepText(step)).toMatch(/^done:/);
        }
    });

    it('renders the remaining days for an unsatisfied step in its text', () => {
        const result = planPayoutReadiness(
            baseInput(TOPSTEP_50K, { qualifyingDaysSinceLastPayout: 0 }),
        );
        expect(result.kind).toBe(PayoutPlannerResultKind.Blocked);
        if (result.kind !== PayoutPlannerResultKind.Blocked) return;
        const dayGate = stepFor(result.path, PayoutGate.DayGateNotMet);
        expect(payoutPathStepText(dayGate)).toMatch(/left$/);
    });
});

describe('planPayoutOutlook: PT-32 projection and payoutStakeComparison (F-V19)', () => {
    it('reports the expected days to the next payout and P(bust before payout), with standard errors', () => {
        const result = planPayoutReadiness(baseInput(TOPSTEP_50K));
        expect(result.kind).toBe(PayoutPlannerResultKind.Ready);
        if (result.kind !== PayoutPlannerResultKind.Ready) return;
        const outlook = planPayoutOutlook({
            account: result.account,
            isEligible: true,
            spec: specFor(TOPSTEP_50K, 200),
        });
        expect(
            outlook.projection.expectedCalendarDaysToFirstPayout.value,
        ).toBeGreaterThanOrEqual(0);
        expect(
            outlook.projection.accountLostBeforeFirstPayoutStandardError,
        ).not.toBeNull();
    });

    it('computes payoutStakeComparison (request now vs continue) for an eligible entered state, with SEs', () => {
        const result = planPayoutReadiness(baseInput(TOPSTEP_50K));
        expect(result.kind).toBe(PayoutPlannerResultKind.Ready);
        if (result.kind !== PayoutPlannerResultKind.Ready) return;
        const outlook = planPayoutOutlook({
            account: result.account,
            isEligible: true,
            spec: specFor(TOPSTEP_50K, 200),
        });
        expect(outlook.stakeComparison).not.toBeNull();
        if (outlook.stakeComparison === null) return;
        if (!('requestNow' in outlook.stakeComparison)) {
            throw new Error('expected a modeled payoutStakeComparison result');
        }
        expect(
            outlook.stakeComparison.requestNow.creditInclusive.standardError,
        ).not.toBeNull();
        expect(outlook.stakeComparison.continueNow.kind).toBe(
            ValueResultKind.Value,
        );
    });

    it('omits payoutStakeComparison when the entered state is not eligible yet', () => {
        const result = planPayoutReadiness(
            baseInput(TOPSTEP_50K, { qualifyingDaysSinceLastPayout: 0 }),
        );
        expect(result.kind).toBe(PayoutPlannerResultKind.Blocked);
        if (result.kind !== PayoutPlannerResultKind.Blocked) return;
        const outlook = planPayoutOutlook({
            account: result.account,
            isEligible: false,
            spec: specFor(TOPSTEP_50K, 200),
        });
        expect(outlook.stakeComparison).toBeNull();
    });
});
