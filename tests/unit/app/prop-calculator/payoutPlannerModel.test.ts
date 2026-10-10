import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    payoutBlockReasonText,
    payoutFirmMinimumMessage,
    payoutPathStepText,
    type PayoutPlannerAccountInput,
    type PayoutPlannerImplausibleResult,
    PayoutPlannerResultKind,
    type PayoutPlannerUnreadableResult,
    payoutWaitText,
    PLANNER_LIVE_TRIGGERS_NOT_CHECKED_TEXT,
    planPayoutOutlook,
    planPayoutReadiness,
    simStayCeilingText,
} from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';
import {
    CumulativeAmountTrigger,
    type Dollars,
    dollars,
    findFirm,
    FirmId,
    type LiveTransitionTrigger,
    PayoutCountPerAccountTrigger,
    PayoutCountTotalTrigger,
    PayoutGate,
    PolicySourceKind,
    PolicyVerification,
    postPayoutThreshold,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    AccountReconstructionError,
    AssumptionKind,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    LiveTriggerScope,
    type PayoutBlockReason,
    PayoutBlockReasonKind,
    type PayoutPathStep,
    PayoutWaitBasis,
    ReconstructionErrorReason,
    RetainedCushionBasis,
    wouldTriggerLiveBlockReason,
} from '~/lib/prop-calculator/advisor';
import { ValueResultKind } from '~/lib/prop-calculator/advisor/value';
import {
    MffuVariant,
    type Plan,
    TopStepVariant,
    TradingPhase,
} from '~/lib/prop-calculator/core';

function isUnplanned(
    result: ReturnType<typeof planPayoutReadiness>,
): result is PayoutPlannerImplausibleResult | PayoutPlannerUnreadableResult {
    return (
        result.kind === PayoutPlannerResultKind.Implausible ||
        result.kind === PayoutPlannerResultKind.Unreadable
    );
}

function lowerFundedThresholdTo(threshold: number) {
    const rebuild = AccountReconstruction.rebuild.bind(AccountReconstruction);
    vi.spyOn(AccountReconstruction, 'rebuild').mockImplementation((...args) => {
        const account = rebuild(...args);
        return account.kind === TradingPhase.Funded
            ? {
                  ...account,
                  state: { ...account.state, threshold },
              }
            : account;
    });
}

function plausible(result: ReturnType<typeof planPayoutReadiness>) {
    if (isUnplanned(result)) {
        throw new Error('expected a plausible snapshot');
    }
    return result;
}

function readyCeilingCase(input: Partial<PayoutPlannerAccountInput>) {
    const result = planPayoutReadiness(baseInput(TOPSTEP_50K, input));
    if (result.kind !== PayoutPlannerResultKind.Ready) {
        throw new Error(`expected a ready result, got ${result.kind}`);
    }
    const { state } = result.account;
    const postThreshold = postPayoutThreshold(
        TOPSTEP_50K.fundedDrawdown,
        state,
        TOPSTEP_50K.payoutFloorEffect,
        TOPSTEP_50K.accountSize,
    );
    const postFloor = TOPSTEP_50K.payoutBalanceFloor(
        { ...state, threshold: postThreshold },
        result.retainedCushion.amount,
    );
    return { postFloor, postThreshold, result, state };
}

function requirePlan(value: null | Plan | undefined, message: string): Plan {
    if (value === null || value === undefined) throw new Error(message);
    return value;
}

function specFor(): DocumentedPolicySpec {
    const { policy } = buildEnginePolicy({
        fundedHorizonDays: 60,
        plan: TOPSTEP_50K,
        rulebook: DEFAULT_RULEBOOK,
    });
    return {
        enginePolicy: policy,
        rulebook: DEFAULT_RULEBOOK,
        run: { maxEvalDays: 150, seed: 42, trials: 20 },
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

function stubTriggers(
    plan: Plan,
    triggers: readonly LiveTransitionTrigger[],
): void {
    const firm = findFirm(plan.id.firm);
    if (!firm) throw new Error('firm not registered');
    vi.spyOn(firm.accountPolicy, 'liveTriggersFor').mockReturnValue(triggers);
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
    it('is eligible well past every gate, with the rule-capped withdrawable as a ceiling above the request and a net after split', () => {
        const result = planPayoutReadiness(baseInput(TOPSTEP_50K));
        expect(result.kind).toBe(PayoutPlannerResultKind.Ready);
        if (result.kind !== PayoutPlannerResultKind.Ready) return;
        expect(result.readiness.requestedAmount).toBeGreaterThan(0);
        expect(result.ruleCappedWithdrawable).toBeGreaterThan(0);
        expect(result.ruleCappedWithdrawable).toBeGreaterThanOrEqual(
            result.readiness.requestedAmount,
        );
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

describe('planPayoutReadiness: the ceiling never breaches the post-payout floor', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps the ceiling at or below balance minus the post-payout floor and retained cushion on TopStep', () => {
        const { postFloor, result, state } = readyCeilingCase({});

        expect(result.ruleCappedWithdrawable).toBeGreaterThan(0);
        expect(result.ruleCappedWithdrawable).toBeLessThanOrEqual(
            state.balance - postFloor,
        );
    });

    it('keeps the ceiling at or below balance minus the post-payout floor when the release moves the floor above the current one', () => {
        lowerFundedThresholdTo(TOPSTEP_50K.accountSize - 1500);
        const { postFloor, postThreshold, result, state } = readyCeilingCase({
            balance: dollars(TOPSTEP_50K.accountSize + 3000),
        });

        const { fundedTracker } = result.account;
        if (fundedTracker === null) throw new Error('expected a tracker');
        const engineRoom = fundedTracker.withdrawableNow({
            minRetainedCushion: result.retainedCushion.amount,
            plan: TOPSTEP_50K,
            state,
        });

        expect(postThreshold).toBeGreaterThan(state.threshold);
        expect(engineRoom).toBeGreaterThan(state.balance - postFloor);
        expect(result.ruleCappedWithdrawable).toBeGreaterThan(0);
        expect(result.ruleCappedWithdrawable).toBeLessThanOrEqual(
            state.balance - postFloor,
        );
        expect(result.ruleCappedWithdrawable).toBeLessThan(
            state.balance -
                TOPSTEP_50K.payoutBalanceFloor(
                    state,
                    result.retainedCushion.amount,
                ),
        );
    });
});

describe('planPayoutReadiness: firm minimum above the request (MFF Pro $1,000)', () => {
    it('flags a $500 request against the $1,000 firm minimum', () => {
        const result = planPayoutReadiness(
            baseInput(MFF_PRO_50K, { requestSize: dollars(500) }),
        );
        const notice = isUnplanned(result) ? null : result.firmMinimumNotice;
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
        const notice = isUnplanned(result) ? null : result.firmMinimumNotice;
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
                    payoutsTaken: 2,
                    scope: LiveTriggerScope.Account,
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
                payoutsTaken: 2,
                scope: LiveTriggerScope.Account,
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
            spec: specFor(),
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
            spec: specFor(),
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
            spec: specFor(),
        });
        expect(outlook.stakeComparison).toBeNull();
    });
});

function pricedOutlookOf() {
    const result = planPayoutReadiness(baseInput(TOPSTEP_50K));
    if (result.kind !== PayoutPlannerResultKind.Ready) {
        throw new Error('expected a ready result');
    }
    return planPayoutOutlook({
        account: result.account,
        isEligible: false,
        spec: specFor(),
    });
}

describe('planPayoutOutlook: the priced cumulative trigger is said (PT-36q, F-145)', () => {
    const confirmed = {
        fetchedOn: '2026-09-26',
        quote: 'quote',
        sourceKind: PolicySourceKind.LiveFetch,
        url: 'https://example.invalid/rule',
        verification: PolicyVerification.Confirmed as const,
    };

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('names the confirmed trigger the outlook simulations priced', () => {
        stubTriggers(TOPSTEP_50K, [
            new CumulativeAmountTrigger(dollars(20_000), confirmed),
        ]);
        expect(pricedOutlookOf().cumulativePayoutTrigger).toMatchObject({
            amount: 20_000,
            kind: AssumptionKind.CumulativePayoutTriggerPriced,
            source: {
                fetchedOn: '2026-09-26',
                quote: 'quote',
                url: 'https://example.invalid/rule',
            },
        });
    });

    it('says payouts already taken are not counted, because the planner never supplies them', () => {
        stubTriggers(TOPSTEP_50K, [
            new CumulativeAmountTrigger(dollars(20_000), confirmed),
        ]);
        const note = pricedOutlookOf().pastPayoutsNote;
        expect(note).toContain('already took are not counted');
        expect(note).toContain('$0 paid');
        expect(note).not.toContain('\u{2014}');
    });

    it('says nothing for a firm with no confirmed cumulative trigger', () => {
        const outlook = pricedOutlookOf();
        expect(outlook).not.toHaveProperty('cumulativePayoutTrigger');
        expect(outlook).not.toHaveProperty('pastPayoutsNote');
    });
});

describe('planPayoutReadiness: the payout ceiling to stay simulated from verified triggers (PT-73, F-V26)', () => {
    const confirmed = {
        fetchedOn: '2026-09-26',
        quote: 'quote',
        sourceKind: PolicySourceKind.LiveFetch,
        url: 'https://example.invalid/rule',
        verification: PolicyVerification.Confirmed as const,
    };

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('carries no ceiling for a firm whose triggers are not checked, on a ready and a blocked result', () => {
        const ready = planPayoutReadiness(baseInput(TOPSTEP_50K));
        const blocked = planPayoutReadiness(
            baseInput(TOPSTEP_50K, { qualifyingDaysSinceLastPayout: 0 }),
        );
        for (const result of [ready, blocked]) {
            if (isUnplanned(result)) {
                throw new Error('expected a plausible snapshot');
            }
            expect(result.simStayCeiling).toBeNull();
        }
    });

    it('carries the confirmed cumulative payout limit and its source on a ready and a blocked result', () => {
        stubTriggers(TOPSTEP_50K, [
            new CumulativeAmountTrigger(dollars(20_000), confirmed),
        ]);
        const ready = planPayoutReadiness(baseInput(TOPSTEP_50K));
        const blocked = planPayoutReadiness(
            baseInput(TOPSTEP_50K, { qualifyingDaysSinceLastPayout: 0 }),
        );
        expect(ready.kind).toBe(PayoutPlannerResultKind.Ready);
        expect(blocked.kind).toBe(PayoutPlannerResultKind.Blocked);
        for (const result of [ready, blocked]) {
            if (isUnplanned(result)) {
                throw new Error('expected a plausible snapshot');
            }
            expect(result.simStayCeiling).toStrictEqual({
                cumulativePayoutLimit: 20_000,
                fetchedOn: '2026-09-26',
                sourceUrl: 'https://example.invalid/rule',
            });
        }
    });

    it('carries no ceiling for a cumulative amount the firm pages disagree on', () => {
        stubTriggers(TOPSTEP_50K, [
            new CumulativeAmountTrigger(dollars(20_000), {
                ...confirmed,
                conflicting: { ...confirmed, quote: 'other' },
                verification: PolicyVerification.Conflict,
            }),
        ]);
        const result = planPayoutReadiness(baseInput(TOPSTEP_50K));
        if (isUnplanned(result)) {
            throw new Error('expected a plausible snapshot');
        }
        expect(result.simStayCeiling).toBeNull();
    });

    it('words the ceiling with the firm trigger, its source and date, and that past payouts cannot be subtracted', () => {
        const text = simStayCeilingText({
            cumulativePayoutLimit: dollars(20_000),
            fetchedOn: '2026-09-26',
            sourceUrl: 'https://example.invalid/rule',
        });
        expect(text).toContain('$20,000');
        expect(text).toContain('stay simulated');
        expect(text).toContain('https://example.invalid/rule');
        expect(text).toContain('2026-09-26');
        expect(text).toContain('cannot subtract your past payouts');
        expect(text).toMatch(/^[A-Z]/);
        expect(text).toMatch(/\.$/);
        expect(text).not.toContain(';');
        expect(text).not.toContain('\u{2014}');
    });

    it('says the planner simulations send an account live at the trigger and pay the crossing payout, so a favored size can cross it', () => {
        const text = simStayCeilingText({
            cumulativePayoutLimit: dollars(20_000),
            fetchedOn: '2026-09-26',
            sourceUrl: 'https://example.invalid/rule',
        });
        expect(text).toContain('simulations send an account live');
        expect(text).toContain('counted after the profit split');
        expect(text).toContain('is still paid');
        expect(text).toContain('can cross it');
        expect(text).toContain('not checked against this trigger');
        expect(text).not.toContain('do not apply');
        expect(text).not.toContain('the simulator compares it');
    });

    it('says the firm may count gross payouts, which would put the ceiling lower in what the trader receives', () => {
        const text = simStayCeilingText({
            cumulativePayoutLimit: dollars(20_000),
            fetchedOn: '2026-09-26',
            sourceUrl: 'https://example.invalid/rule',
        });
        expect(text).toContain('gross payouts');
        expect(text).toContain('what you receive after the split and fees');
        expect(text).toContain('lower');
    });
});

describe('planPayoutReadiness: the verified per-account live trigger (PT-36g)', () => {
    const confirmed = {
        fetchedOn: '2026-09-26',
        quote: 'Accounts convert after the third payout.',
        sourceKind: PolicySourceKind.LiveFetch,
        url: 'https://example.invalid/rule',
        verification: PolicyVerification.Confirmed as const,
    };

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('says the next payout goes live, with the firm source, instead of saying the account is eligible', () => {
        stubTriggers(MFF_PRO_50K, [
            new PayoutCountPerAccountTrigger(3, confirmed),
        ]);
        const result = planPayoutReadiness(
            baseInput(MFF_PRO_50K, {
                balance: dollars(MFF_PRO_50K.accountSize + 15_000),
                payoutsTaken: 2,
                requestSize: dollars(1000),
            }),
        );
        expect(result.kind).toBe(PayoutPlannerResultKind.Blocked);
        if (result.kind !== PayoutPlannerResultKind.Blocked) return;
        expect(result.readiness.reason).toMatchObject({
            kind: PayoutBlockReasonKind.WouldTriggerLive,
            trigger: {
                payoutsTaken: 2,
                scope: LiveTriggerScope.Account,
                source: { url: confirmed.url },
                triggerAtPayoutCount: 3,
            },
        });
        expect(result.blockingGateText).toContain(confirmed.url);
    });

    it('stays eligible one payout under the verified trigger', () => {
        stubTriggers(TOPSTEP_50K, [
            new PayoutCountPerAccountTrigger(2, confirmed),
        ]);
        const result = planPayoutReadiness(baseInput(TOPSTEP_50K));
        expect(result.kind).toBe(PayoutPlannerResultKind.Ready);
    });
});

describe('planPayoutReadiness: the live-trigger coverage the planner cannot check (PT-36g)', () => {
    const confirmed = {
        fetchedOn: '2026-09-26',
        quote: 'Accounts convert after the tenth payout at the firm.',
        sourceKind: PolicySourceKind.LiveFetch,
        url: 'https://example.invalid/rule',
        verification: PolicyVerification.Confirmed as const,
    };

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('says the firm-wide count is not checked on a ready and a blocked result when a verified firm total exists', () => {
        stubTriggers(TOPSTEP_50K, [new PayoutCountTotalTrigger(10, confirmed)]);
        const ready = plausible(planPayoutReadiness(baseInput(TOPSTEP_50K)));
        const blocked = plausible(
            planPayoutReadiness(
                baseInput(TOPSTEP_50K, { qualifyingDaysSinceLastPayout: 0 }),
            ),
        );
        expect(ready.kind).toBe(PayoutPlannerResultKind.Ready);
        expect(blocked.kind).toBe(PayoutPlannerResultKind.Blocked);
        expect(ready.liveTriggerNote).toBe(
            PLANNER_LIVE_TRIGGERS_NOT_CHECKED_TEXT,
        );
        expect(blocked.liveTriggerNote).toBe(
            PLANNER_LIVE_TRIGGERS_NOT_CHECKED_TEXT,
        );
    });

    it('says it for a firm whose triggers are not verified', () => {
        const result = plausible(planPayoutReadiness(baseInput(TOPSTEP_50K)));
        expect(result.liveTriggerNote).toBe(
            PLANNER_LIVE_TRIGGERS_NOT_CHECKED_TEXT,
        );
    });

    it('says nothing when every trigger is verified and none needs the firm count', () => {
        stubTriggers(TOPSTEP_50K, [
            new PayoutCountPerAccountTrigger(5, confirmed),
        ]);
        const result = plausible(planPayoutReadiness(baseInput(TOPSTEP_50K)));
        expect(result.liveTriggerNote).toBeNull();
    });

    it('words the note in plain words without an em dash', () => {
        expect(PLANNER_LIVE_TRIGGERS_NOT_CHECKED_TEXT).not.toContain(
            '\u{2014}',
        );
        expect(PLANNER_LIVE_TRIGGERS_NOT_CHECKED_TEXT).toContain('not checked');
    });
});

describe('planPayoutReadiness: a snapshot that cannot be rebuilt (PT-98, F-30)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the typed Unreadable result with the reason for a NaN balance instead of throwing', () => {
        const input = baseInput(TOPSTEP_50K, {
            balance: NaN as Dollars,
        });
        expect(() => planPayoutReadiness(input)).not.toThrow();
        const result = planPayoutReadiness(input);
        if (result.kind !== PayoutPlannerResultKind.Unreadable) {
            throw new Error('expected an unreadable result');
        }
        expect(result.reason).toContain('balance');
    });

    it('returns the typed Unreadable result with the error message for an AccountReconstructionError', () => {
        const message =
            'an EOD trailing drawdown needs the highest EOD balance';
        vi.spyOn(AccountReconstruction, 'rebuild').mockImplementation(() => {
            throw new AccountReconstructionError(
                ReconstructionErrorReason.EodPeakRequired,
                message,
            );
        });
        const result = planPayoutReadiness(baseInput(TOPSTEP_50K));
        expect(result).toEqual({
            kind: PayoutPlannerResultKind.Unreadable,
            reason: message,
        });
    });

    it('still throws an error that is not a bad snapshot', () => {
        vi.spyOn(AccountReconstruction, 'rebuild').mockImplementation(() => {
            throw new TypeError('a bug, not a bad snapshot');
        });
        expect(() => planPayoutReadiness(baseInput(TOPSTEP_50K))).toThrow(
            'a bug, not a bad snapshot',
        );
    });
});
