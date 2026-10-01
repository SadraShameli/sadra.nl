import { describe, expect, it } from 'vitest';

import { payoutPathStepText } from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerModel';
import {
    type OverviewOutcome,
    OverviewOutcomeKind,
    overviewRequestKey,
    OverviewRequestKind,
    overviewRequestsFor,
    type ValueChainFigures,
    type ValueChainStepFigures,
    ValueChainStepOutcomeKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    ChainPositionViewKind,
    chainPositionViewOf,
    fromStateDetailRequestsOf,
    payoutPathLinesOf,
    RetireViewKind,
    retireViewOf,
    valueChainPositionOf,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/fromStateDetail';
import {
    dollars,
    findFirm,
    FirmId,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    type AccountSnapshotInput,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    payoutPath,
    RebuyLagBasis,
    ReconstructedLiveKind,
    resolveDocumentedPayoutRequestSize,
    resolveDocumentedRetainedCushion,
    SizingStage,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import {
    MilestoneKind,
    RetireComparisonBasis,
    RetireComparisonReason,
    type RetireComparisonResult,
    RetireComparisonVerdict,
    ValueChainStepKind,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';

function topStep(): Plan {
    const plan = findFirm(FirmId.TopStep)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.TopStep,
        variant: TopStepVariant.StandardStandard,
    });
    if (!plan) throw new Error('TopStep 50K plan missing');
    return plan;
}

const PLAN = topStep();

const FUNDED: AccountSnapshotInput = {
    asOf: '2026-03-02',
    balance: dollars(52_000),
    dashboardConvention: DashboardBalanceConvention.Nominal,
    firstFundedTradeOn: '2026-01-05',
    highestEodBalance: dollars(52_000),
    highestIntradayBalance: dollars(52_000),
    payoutsTaken: 0,
    stage: SizingStage.Funded,
    tradingDays: 12,
};

function requestsFor(
    input: AccountSnapshotInput,
    measuredRebuyLag: null | { days: number; samples: number } = null,
) {
    return fromStateDetailRequestsOf({
        input,
        measuredRebuyLag,
        plan: PLAN,
        rulebook: DEFAULT_RULEBOOK,
    });
}

const RETIRE_RESULT: RetireComparisonResult = {
    basis: RetireComparisonBasis.Simulator,
    keepRate: { standardError: 0.4, value: 12.345 },
    reason: RetireComparisonReason.NotCapacityBound,
    remainingDays: 200,
    switchCost: 150,
    switchRate: { standardError: 0.6, value: 14.2 },
    verdict: RetireComparisonVerdict.Keep,
};

function chainOutcomeOf(
    key: string,
    chain: string | ValueChainFigures,
): OverviewOutcome {
    return typeof chain === 'string'
        ? { key, kind: OverviewOutcomeKind.Failed, reason: chain }
        : {
              key,
              kind: OverviewOutcomeKind.Succeeded,
              result: {
                  figures: chain,
                  kind: OverviewRequestKind.ValueChain,
              },
          };
}

function chainPositionViewFor(
    accountValue: number,
    chain: null | string | ValueChainFigures,
) {
    const requests = requestsFor(FUNDED);
    if (requests === null) throw new Error('no requests');
    const accountKey = overviewRequestKey(requests.account);
    const accountOutcome: OverviewOutcome = {
        key: accountKey,
        kind: OverviewOutcomeKind.Succeeded,
        result: {
            figures: {
                milestone: {
                    debited: 500,
                    kind: MilestoneKind.Funded,
                    unmetGates: [],
                    value: valueOf(accountValue + 100),
                },
                nextPayout: null,
                stage: SizingStage.Funded,
                startBasis: StartBasis.FromState,
                trials: 2000,
                valueNow: valueOf(accountValue),
            },
            kind: OverviewRequestKind.AccountFromState,
        },
    };
    const chainKey = overviewRequestKey(requests.chain);
    const outcomes = new Map<string, OverviewOutcome>(
        chain === null
            ? [[accountKey, accountOutcome]]
            : [
                  [accountKey, accountOutcome],
                  [chainKey, chainOutcomeOf(chainKey, chain)],
              ],
    );
    return chainPositionViewOf({ failure: null, outcomes }, requests);
}

function engineWith(
    outcome: OverviewOutcome | undefined,
    failure: null | string = null,
) {
    const outcomes = new Map<string, OverviewOutcome>();
    if (outcome !== undefined) outcomes.set(outcome.key, outcome);
    return { failure, outcomes };
}

function retireRequest() {
    const requests = requestsFor(FUNDED);
    if (requests === null) throw new Error('no requests');
    return requests.retire;
}

function valueOf(creditFree: number) {
    return {
        creditFree: { standardError: 5, value: creditFree },
        creditInclusive: { standardError: 5, value: creditFree + 10 },
        kind: ValueResultKind.Value as const,
        seed: 42,
        trials: 2000,
    };
}

describe('fromStateDetailRequestsOf (PT-37, F-87)', () => {
    it('builds an account-from-state, a retire-comparison and a fresh value-chain request from the reconstruction input, with only the spec', () => {
        const requests = requestsFor(FUNDED);
        expect(requests).not.toBeNull();
        expect(requests?.account.kind).toBe(OverviewRequestKind.AccountFromState);
        expect(requests?.retire.kind).toBe(OverviewRequestKind.RetireComparison);
        expect(requests?.chain.kind).toBe(OverviewRequestKind.ValueChain);
        expect(requests?.chain.account).toBeUndefined();
        expect(requests?.chain.spec).toEqual(requests?.account.spec);
        if (requests === null) throw new Error('no requests');
        expect(requests.account.account).toEqual(FUNDED);
        expect(requests.retire.account).toEqual(FUNDED);
        expect(requests.account.spec.start).toBeUndefined();
        expect(structuredClone(requests)).toEqual(requests);
        expect(overviewRequestKey(requests.account)).not.toBe(
            overviewRequestKey(requests.retire),
        );
    });

    it('uses the same documented spec as the fresh documented run of the plan', () => {
        const requests = requestsFor(FUNDED);
        const [documented] = overviewRequestsFor(
            [
                {
                    firmId: FirmId.TopStep,
                    measuredRebuyLag: null,
                    optIns: NO_PLAN_OPT_INS,
                    planSerial: serializePlanId(PLAN.id),
                },
            ],
            DEFAULT_RULEBOOK,
        );
        expect(requests?.account.spec).toEqual(documented?.spec);
    });

    it('carries the measured rebuy lag into the engine policy', () => {
        const requests = requestsFor(FUNDED, { days: 6, samples: 4 });
        expect(requests?.account.spec.enginePolicy.rebuyLagDays).toBe(6);
        expect(requests?.account.spec.enginePolicy.rebuyLagBasis).toBe(
            RebuyLagBasis.Measured,
        );
    });

    it('asks for nothing for an account that is already live: there is no live from-state model', () => {
        expect(requestsFor({ ...FUNDED, stage: SizingStage.Live })).toBeNull();
    });
});

describe('payoutPathLinesOf (PT-37)', () => {
    it('lists the payout path steps of a funded account at the documented request and retained cushion', () => {
        const requests = requestsFor(FUNDED);
        if (requests === null) throw new Error('no requests');
        const account = AccountReconstruction.rebuild(FUNDED, PLAN);
        if (account.kind === ReconstructedLiveKind.Live || account.fundedTracker === null) {
            throw new Error('expected a funded account');
        }
        const { spec } = requests.account;
        const expected = payoutPath(
            account.state,
            account.plan,
            account.fundedTracker,
            resolveDocumentedRetainedCushion(spec.enginePolicy, spec.rulebook.payout),
            resolveDocumentedPayoutRequestSize(
                account.plan,
                spec.enginePolicy,
                spec.rulebook.payout,
            ),
        ).map((step) => payoutPathStepText(step));
        expect(expected.length).toBeGreaterThan(0);
        expect(payoutPathLinesOf(account, spec)).toEqual(expected);
    });

    it('has no payout path for an eval account', () => {
        const evalInput: AccountSnapshotInput = {
            ...FUNDED,
            balance: dollars(50_800),
            highestEodBalance: dollars(50_800),
            highestIntradayBalance: dollars(50_800),
            stage: SizingStage.Eval,
        };
        const requests = requestsFor(evalInput);
        if (requests === null) throw new Error('no requests');
        const account = AccountReconstruction.rebuild(evalInput, PLAN);
        expect(payoutPathLinesOf(account, requests.account.spec)).toBeNull();
    });
});

describe('retireViewOf (PT-37, QV-19 information)', () => {
    it('is pending until the engine answers, and failed when the engine failed', () => {
        expect(retireViewOf(engineWith(undefined), retireRequest())).toEqual({
            kind: RetireViewKind.Pending,
        });
        expect(
            retireViewOf(engineWith(undefined, 'workers are down'), retireRequest()),
        ).toEqual({ kind: RetireViewKind.Failed, reason: 'workers are down' });
    });

    it('turns a refused run into a typed refused view with the engine text', () => {
        const request = retireRequest();
        const outcome: OverviewOutcome = {
            key: overviewRequestKey(request),
            kind: OverviewOutcomeKind.Failed,
            reason: 'the stop is too wide',
        };
        expect(retireViewOf(engineWith(outcome), request)).toEqual({
            kind: RetireViewKind.Refused,
            reason: 'the stop is too wide',
        });
    });

    it('states the comparison as information with both rates, the switch cost, the basis and the reason', () => {
        const request = retireRequest();
        const outcome: OverviewOutcome = {
            key: overviewRequestKey(request),
            kind: OverviewOutcomeKind.Succeeded,
            result: {
                figures: RETIRE_RESULT,
                kind: OverviewRequestKind.RetireComparison,
            },
        };
        const view = retireViewOf(engineWith(outcome), request);
        if (view.kind !== RetireViewKind.Ready) throw new Error('expected ready');
        expect(view.model.keepRate).toBe('$12.35 per day (SE $0.40)');
        expect(view.model.switchRate).toBe('$14.20 per day (SE $0.60)');
        expect(view.model.switchCost).toBe('$150');
        expect(view.model.remainingDays).toBe('200 days');
        expect(view.model.verdict.toLowerCase()).toContain('keep');
        expect(view.model.basis.toLowerCase()).toContain('simulat');
        expect(view.model.reason).not.toBeNull();
        expect(view.model.note.toLowerCase()).toContain('information only');
    });

    it('says a fresh account would beat keeping this one only when the engine says so', () => {
        const request = retireRequest();
        const outcome: OverviewOutcome = {
            key: overviewRequestKey(request),
            kind: OverviewOutcomeKind.Succeeded,
            result: {
                figures: {
                    ...RETIRE_RESULT,
                    reason: null,
                    verdict: RetireComparisonVerdict.SwitchBeatsKeep,
                },
                kind: OverviewRequestKind.RetireComparison,
            },
        };
        const view = retireViewOf(engineWith(outcome), request);
        if (view.kind !== RetireViewKind.Ready) throw new Error('expected ready');
        expect(view.model.verdict.toLowerCase()).toContain('beat');
        expect(view.model.reason).toBeNull();
    });
});

describe('valueChainPositionOf (PT-37, F-V18)', () => {
    function step(kind: ValueChainStepKind, creditFree: number): ValueChainStepFigures {
        return {
            kind,
            outcome: {
                kind: ValueChainStepOutcomeKind.Value,
                value: valueOf(creditFree),
            },
        };
    }

    const chain: ValueChainFigures = {
        steps: [
            step(ValueChainStepKind.EvalStart, 400),
            step(ValueChainStepKind.FreshFunded, 1200),
            step(ValueChainStepKind.FirstPayoutEligible, 2200),
            step(ValueChainStepKind.PostFirstPayout, 2600),
        ],
        trials: 2000,
    };

    it('places the account between the chain steps it is worth more and less than, by credit-free value', () => {
        const position = valueChainPositionOf(valueOf(1800), chain);
        expect(position.above).toEqual(['Eval start', 'Fresh funded']);
        expect(position.below).toEqual([
            'First payout eligible',
            'Post first payout',
        ]);
        expect(position.unavailable).toEqual([]);
    });

    it('puts an account worth more than every step above all of them', () => {
        const position = valueChainPositionOf(valueOf(5000), chain);
        expect(position.below).toEqual([]);
        expect(position.above).toHaveLength(4);
    });

    it('lists a step the engine could not start from as unavailable with its reason, never as above or below', () => {
        const position = valueChainPositionOf(valueOf(1800), {
            ...chain,
            steps: [
                ...chain.steps.slice(0, 3),
                {
                    kind: ValueChainStepKind.PostFirstPayout,
                    outcome: {
                        kind: ValueChainStepOutcomeKind.Unavailable,
                        reason: 'the funded account is already busted',
                    },
                },
            ],
        });
        expect(position.unavailable).toEqual([
            'Post first payout: the funded account is already busted',
        ]);
        expect(position.above).not.toContain('Post first payout');
        expect(position.below).not.toContain('Post first payout');
    });
});


describe('chainPositionViewOf (PT-37, F-V18)', () => {
    const chain: ValueChainFigures = {
        steps: [
            ValueChainStepKind.EvalStart,
            ValueChainStepKind.FreshFunded,
        ].map((kind, index) => ({
            kind,
            outcome: {
                kind: ValueChainStepOutcomeKind.Value as const,
                value: valueOf(400 + index * 800),
            },
        })),
        trials: 2000,
    };

    it('is pending until both the account and the chain have answered', () => {
        expect(chainPositionViewFor(900, null)).toEqual({
            kind: ChainPositionViewKind.Pending,
        });
    });

    it('places the account value among the chain steps when both answered', () => {
        const view = chainPositionViewFor(900, chain);
        if (view.kind !== ChainPositionViewKind.Ready) {
            throw new Error('expected ready');
        }
        expect(view.model.above).toEqual(['Eval start']);
        expect(view.model.below).toEqual(['Fresh funded']);
    });

    it('is unavailable with the engine text when the chain run was refused', () => {
        expect(chainPositionViewFor(900, 'the stop is too wide')).toEqual({
            kind: ChainPositionViewKind.Unavailable,
            reason: 'the stop is too wide',
        });
    });
});
