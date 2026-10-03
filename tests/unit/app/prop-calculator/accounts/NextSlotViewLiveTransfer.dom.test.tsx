import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type DocumentedRunFigures,
    type OverviewOutcome,
    OverviewOutcomeKind,
    type OverviewRequest,
    overviewRequestKey,
    OverviewRequestKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { type OverviewEngine } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import { NextSlotView } from '~/app/(app)/prop-calculator/accounts/next-slot/NextSlotView';
import {
    ALL_FIRMS,
    CumulativeAmountTrigger,
    dollars,
    FirmAccountPolicy,
    PolicySourceKind,
    PolicyVerification,
} from '~/lib/prop-calculator';
import {
    AssumptionBias,
    AssumptionKind,
    assumptionText,
    DEFAULT_RULEBOOK,
    type LiveTransferHazardAssumption,
} from '~/lib/prop-calculator/advisor';
import { LiveTransferContinuationKind } from '~/lib/prop-calculator/simulator';

interface FakeQuery {
    data: unknown;
    error: Error | null;
    isError: boolean;
    isPending: boolean;
}

const TODAY = '2026-09-30';
const USER_ID = 'user-a';

const harness = vi.hoisted(() => {
    const queries = new Map<string, FakeQuery>();
    const pending: FakeQuery = {
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
    };
    return {
        answer: {
            current: undefined as
                | ((request: OverviewRequest) => OverviewOutcome | undefined)
                | undefined,
        },
        queries,
        query: (name: string) => ({
            useQuery: () => queries.get(name) ?? pending,
        }),
    };
});

vi.mock('~/lib/auth/client', () => ({
    useSession: () => ({ data: null, error: null, isPending: false }),
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            account: { list: harness.query('account.list') },
            bankroll: { list: harness.query('bankroll.list') },
            edge: { summary: harness.query('edge.summary') },
            event: { list: harness.query('event.list') },
            fee: { list: harness.query('fee.list') },
            firmEngagement: { list: harness.query('firmEngagement.list') },
            payout: { list: harness.query('payout.list') },
            rulebook: { get: harness.query('rulebook.get') },
        },
    },
}));

vi.mock(
    '~/app/(app)/prop-calculator/accounts/_components/overview/useOverviewWorker',
    () => {
        const engines = new WeakMap<readonly OverviewRequest[], OverviewEngine>();
        return {
            useOverviewWorker: (
                requests: readonly OverviewRequest[],
            ): OverviewEngine => {
                const cached = engines.get(requests);
                if (cached !== undefined) return cached;
                const outcomes = new Map<string, OverviewOutcome>();
                for (const request of requests) {
                    const outcome = harness.answer.current?.(request);
                    if (outcome !== undefined) {
                        outcomes.set(overviewRequestKey(request), outcome);
                    }
                }
                const engine: OverviewEngine = { failure: null, outcomes };
                engines.set(requests, engine);
                return engine;
            },
        };
    },
);

class VerifiedPolicy extends FirmAccountPolicy {
    override liveTriggersFor() {
        return [
            new CumulativeAmountTrigger(dollars(100_000), {
                fetchedOn: '2026-09-20',
                quote: 'a synthetic confirmed quote',
                sourceKind: PolicySourceKind.UserPaste,
                url: 'https://example.test/policy',
                verification: PolicyVerification.Confirmed,
            }),
        ];
    }
}

function answerAll(request: OverviewRequest): OverviewOutcome {
    return {
        key: overviewRequestKey(request),
        kind: OverviewOutcomeKind.Succeeded,
        result:
            request.kind === OverviewRequestKind.DocumentedRun
                ? {
                      figures: documentedFigures(),
                      kind: OverviewRequestKind.DocumentedRun,
                  }
                : {
                      figures: {
                          creditSensitive: false,
                          evaluatedSizes: 5,
                          expectedMonthlyNet: { standardError: 1, value: 320 },
                          expectedMonthlyRealizedNet: {
                              standardError: 1,
                              value: 300,
                          },
                          fundedBustProbability: {
                              standardError: 1,
                              value: 0.4,
                          },
                          requestSize: 750,
                      },
                      kind: OverviewRequestKind.PayoutSizeOptimum,
                  },
    };
}

function answered(data: unknown): FakeQuery {
    return { data, error: null, isError: false, isPending: false };
}

function answerEverything() {
    harness.queries.set('account.list', answered([]));
    harness.queries.set('bankroll.list', answered([]));
    harness.queries.set(
        'edge.summary',
        answered({ summary: { sampleSize: 0 } }),
    );
    harness.queries.set('event.list', answered([]));
    harness.queries.set('fee.list', answered([]));
    harness.queries.set('firmEngagement.list', answered([]));
    harness.queries.set('payout.list', answered([]));
    harness.queries.set('rulebook.get', answered(DEFAULT_RULEBOOK));
}

function documentedFigures(): DocumentedRunFigures {
    return {
        anyPayoutGivenFundedProbability: { standardError: 0, value: 0.5 },
        attemptPassProbability: { standardError: 1, value: 0.3 },
        costPerAttempt: { standardError: 1, value: 100 },
        costPerFundedAccount: 300,
        expectedMonthlyNet: { standardError: 1, value: 300 },
        expectedMonthlyRealizedNet: { standardError: 1, value: 280 },
        expectedNetPerAttempt: { standardError: 1, value: 50 },
        expectedPayoutPerFundedAccount: { standardError: 0, value: 800 },
        fundedBustProbability: { standardError: 1, value: 0.2 },
        fundedHorizonDays: 120,
        fundedPayoutCountDistribution: [0.5, 0.5],
        fundedSurvivalProbability: { standardError: 1, value: 0.55 },
        minRetainedCushion: 2000,
        payoutRequestSize: 500,
        payoutsPerFundedAccount: { standardError: 0, value: 0.5 },
        trials: 2000,
    };
}

const HAZARD: LiveTransferHazardAssumption = {
    bias: AssumptionBias.Neutral,
    continuation: LiveTransferContinuationKind.NotModeled,
    hazard: 0.3,
    kind: AssumptionKind.LiveTransferHazard,
    notes: [],
    sentLiveShare: 0.41,
};

const HAZARD_LINE =
    'Live transfer: 30.0% per paid payout (your assumption, not a firm rule).';

function answerWithHazard(request: OverviewRequest): OverviewOutcome {
    const base = answerAll(request);
    if (base.kind !== OverviewOutcomeKind.Succeeded) return base;
    const { result } = base;
    return {
        ...base,
        result:
            result.kind === OverviewRequestKind.DocumentedRun
                ? {
                      ...result,
                      figures: { ...result.figures, liveTransfer: HAZARD },
                  }
                : result.kind === OverviewRequestKind.PayoutSizeOptimum
                  ? {
                        ...result,
                        figures: { ...result.figures, liveTransfer: HAZARD },
                    }
                  : result,
    };
}

describe('NextSlotView live-transfer hazard lines (PT-73f step 4)', () => {
    let container: HTMLDivElement;
    let root: Root;
    const originals = ALL_FIRMS.map(
        (firm) => [firm, firm.accountPolicy] as const,
    );

    function render() {
        act(() => {
            root.render(<NextSlotView userId={USER_ID} />);
        });
    }

    function rankedLists(): HTMLElement[] {
        return [
            ...container.querySelectorAll<HTMLElement>(
                'ul[aria-label="Live-transfer and payout-trigger assumptions behind this plan"]',
            ),
        ];
    }

    beforeEach(() => {
        vi.useFakeTimers({
            now: new Date(`${TODAY}T12:00:00Z`),
            toFake: ['Date'],
        });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        harness.queries.clear();
        answerEverything();
        for (const firm of ALL_FIRMS) {
            (firm as { accountPolicy: FirmAccountPolicy }).accountPolicy =
                new VerifiedPolicy();
        }
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        for (const [firm, original] of originals) {
            (firm as { accountPolicy: FirmAccountPolicy }).accountPolicy =
                original;
        }
        document.body.replaceChildren();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('names the hazard behind the documented and the optimum figures of every ranked plan that priced one', () => {
        harness.answer.current = answerWithHazard;
        render();

        const lists = rankedLists();
        expect(lists.length).toBeGreaterThan(0);
        for (const list of lists) {
            expect(list.textContent).toContain(
                `Documented policy. ${assumptionText(HAZARD)}`,
            );
            expect(list.textContent).toContain(
                `Payout-size optimum. ${assumptionText(HAZARD)}`,
            );
            expect(list.textContent).toContain(HAZARD_LINE);
        }
    });

    it('prints no live-transfer line for ranked plans whose runs priced no hazard', () => {
        harness.answer.current = answerAll;
        render();

        expect(container.querySelector('table')).not.toBeNull();
        expect(rankedLists()).toHaveLength(0);
        expect(container.textContent).not.toContain('Live transfer');
    });
});
