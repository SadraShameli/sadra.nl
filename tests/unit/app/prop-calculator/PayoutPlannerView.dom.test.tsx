import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    ComputationCache,
    initialFor,
} from '~/app/(app)/prop-calculator/_components/computationCache';
import { ComputationId } from '~/app/(app)/prop-calculator/_components/ComputationId';
import { decodePayoutPlannerUrlState } from '~/app/(app)/prop-calculator/_components/payoutPlanner/payoutPlannerUrlState';
import { ComputationCacheContext } from '~/app/(app)/prop-calculator/_components/useDebouncedSimulation';
import {
    IDLE_WORKER_TASK,
    reduceWorkerTask,
    type WorkerTaskEvent,
    WorkerTaskEventKind,
    type WorkerTaskState,
} from '~/app/(app)/prop-calculator/_components/workerTaskState';
import {
    payoutOutlookCacheKey,
    type PayoutOutlookRequest,
    type PayoutOutlookResult,
    payoutSweepCacheKey,
    type PayoutSweepRequest,
    type PayoutSweepResult,
} from '~/app/(app)/prop-calculator/_workers/payoutSweepWorkerMessages';
import { assumptionLabel } from '~/app/(app)/prop-calculator/accounts/_components/detail/detailState';
import { formatGateCurrency } from '~/lib/format';
import {
    AdviceSource,
    AssumptionKind,
    buildEnginePolicy,
    DEFAULT_RULEBOOK,
    PayoutSizeSweepObjective,
    type PayoutSizeSweepOptimum,
    PayoutSizeSweepResultKind,
    type PayoutSizeSweepRow,
    type PersonalPayoutOverrideWarning,
    type RulebookParameters,
    runPayoutSizeSweep,
} from '~/lib/prop-calculator/advisor';
import {
    type PayoutStakeComparisonResult,
    ValueResultKind,
    ValueUnavailableReason,
} from '~/lib/prop-calculator/advisor/value';
import { effectivePayoutRequest } from '~/lib/prop-calculator/core';
import { PayoutPlannerUrlParameter } from '~/lib/schemas/payoutPlannerUrlParameter';

type AnyEvent = WorkerTaskEvent<never, unknown>;
type AnyRequest = PayoutOutlookRequest | PayoutSweepRequest;

interface FakeInstance {
    dispatch: (event: AnyEvent) => void;
    runId: number;
}

interface RulebookQueryState {
    data: RulebookParameters | undefined;
    isError: boolean;
}

interface SessionState {
    data: null | { user: { id: string } };
    error: Error | null;
    isPending: boolean;
}

const fakeWorker = vi.hoisted(() => ({
    latest: {} as Record<'outlook' | 'sweep', FakeInstance | undefined>,
    outlookRequests: [] as unknown[],
    sweepRequests: [] as unknown[],
}));

const searchState = vi.hoisted(() => ({ query: '' }));

const sessionState = vi.hoisted((): { current: SessionState } => ({
    current: { data: null, error: null, isPending: false },
}));

const rulebookQueryState = vi.hoisted((): { current: RulebookQueryState } => ({
    current: { data: undefined, isError: false },
}));

vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(searchState.query),
}));

vi.mock('~/lib/auth/client', () => ({
    useSession: () => sessionState.current,
}));

vi.mock('~/trpc/react', () => ({
    api: {
        propAccounts: {
            rulebook: {
                get: { useQuery: () => rulebookQueryState.current },
            },
        },
    },
}));

vi.mock('~/app/(app)/prop-calculator/_components/ToolPageHeading', () => ({
    ToolPageHeading: renderNothing,
}));

vi.mock('~/app/(app)/prop-calculator/_components/FirmPlanPicker', () => ({
    default: renderNothing,
}));

vi.mock('~/app/(app)/prop-calculator/_components/useWorkerTask', async () => {
    const React = await import('react');
    return {
        useWorkerTask: () => {
            const [state, dispatch] = React.useReducer<
                WorkerTaskState<never, unknown>,
                [WorkerTaskEvent<never, unknown>]
            >(reduceWorkerTask, IDLE_WORKER_TASK);
            const instanceReference = React.useRef({
                dispatch,
                runId: 0,
            });
            const run = React.useCallback((request: AnyRequest) => {
                const instance = instanceReference.current;
                instance.runId += 1;
                if ('balance' in request) {
                    fakeWorker.outlookRequests.push(request);
                    fakeWorker.latest.outlook = instance;
                } else {
                    fakeWorker.sweepRequests.push(request);
                    fakeWorker.latest.sweep = instance;
                }
                dispatch({
                    kind: WorkerTaskEventKind.Start,
                    runId: instance.runId,
                });
            }, []);
            const cancel = React.useCallback(() => {
                dispatch({ kind: WorkerTaskEventKind.Cancel });
            }, []);
            return { cancel, run, state };
        },
    };
});

const { PayoutPlannerView } =
    await import('~/app/(app)/prop-calculator/(tools)/payout-planner/PayoutPlannerView');

const BASE_OPTIMUM = buildBaseOptimum();
const FIX_FIELD_TEXT = 'Fix the highlighted field to see the readiness.';
const SKELETON = '.animate-pulse';
const SETTLE_MS = 1000;
const READY_QUERY = [
    `${PayoutPlannerUrlParameter.Plan}=tpt-50000`,
    `${PayoutPlannerUrlParameter.QualifyingDays}=10`,
    `${PayoutPlannerUrlParameter.Balance}=54000`,
    `${PayoutPlannerUrlParameter.Peak}=54000`,
].join('&');
const FIRM_MINIMUM_QUERY = [
    `${PayoutPlannerUrlParameter.Plan}=alphafutures-50000-advanced`,
    `${PayoutPlannerUrlParameter.QualifyingDays}=10`,
    `${PayoutPlannerUrlParameter.Balance}=54000`,
    `${PayoutPlannerUrlParameter.Peak}=54000`,
].join('&');
const FUNDED_CONSISTENCY_QUERY = [
    `${PayoutPlannerUrlParameter.QualifyingDays}=5`,
    `${PayoutPlannerUrlParameter.Balance}=52000`,
].join('&');
const SIGNED_IN: SessionState = {
    data: { user: { id: 'user-1' } },
    error: null,
    isPending: false,
};

function buildBaseOptimum(): PayoutSizeSweepOptimum {
    const { plan } = decodePayoutPlannerUrlState(new URLSearchParams());
    const { policy } = buildEnginePolicy({
        fundedHorizonDays: 60,
        plan,
        rulebook: DEFAULT_RULEBOOK,
    });
    const result = runPayoutSizeSweep(plan, {
        personalOverrideRequest: null,
        source: AdviceSource.PayoutSizeSweep,
        spec: {
            enginePolicy: policy,
            rulebook: DEFAULT_RULEBOOK,
            run: { maxEvalDays: 150, seed: 1, trials: 20 },
        },
    });
    if (result.kind !== PayoutSizeSweepResultKind.Optimum) {
        throw new Error('the fixture sweep must find an optimum');
    }
    return result.optimum;
}

function documentedRow(): PayoutSizeSweepRow {
    const { plan } = decodePayoutPlannerUrlState(new URLSearchParams());
    const size = effectivePayoutRequest(
        plan,
        DEFAULT_RULEBOOK.payout.requestCents / 100,
    );
    const row = BASE_OPTIMUM.rows.find(
        (candidate) => candidate.requestSize === size,
    );
    if (row === undefined) throw new Error('no documented row in the sweep');
    return row;
}

function finish(kind: 'outlook' | 'sweep', result: unknown) {
    const instance = fakeWorker.latest[kind];
    if (instance === undefined) throw new Error(`no ${kind} run`);
    act(() => {
        instance.dispatch({
            kind: WorkerTaskEventKind.Done,
            result,
            runId: instance.runId,
        });
    });
}

function inputById(container: HTMLElement, id: string): HTMLInputElement {
    const node = container.querySelector<HTMLInputElement>(`#${id}`);
    if (node === null) throw new Error(`no input #${id}`);
    return node;
}

function lastOutlookRequest(): PayoutOutlookRequest {
    const request = fakeWorker.outlookRequests.at(-1);
    if (request === undefined) throw new Error('the outlook never ran');
    return request as PayoutOutlookRequest;
}

function lastSweepRequest(): PayoutSweepRequest {
    const request = fakeWorker.sweepRequests.at(-1);
    if (request === undefined) throw new Error('the sweep never ran');
    return request as PayoutSweepRequest;
}

function outlookResult(
    stakeComparison: PayoutOutlookResult['stakeComparison'] = null,
): PayoutOutlookResult {
    return {
        projection: {
            accountLostBeforeFirstPayoutProbability: 0.25,
            accountLostBeforeFirstPayoutStandardError: 0.01,
            expectedCalendarDaysToFirstPayout: {
                standardError: 0.5,
                value: 12.3,
            },
            expectedResetFeeBeforeFirstPayout: { standardError: 0, value: 0 },
            expectedSessionDaysToFirstPayout: { standardError: 0, value: 9 },
            firstPayoutCausedBreachProbability: null,
            firstPayoutCausedBreachStandardError: null,
            payingTrials: 100,
            trials: 200,
        },
        stakeComparison,
    };
}

function renderNothing(): null {
    return null;
}

function rowWith(
    row: PayoutSizeSweepRow,
    patch: { bust?: number; requestSize?: number },
): PayoutSizeSweepRow {
    return {
        ...row,
        out: {
            ...row.out,
            fundedBustProbability: patch.bust ?? row.out.fundedBustProbability,
        },
        requestSize: patch.requestSize ?? row.requestSize,
    } as PayoutSizeSweepRow;
}

function setInputValue(input: HTMLInputElement, value: string) {
    Reflect.set(HTMLInputElement.prototype, 'value', value, input);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function settle() {
    act(() => {
        vi.advanceTimersByTime(SETTLE_MS);
    });
}

function stakeComparison(
    requestNowValue: number,
    continueValue: number,
    standardError: number,
): PayoutStakeComparisonResult {
    return {
        continueNow: {
            creditFree: { standardError, value: continueValue },
            creditInclusive: { standardError, value: continueValue },
            kind: ValueResultKind.Value,
            seed: 1,
            trials: 100,
        },
        kind: ValueResultKind.PayoutStake,
        reducedRiskWhatIf: null,
        requestedAmount: 500,
        requestNow: {
            creditFree: { standardError, value: requestNowValue },
            creditInclusive: { standardError, value: requestNowValue },
        },
        traderReceivesNow: 400,
    };
}

function sweepResult(patch: Partial<PayoutSizeSweepOptimum> = {}) {
    return {
        kind: PayoutSizeSweepResultKind.Optimum,
        optimum: {
            ...BASE_OPTIMUM,
            objective: PayoutSizeSweepObjective.CreditInclusiveMonthlyNet,
            ...patch,
        },
    } satisfies PayoutSweepResult;
}

function sweepResultWithOverride(
    requestSize: number,
    bust?: number,
    warning: null | PersonalPayoutOverrideWarning = null,
) {
    return sweepResult({
        personalOverride: {
            row: rowWith(documentedRow(), { bust, requestSize }),
            warning,
        },
    });
}

function withCache(cache: ComputationCache): ReactNode {
    return (
        <ComputationCacheContext.Provider value={cache}>
            <PayoutPlannerView />
        </ComputationCacheContext.Provider>
    );
}

describe('PayoutPlannerView (PT-31e)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(node: ReactNode) {
        act(() => {
            root.render(node);
        });
    }

    function sectionOf(heading: string): HTMLElement {
        const section = [...container.querySelectorAll('section')].find(
            (candidate) =>
                candidate.querySelector('h2')?.textContent === heading,
        );
        if (section === undefined) throw new Error(`no section ${heading}`);
        return section;
    }

    function typeInto(id: string, value: string) {
        act(() => {
            setInputValue(inputById(container, id), value);
        });
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        searchState.query = '';
        sessionState.current = { data: null, error: null, isPending: false };
        rulebookQueryState.current = { data: undefined, isError: false };
        fakeWorker.latest = { outlook: undefined, sweep: undefined };
        fakeWorker.outlookRequests = [];
        fakeWorker.sweepRequests = [];
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    describe('input gating', () => {
        it('shows the readiness result and the path while every field is valid', () => {
            render(<PayoutPlannerView />);

            expect(container.textContent).not.toContain(FIX_FIELD_TEXT);
            expect(
                sectionOf('Path to payout').querySelectorAll('li').length,
            ).toBeGreaterThan(0);
        });

        it('replaces the readiness and the path to payout with the fix-the-field text for an invalid balance', () => {
            render(<PayoutPlannerView />);

            typeInto('payout-planner-balance', '0');

            expect(sectionOf('Readiness').textContent).toContain(
                FIX_FIELD_TEXT,
            );
            expect(sectionOf('Path to payout').textContent).toContain(
                FIX_FIELD_TEXT,
            );
            expect(
                sectionOf('Path to payout').querySelectorAll('li'),
            ).toHaveLength(0);
            expect(
                inputById(container, 'payout-planner-balance').getAttribute(
                    'aria-invalid',
                ),
            ).toBe('true');
        });

        it('restores the result once the invalid field is corrected', () => {
            render(<PayoutPlannerView />);

            typeInto('payout-planner-balance', '0');
            typeInto('payout-planner-balance', '51000');

            expect(container.textContent).not.toContain(FIX_FIELD_TEXT);
            expect(
                sectionOf('Path to payout').querySelectorAll('li').length,
            ).toBeGreaterThan(0);
        });

        it('replaces the sweep and its override note with the fix-the-field text for an invalid request size, and keeps the sweep for an invalid balance', () => {
            searchState.query = `${PayoutPlannerUrlParameter.RequestSize}=6000`;
            render(<PayoutPlannerView />);
            finish('sweep', sweepResultWithOverride(6000));
            expect(sectionOf('Payout-size sweep').textContent).toContain(
                'Your entered size: $6,000',
            );

            typeInto('payout-planner-balance', '0');
            expect(sectionOf('Payout-size sweep').textContent).toContain(
                'Your entered size: $6,000',
            );

            typeInto('payout-planner-request', '0');
            expect(sectionOf('Payout-size sweep').textContent).toContain(
                FIX_FIELD_TEXT,
            );
            expect(sectionOf('Payout-size sweep').textContent).not.toContain(
                'Your entered size',
            );
        });
    });

    describe('rulebook gating', () => {
        const LOADING_TEXT = 'Loading your rulebook.';
        const FAILED_TEXT =
            'Your rulebook could not be loaded, so no payout figures are shown.';

        it('runs no worker and shows a loading state while the session is pending', () => {
            sessionState.current = {
                data: null,
                error: null,
                isPending: true,
            };

            render(<PayoutPlannerView />);
            settle();

            expect(fakeWorker.sweepRequests).toHaveLength(0);
            expect(fakeWorker.outlookRequests).toHaveLength(0);
            expect(sectionOf('Readiness').textContent).toContain(LOADING_TEXT);
            expect(sectionOf('Path to payout').textContent).toContain(
                LOADING_TEXT,
            );
            expect(sectionOf('Payout-size sweep').textContent).toContain(
                LOADING_TEXT,
            );
        });

        it('runs no worker and shows a loading state while a signed-in rulebook query is pending, then runs on the personal rulebook', () => {
            sessionState.current = SIGNED_IN;

            render(<PayoutPlannerView />);
            settle();

            expect(fakeWorker.sweepRequests).toHaveLength(0);
            expect(fakeWorker.outlookRequests).toHaveLength(0);
            expect(sectionOf('Readiness').textContent).toContain(LOADING_TEXT);

            const personal = {
                ...DEFAULT_RULEBOOK,
                strategy: { ...DEFAULT_RULEBOOK.strategy, winrate: 0.55 },
            };
            rulebookQueryState.current = { data: personal, isError: false };
            render(<PayoutPlannerView />);
            settle();

            expect(lastSweepRequest().spec.rulebook.strategy.winrate).toBe(
                0.55,
            );
            expect(lastOutlookRequest().spec.rulebook.strategy.winrate).toBe(
                0.55,
            );
            expect(container.textContent).not.toContain(LOADING_TEXT);
        });

        it('runs no worker and names the failure when the signed-in rulebook query fails', () => {
            sessionState.current = SIGNED_IN;
            rulebookQueryState.current = { data: undefined, isError: true };

            render(<PayoutPlannerView />);
            settle();

            expect(fakeWorker.sweepRequests).toHaveLength(0);
            expect(fakeWorker.outlookRequests).toHaveLength(0);
            expect(sectionOf('Readiness').textContent).toContain(FAILED_TEXT);
            expect(sectionOf('Payout-size sweep').textContent).toContain(
                FAILED_TEXT,
            );
        });

        it('runs no worker and names the failure when the session cannot be read', () => {
            sessionState.current = {
                data: null,
                error: new Error('no session'),
                isPending: false,
            };

            render(<PayoutPlannerView />);
            settle();

            expect(fakeWorker.sweepRequests).toHaveLength(0);
            expect(sectionOf('Readiness').textContent).toContain(FAILED_TEXT);
        });

        it('uses the default rulebook for a signed-out user without waiting', () => {
            render(<PayoutPlannerView />);

            expect(lastSweepRequest().spec.rulebook).toEqual(DEFAULT_RULEBOOK);
        });
    });

    describe('payout readiness result', () => {
        it('headlines the effective request with its net after the split, the retained cushion and its source, and demotes the maximum withdrawable', () => {
            searchState.query = READY_QUERY;

            render(<PayoutPlannerView />);

            const readiness = sectionOf('Readiness');
            expect(readiness.querySelector('.text-2xl')?.textContent).toBe(
                '$500',
            );
            expect(readiness.textContent).toContain(
                'Net after the payout split on $500',
            );
            expect(readiness.textContent).toContain('$400');
            expect(readiness.textContent).toContain(
                'Minimum cushion kept: $2,000 (rulebook size)',
            );
            expect(readiness.textContent).toContain(
                'Maximum withdrawable above the cushion: $2,000',
            );
            expect(readiness.textContent).toContain(
                'not a recommendation: draining it is the mid-size danger zone',
            );
        });

        it('says under the cushion that the peak is assumed when it is blank on a trailing-drawdown plan', () => {
            searchState.query = READY_QUERY.replace(
                `&${PayoutPlannerUrlParameter.Peak}=54000`,
                '',
            );

            render(<PayoutPlannerView />);

            const readiness = sectionOf('Readiness').textContent;
            expect(readiness).toContain('Minimum cushion kept');
            expect(readiness).toContain(
                'No peak balance was entered, so the current balance is assumed to be the peak',
            );
        });

        it('does not say the peak is assumed in the readiness once it is entered', () => {
            searchState.query = READY_QUERY;

            render(<PayoutPlannerView />);

            expect(sectionOf('Readiness').textContent).not.toContain(
                'No peak balance was entered',
            );
        });

        it('says the Hard Rule 2 minimum is waived when the rulebook keeps a smaller cushion', () => {
            searchState.query = READY_QUERY;
            rulebookQueryState.current = {
                data: {
                    ...DEFAULT_RULEBOOK,
                    payout: {
                        ...DEFAULT_RULEBOOK.payout,
                        allowBelowHardRule2: true,
                        retainedCushionCents: 50_000,
                    },
                },
                isError: false,
            };
            sessionState.current = SIGNED_IN;

            render(<PayoutPlannerView />);

            const readiness = sectionOf('Readiness').textContent;
            expect(readiness).toContain('Minimum cushion kept: $500');
            expect(readiness).toContain('below the $2,000 Hard Rule 2 minimum');
        });

        it('says nothing about a Hard Rule 2 waiver when the cushion meets the minimum', () => {
            searchState.query = READY_QUERY;

            render(<PayoutPlannerView />);

            expect(sectionOf('Readiness').textContent).not.toContain(
                'Hard Rule 2 minimum',
            );
        });

        it('headlines the firm minimum, not the entered size, when the plan minimum is higher', () => {
            searchState.query = FIRM_MINIMUM_QUERY;

            render(<PayoutPlannerView />);

            const readiness = sectionOf('Readiness');
            expect(readiness.querySelector('.text-2xl')?.textContent).toBe(
                '$1,000',
            );
            expect(readiness.textContent).toContain(
                'firm minimum $1,000 is above your $500 request',
            );
            expect(readiness.textContent).toContain(
                'Net after the payout split on $1,000',
            );
        });

        it('states the day gate wait for an account that has not met it', () => {
            render(<PayoutPlannerView />);

            expect(sectionOf('Readiness').textContent).toContain(
                'wait: 5 qualifying days',
            );
        });

        it('does not claim that no profit or time can reach a funded-consistency block', () => {
            searchState.query = FUNDED_CONSISTENCY_QUERY;

            render(<PayoutPlannerView />);

            const readiness = sectionOf('Readiness').textContent;
            expect(readiness).toContain(
                'the funded consistency rule is currently violated',
            );
            expect(readiness).toContain('no closed-form estimate');
            expect(readiness).not.toContain(
                'no further profit or time reaches this payout',
            );
        });
    });

    describe('payout path list', () => {
        it('lists one line per path step of the readiness model', () => {
            searchState.query = READY_QUERY;
            render(<PayoutPlannerView />);

            const items = [
                ...sectionOf('Path to payout').querySelectorAll('li'),
            ];

            expect(items.length).toBeGreaterThan(0);
            expect(items.map((item) => item.textContent)).toContain(
                'done: the day gate since the last pass or payout has not been met yet',
            );
        });
    });

    describe('outlook section', () => {
        it('shows a skeleton while the outlook worker runs, then the projection', () => {
            render(<PayoutPlannerView />);
            expect(
                sectionOf('Path to payout').querySelector(SKELETON),
            ).not.toBeNull();

            finish('outlook', outlookResult());

            const text = sectionOf('Path to payout').textContent;
            expect(
                sectionOf('Path to payout').querySelector(SKELETON),
            ).toBeNull();
            expect(text).toContain('Expected days to the next payout');
            expect(text).toContain('12.3 days (±0.5)');
            expect(text).toContain('P(account lost before the next payout)');
            expect(text).not.toContain('before the first payout');
            expect(text).toContain('25.0% (±1.0%)');
        });

        it('shows the worker failure reason instead of a skeleton', () => {
            render(<PayoutPlannerView />);
            const instance = fakeWorker.latest.outlook;
            if (instance === undefined) throw new Error('no outlook run');

            act(() => {
                instance.dispatch({
                    kind: WorkerTaskEventKind.Failed,
                    reason: 'The background worker failed.',
                    runId: instance.runId,
                });
            });

            expect(sectionOf('Path to payout').textContent).toContain(
                'The background worker failed.',
            );
        });

        it('shows the requested amount, the gap with its standard error and a within-noise label for the stake comparison', () => {
            searchState.query = READY_QUERY;
            render(<PayoutPlannerView />);

            finish('outlook', outlookResult(stakeComparison(1500, 1450, 80)));

            const text = sectionOf('Path to payout').textContent;
            expect(text).toContain('Request now vs continue trading');
            expect(text).toContain('Requested now: $500 (you receive $400');
            expect(text).toContain('Request now: $1,500 (±$80)');
            expect(text).toContain('Continue: $1,450 (±$80)');
            expect(text).toContain(
                'Difference (request now minus continue): $50 (±$113.14)',
            );
            expect(text).toContain('within simulation noise');
        });

        it('labels a gap beyond the noise', () => {
            searchState.query = READY_QUERY;
            render(<PayoutPlannerView />);

            finish('outlook', outlookResult(stakeComparison(2500, 1000, 50)));

            expect(sectionOf('Path to payout').textContent).toContain(
                'beyond simulation noise',
            );
        });

        it('explains a not-modeled stake comparison instead of hiding it', () => {
            searchState.query = READY_QUERY;
            render(<PayoutPlannerView />);

            finish(
                'outlook',
                outlookResult({
                    kind: ValueResultKind.NotModeled,
                    reason: ValueUnavailableReason.LiveNotModeled,
                }),
            );

            expect(sectionOf('Path to payout').textContent).toContain(
                'Request now vs continue trading is not modeled for a live account.',
            );
        });
    });

    describe('payout-size sweep and the personal-override note', () => {
        it('states that the sweep is a fresh account, not the account entered above, and shows its simulation basis', () => {
            render(<PayoutPlannerView />);
            finish('sweep', sweepResult());

            const text = sectionOf('Payout-size sweep').textContent;
            expect(text).toContain(
                'Simulated from a fresh account at your rulebook strategy',
            );
            expect(text).toContain(
                'does not use the balance, peak or payouts taken entered above',
            );
            expect(text).toContain('Engine optimum, not advice');
        });

        it('marks the documented rule row and the engine optimum row separately', () => {
            render(<PayoutPlannerView />);
            const documented = documentedRow();
            const winner = rowWith(
                BASE_OPTIMUM.rows.find(
                    (row) => row.requestSize !== documented.requestSize,
                ) ?? documented,
                {},
            );
            finish('sweep', sweepResult({ winner }));

            const rows = [
                ...sectionOf('Payout-size sweep').querySelectorAll(
                    ':scope tbody tr',
                ),
            ];
            const documentedText = rows.find((row) =>
                row.textContent.includes('Documented rule'),
            )?.textContent;
            const winnerText = rows.find((row) =>
                row.textContent.includes('Engine optimum'),
            )?.textContent;
            expect(documentedText).toContain(
                formatGateCurrency(documented.requestSize),
            );
            expect(winnerText).toContain(
                formatGateCurrency(winner.requestSize),
            );
            expect(documentedText).not.toBe(winnerText);
        });

        it('explains an engine optimum that differs from the documented rule, with both bust probabilities', () => {
            render(<PayoutPlannerView />);
            const documented = documentedRow();
            const other = BASE_OPTIMUM.rows.find(
                (row) => row.requestSize !== documented.requestSize,
            );
            if (other === undefined) throw new Error('no second sweep row');
            const winner = rowWith(other, { bust: 0.9 });
            finish(
                'sweep',
                sweepResult({
                    creditSensitive: true,
                    winner,
                }),
            );

            const text = sectionOf('Payout-size sweep').textContent;
            expect(text).toContain(
                `Engine optimum: ${formatGateCurrency(winner.requestSize)}`,
            );
            expect(text).toContain('90.0% bust probability');
            expect(text).toContain('at the documented size');
            expect(text).toContain(
                'The credit-free ranking prefers a different size',
            );
            expect(text).toContain(
                'has a higher bust probability than the documented rule',
            );
        });

        it('warns about the mid-size danger zone when the optimum is a mid-size request', () => {
            render(<PayoutPlannerView />);
            const documented = documentedRow();
            const winner = rowWith(documented, { requestSize: 1500 });
            finish('sweep', sweepResult({ winner }));

            expect(sectionOf('Payout-size sweep').textContent).toContain(
                'Mid-size requests ($1,000 to $2,000)',
            );
        });

        it('does not warn when the optimum is the documented rule', () => {
            render(<PayoutPlannerView />);
            finish('sweep', sweepResult({ winner: documentedRow() }));

            const text = sectionOf('Payout-size sweep').textContent;
            expect(text).toContain(
                'The engine optimum is the documented request size.',
            );
            expect(text).not.toContain('Mid-size requests');
            expect(text).not.toContain('higher bust probability');
        });

        it('shows the firm-minimum note on a row that merged sizes up to the minimum', () => {
            render(<PayoutPlannerView />);
            const documented = documentedRow();
            const merged: PayoutSizeSweepRow = {
                ...documented,
                firmMinimumAboveRequest: {
                    minimum: documented.requestSize,
                    requested: 500,
                },
                requestedSizes: [500, 750],
            };
            finish(
                'sweep',
                sweepResult({
                    rows: BASE_OPTIMUM.rows.map((row) =>
                        row.requestSize === documented.requestSize
                            ? merged
                            : row,
                    ),
                    winner: merged,
                }),
            );

            const text = sectionOf('Payout-size sweep').textContent;
            expect(text).toContain(
                `firm minimum ${formatGateCurrency(documented.requestSize)} is above the $500 size`,
            );
            expect(text).toContain('covers $500, $750');
        });

        it('shows the personal-override note with the safe-band warning when the entry differs from the documented size', () => {
            searchState.query = `${PayoutPlannerUrlParameter.RequestSize}=6000`;
            render(<PayoutPlannerView />);
            expect(
                sectionOf('Payout-size sweep').querySelector(SKELETON),
            ).not.toBeNull();

            finish(
                'sweep',
                sweepResultWithOverride(6000, 0.6, {
                    optimumBustProbability: 0.2,
                    optimumMonthlyNet: 400,
                    overrideBustProbability: 0.6,
                    overrideMonthlyNet: 300,
                }),
            );

            const text = sectionOf('Payout-size sweep').textContent;
            expect(text).toContain('Your entered size: $6,000');
            expect(text).toContain('Outside the safe band');
            expect(text).toContain('60.0% bust');
            expect(text).toContain('20.0% at the optimum');
        });

        it('omits the override note when the sweep has no personal override', () => {
            searchState.query = `${PayoutPlannerUrlParameter.RequestSize}=6000`;
            render(<PayoutPlannerView />);

            finish('sweep', sweepResult({ personalOverride: null }));

            expect(sectionOf('Payout-size sweep').textContent).not.toContain(
                'Your entered size',
            );
        });

        it('omits the override note when the entry equals the documented size', () => {
            render(<PayoutPlannerView />);

            finish(
                'sweep',
                sweepResult({
                    personalOverride: {
                        row: documentedRow(),
                        warning: null,
                    },
                }),
            );

            expect(sectionOf('Payout-size sweep').textContent).not.toContain(
                'Your entered size',
            );
        });

        it('prints the entered size and the firm minimum that raised it', () => {
            searchState.query = [
                FIRM_MINIMUM_QUERY,
                `${PayoutPlannerUrlParameter.RequestSize}=750`,
            ].join('&');
            render(<PayoutPlannerView />);
            const override: PayoutSizeSweepRow = {
                ...documentedRow(),
                firmMinimumAboveRequest: { minimum: 1000, requested: 750 },
                requestedSizes: [750],
                requestSize: 1000,
            };

            finish(
                'sweep',
                sweepResult({
                    personalOverride: { row: override, warning: null },
                }),
            );

            const text = sectionOf('Payout-size sweep').textContent;
            expect(text).toContain('Your entered size: $750');
            expect(text).toContain('effective $1,000');
            expect(text).toContain(
                'firm minimum $1,000 is above your $750 entry',
            );
        });
    });

    describe('assumptions and simulation basis', () => {
        it('lists the optimistic assumptions the engine policy carries', () => {
            render(<PayoutPlannerView />);

            const text = container.textContent;
            expect(text).toContain(
                assumptionLabel(AssumptionKind.LiveTriggersNotChecked),
            );
            expect(text).toContain(
                assumptionLabel(AssumptionKind.RebuyLagAssumed),
            );
        });

        it('shows the funded strategy, the trials, the seed and the horizon behind the numbers', () => {
            render(<PayoutPlannerView />);

            const text = container.textContent;
            expect(text).toContain('win rate 40.0%');
            expect(text).toContain('reward-to-risk 2');
            expect(text).toContain('2000 trials');
            expect(text).toContain('seed 42');
        });

        it('flags a blank peak balance on a trailing-drawdown plan as assuming the balance is the peak', () => {
            render(<PayoutPlannerView />);

            expect(container.textContent).toContain(
                'No peak balance was entered, so the current balance is assumed to be the peak',
            );
        });

        it('does not flag the peak once it is entered', () => {
            searchState.query = `${PayoutPlannerUrlParameter.Peak}=52000`;

            render(<PayoutPlannerView />);

            expect(container.textContent).not.toContain(
                'No peak balance was entered',
            );
        });
    });

    describe('request debounce', () => {
        it('starts one run per pause, not one per keystroke', () => {
            render(<PayoutPlannerView />);
            const sweepRuns = fakeWorker.sweepRequests.length;
            const outlookRuns = fakeWorker.outlookRequests.length;

            typeInto('payout-planner-balance', '50100');
            typeInto('payout-planner-balance', '50200');
            typeInto('payout-planner-balance', '50300');

            expect(fakeWorker.outlookRequests).toHaveLength(outlookRuns);

            settle();

            expect(fakeWorker.outlookRequests).toHaveLength(outlookRuns + 1);
            expect(lastOutlookRequest().balance).toBe(50_300);
            expect(fakeWorker.sweepRequests).toHaveLength(sweepRuns);
        });

        it('shows a skeleton, not the previous result, while the new request waits', () => {
            render(<PayoutPlannerView />);
            finish('outlook', outlookResult());

            typeInto('payout-planner-balance', '50100');

            expect(
                sectionOf('Path to payout').querySelector(SKELETON),
            ).not.toBeNull();
            expect(sectionOf('Path to payout').textContent).not.toContain(
                '12.3 days',
            );
        });

        it('does not show the failure of the previous request for the next one', () => {
            render(<PayoutPlannerView />);
            const instance = fakeWorker.latest.sweep;
            if (instance === undefined) throw new Error('no sweep run');
            act(() => {
                instance.dispatch({
                    kind: WorkerTaskEventKind.Failed,
                    reason: 'The background worker failed.',
                    runId: instance.runId,
                });
            });
            expect(sectionOf('Payout-size sweep').textContent).toContain(
                'The background worker failed.',
            );

            typeInto('payout-planner-request', '750');

            expect(sectionOf('Payout-size sweep').textContent).not.toContain(
                'The background worker failed.',
            );
            expect(
                sectionOf('Payout-size sweep').querySelector(SKELETON),
            ).not.toBeNull();
        });
    });

    describe('shared computation cache', () => {
        it('stores the sweep and the outlook results under their request keys', () => {
            const cache = new ComputationCache();
            render(withCache(cache));
            const sweepKey = payoutSweepCacheKey(lastSweepRequest());
            const outlookKey = payoutOutlookCacheKey(lastOutlookRequest());

            finish('sweep', sweepResult());
            finish('outlook', outlookResult());

            expect(
                initialFor(ComputationId.PayoutSweep, sweepKey, cache)
                    .shouldCompute,
            ).toBe(false);
            expect(
                initialFor(ComputationId.PayoutOutlook, outlookKey, cache)
                    .shouldCompute,
            ).toBe(false);
        });

        it('shows both results after navigating away and back without running the workers again', () => {
            searchState.query = `${PayoutPlannerUrlParameter.RequestSize}=6000`;
            const cache = new ComputationCache();
            render(withCache(cache));
            finish('sweep', sweepResultWithOverride(6000));
            finish('outlook', outlookResult());
            act(() => {
                root.unmount();
            });
            root = createRoot(container);
            const sweepRuns = fakeWorker.sweepRequests.length;
            const outlookRuns = fakeWorker.outlookRequests.length;

            render(withCache(cache));
            settle();

            expect(fakeWorker.sweepRequests).toHaveLength(sweepRuns);
            expect(fakeWorker.outlookRequests).toHaveLength(outlookRuns);
            expect(sectionOf('Payout-size sweep').textContent).toContain(
                'Your entered size: $6,000',
            );
            expect(sectionOf('Path to payout').textContent).toContain(
                '12.3 days',
            );
            expect(container.querySelector(SKELETON)).toBeNull();
        });

        it('does not show a cached result under a different request', () => {
            searchState.query = `${PayoutPlannerUrlParameter.RequestSize}=6000`;
            const cache = new ComputationCache();
            render(withCache(cache));
            finish('sweep', sweepResultWithOverride(6000));
            finish('outlook', outlookResult());
            const sweepRuns = fakeWorker.sweepRequests.length;

            typeInto('payout-planner-request', '750');
            settle();

            expect(fakeWorker.sweepRequests).toHaveLength(sweepRuns + 1);
            expect(lastSweepRequest().personalOverrideRequest).toBe(750);
            expect(sectionOf('Payout-size sweep').textContent).not.toContain(
                'Your entered size',
            );
            expect(
                sectionOf('Payout-size sweep').querySelector(SKELETON),
            ).not.toBeNull();
        });

        it('caches a finished result only under the key of the run that produced it', () => {
            const cache = new ComputationCache();
            render(withCache(cache));
            const firstKey = payoutSweepCacheKey(lastSweepRequest());
            typeInto('payout-planner-request', '750');
            settle();
            const secondKey = payoutSweepCacheKey(lastSweepRequest());
            expect(secondKey).not.toBe(firstKey);

            finish('sweep', sweepResult());

            expect(
                initialFor(ComputationId.PayoutSweep, firstKey, cache)
                    .shouldCompute,
            ).toBe(true);
            expect(
                initialFor(ComputationId.PayoutSweep, secondKey, cache)
                    .shouldCompute,
            ).toBe(false);
        });

        it('keeps a private cache when no provider is mounted, so a rerender does not rerun the workers', () => {
            searchState.query = `${PayoutPlannerUrlParameter.Balance}=51000`;
            render(<PayoutPlannerView />);
            finish('sweep', sweepResult());
            finish('outlook', outlookResult());
            const sweepRuns = fakeWorker.sweepRequests.length;
            const outlookRuns = fakeWorker.outlookRequests.length;

            render(<PayoutPlannerView />);
            settle();

            expect(fakeWorker.sweepRequests).toHaveLength(sweepRuns);
            expect(fakeWorker.outlookRequests).toHaveLength(outlookRuns);
        });

        it('reruns both workers and drops the old results when the personal rulebook changes only its strategy', () => {
            sessionState.current = SIGNED_IN;
            rulebookQueryState.current = {
                data: DEFAULT_RULEBOOK,
                isError: false,
            };
            const cache = new ComputationCache();
            render(withCache(cache));
            settle();
            finish('sweep', sweepResult());
            finish('outlook', outlookResult());
            expect(sectionOf('Path to payout').textContent).toContain(
                '12.3 days',
            );
            const sweepRuns = fakeWorker.sweepRequests.length;
            const outlookRuns = fakeWorker.outlookRequests.length;

            rulebookQueryState.current = {
                data: {
                    ...DEFAULT_RULEBOOK,
                    strategy: { ...DEFAULT_RULEBOOK.strategy, winrate: 0.55 },
                },
                isError: false,
            };
            render(withCache(cache));
            settle();

            expect(fakeWorker.sweepRequests).toHaveLength(sweepRuns + 1);
            expect(fakeWorker.outlookRequests).toHaveLength(outlookRuns + 1);
            expect(lastSweepRequest().spec.rulebook.strategy.winrate).toBe(
                0.55,
            );
            expect(sectionOf('Path to payout').textContent).not.toContain(
                '12.3 days',
            );
            expect(
                sectionOf('Payout-size sweep').querySelector(SKELETON),
            ).not.toBeNull();
        });

        it('reruns the workers when the personal rulebook changes only its funded risk', () => {
            sessionState.current = SIGNED_IN;
            rulebookQueryState.current = {
                data: DEFAULT_RULEBOOK,
                isError: false,
            };
            const cache = new ComputationCache();
            render(withCache(cache));
            settle();
            finish('sweep', sweepResult());
            finish('outlook', outlookResult());
            const sweepRuns = fakeWorker.sweepRequests.length;

            rulebookQueryState.current = {
                data: {
                    ...DEFAULT_RULEBOOK,
                    funded: { ...DEFAULT_RULEBOOK.funded, riskCents: 40_000 },
                },
                isError: false,
            };
            render(withCache(cache));
            settle();

            expect(fakeWorker.sweepRequests).toHaveLength(sweepRuns + 1);
            expect(lastSweepRequest().spec.rulebook.funded.riskCents).toBe(
                40_000,
            );
        });
    });
});
