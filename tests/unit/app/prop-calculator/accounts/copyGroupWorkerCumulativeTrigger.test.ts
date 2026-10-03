import { describe, expect, it } from 'vitest';

import {
    copyGroupUnpricedTriggerNoteOf,
    type CopyGroupWorkerMember,
    CopyGroupWorkerOutcomeKind,
    simulateGroupOutcomeOf,
} from '~/app/(app)/prop-calculator/_workers/copyGroupWorkerMessages';
import {
    CumulativeAmountTrigger,
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type FundedCycleSeed,
    type LiveTransitionTrigger,
    MffuVariant,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    TradingPhase,
} from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    type DocumentedPolicySpec,
    enginePolicySchema,
    LifetimePayoutCapBasis,
    RebuyLagBasis,
} from '~/lib/prop-calculator/advisor';

const PLAN_SERIAL = serializePlanId({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.RapidEod,
});

const CONFIRMED_SOURCE = {
    fetchedOn: '2026-09-01',
    quote: 'a synthetic test quote',
    sourceKind: PolicySourceKind.LiveFetch,
    url: 'https://example.test/policy',
    verification: PolicyVerification.Confirmed,
} as const;

class StubTriggerPolicy extends FirmAccountPolicy {
    constructor(private readonly triggers: readonly LiveTransitionTrigger[]) {
        super();
    }

    override liveTriggersFor(): readonly LiveTransitionTrigger[] {
        return this.triggers;
    }
}

const SEED: FundedCycleSeed = {
    calendarDayGateProgress: 0,
    cumulativePayout: 0,
    cycleBestDayProfit: 0,
    fundedResetsUsed: 0,
    lastPayoutBalance: 50_000,
    payoutsIssued: 0,
    qualifyingDaysAtLastPayout: 0,
};

const SPEC: DocumentedPolicySpec = {
    enginePolicy: enginePolicySchema.parse({
        commissionPerRoundTrip: 0,
        fundedHorizonDays: 40,
        lifetimePayoutCapBasis: LifetimePayoutCapBasis.LiveTriggersNotChecked,
        lifetimePayoutCapOverride: null,
        payoutRequestOverride: null,
        rebuyLagBasis: RebuyLagBasis.AssumedZero,
        rebuyLagDays: 0,
        retainedCushionRequest: null,
    }),
    rulebook: DEFAULT_RULEBOOK,
    run: { maxEvalDays: 30, seed: 1, trials: 50 },
};

const MEMBER: CopyGroupWorkerMember = {
    firmId: FirmId.Mffu,
    id: 'a',
    optIns: { takesFundedReset: false, takesOneTimeEarlyWithdrawal: false },
    planSerial: PLAN_SERIAL,
    spec: SPEC,
    start: {
        phase: TradingPhase.Funded,
        seed: SEED,
        state: {
            balance: 50_000,
            bestDayProfit: 0,
            consecutiveIdleDays: 0,
            intradayHighProfit: 0,
            peakDayCloseProfit: 0,
            peakIntradayProfit: 0,
            qualifyingDays: 0,
            startingBalance: 50_000,
            threshold: 47_500,
            thresholdLocked: false,
            todayPnL: 0,
            tradingDays: 0,
        },
    },
};

function groupOutputs() {
    const outcome = simulateGroupOutcomeOf({
        members: [MEMBER],
        seed: 42,
        trials: 200,
    });
    if (outcome.kind !== CopyGroupWorkerOutcomeKind.Simulated) {
        throw new Error(`expected a simulated outcome, got ${outcome.kind}`);
    }
    return outcome.result;
}

function withTriggers<T>(
    triggers: readonly LiveTransitionTrigger[],
    run: () => T,
): T {
    const firm = findFirm(FirmId.Mffu) as unknown as {
        accountPolicy: FirmAccountPolicy;
    };
    const original = firm.accountPolicy;
    firm.accountPolicy = new StubTriggerPolicy(triggers);
    try {
        return run();
    } finally {
        firm.accountPolicy = original;
    }
}

describe('the copy-group simulation does not price a confirmed cumulative trigger (PT-36q, F-145)', () => {
    it('gives the same figures with a one-dollar confirmed trigger as without one, so it must not claim to have priced it', () => {
        const without = groupOutputs();
        const tight = withTriggers(
            [new CumulativeAmountTrigger(dollars(1), CONFIRMED_SOURCE)],
            groupOutputs,
        );
        expect(tight).toStrictEqual(without);
    });
});

describe('the copy-group simulation says it does not price the trigger (PT-36r, F-145)', () => {
    const request = { members: [MEMBER], seed: 42, trials: 200 };

    it('names the confirmed amount and says payouts past it are not stopped', () => {
        const note = withTriggers(
            [new CumulativeAmountTrigger(dollars(100_000), CONFIRMED_SOURCE)],
            () => copyGroupUnpricedTriggerNoteOf(request),
        );
        expect(note).toContain('$100,000');
        expect(note).toContain('does not price');
        expect(note).toContain(CONFIRMED_SOURCE.url);
    });

    it('names each distinct amount once when the members sit on different firms or plans', () => {
        const note = withTriggers(
            [new CumulativeAmountTrigger(dollars(100_000), CONFIRMED_SOURCE)],
            () =>
                copyGroupUnpricedTriggerNoteOf({
                    ...request,
                    members: [MEMBER, { ...MEMBER, id: 'b' }],
                }),
        );
        expect(note?.split('$100,000')).toHaveLength(2);
    });

    it('skips a member whose plan cannot be resolved instead of throwing', () => {
        const unresolved = { ...MEMBER, id: 'gone', planSerial: 'no-such-plan' };
        expect(() =>
            copyGroupUnpricedTriggerNoteOf({
                ...request,
                members: [unresolved],
            }),
        ).not.toThrow();
        expect(
            copyGroupUnpricedTriggerNoteOf({
                ...request,
                members: [unresolved],
            }),
        ).toBeNull();
    });

    it('still names the trigger of the members that resolve beside one that does not', () => {
        const unresolved = { ...MEMBER, id: 'gone', planSerial: 'no-such-plan' };
        const note = withTriggers(
            [new CumulativeAmountTrigger(dollars(100_000), CONFIRMED_SOURCE)],
            () =>
                copyGroupUnpricedTriggerNoteOf({
                    ...request,
                    members: [unresolved, MEMBER],
                }),
        );
        expect(note).toContain('$100,000');
    });

    it('says nothing when no member has a confirmed cumulative trigger', () => {
        expect(copyGroupUnpricedTriggerNoteOf(request)).toBeNull();
    });
});
