import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    overviewAccountRequestsFor,
    type OverviewOutcome,
    OverviewOutcomeKind,
    overviewOutcomeOf,
    type OverviewRequest,
    overviewRequestKey,
    OverviewRequestKind,
    ValueChainStepOutcomeKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import { LiveTransitionPreviewCard } from '~/app/(app)/prop-calculator/accounts/_components/detail/LiveTransitionPreviewCard';
import { NextPayoutSection } from '~/app/(app)/prop-calculator/accounts/_components/detail/NextPayoutSection';
import { SimulateAccountLink } from '~/app/(app)/prop-calculator/accounts/_components/detail/SimulateAccountLink';
import {
    AccountFromStateViewKind,
    accountFromStateViewOf,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/accountFromStateModel';
import { NextPayoutCard } from '~/app/(app)/prop-calculator/accounts/_components/overview/NextPayoutCard';
import { type NextPayoutCardModel } from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
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
    SizingStage,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import {
    MilestoneKind,
    ValueResultKind,
} from '~/lib/prop-calculator/advisor/value';
import { routes } from '~/lib/site/routes';

vi.mock('next/navigation', () => ({
    usePathname: () => '/prop-calculator/accounts/x',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

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
const TINY_RUN = { maxEvalDays: 150, seed: 7, trials: 30 } as const;

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

function readyView(request: OverviewRequest) {
    const outcome: OverviewOutcome = {
        key: overviewRequestKey(request),
        kind: OverviewOutcomeKind.Succeeded,
        result: {
            figures: {
                milestone: {
                    debited: 1000,
                    kind: MilestoneKind.Funded,
                    received: 400,
                    unmetGates: [],
                    value: {
                        kind: ValueChainStepOutcomeKind.Value,
                        value: valueOf(2500),
                    },
                },
                nextPayout: null,
                stage: SizingStage.Eval,
                startBasis: StartBasis.FromState,
                trials: 2000,
                valueNow: valueOf(1800),
            },
            kind: OverviewRequestKind.AccountFromState,
        },
    };
    return accountFromStateViewOf(
        { failure: null, outcomes: new Map([[outcome.key, outcome]]) },
        request,
    );
}

async function settle() {
    await act(async () => {
        await new Promise((resolve) => {
            setTimeout(resolve, 30);
        });
    });
}

function valueOf(amount: number) {
    return {
        creditFree: { standardError: 70, value: amount },
        creditInclusive: { standardError: 70, value: amount + 150 },
        kind: ValueResultKind.Value as const,
        seed: 42,
        trials: 2000,
    };
}

describe('from-state views', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(node: React.ReactNode) {
        act(() => {
            root.render(node);
        });
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    describe('SimulateAccountLink', () => {
        it('links to the simulator with the plan and says it is a fresh start with the unsized funded risk caveat', () => {
            render(
                <SimulateAccountLink
                    plan={PLAN}
                    rulebook={DEFAULT_RULEBOOK}
                    rulebookError={null}
                    stage={SizingStage.Funded}
                />,
            );
            const anchor = container.querySelector('a');
            expect(anchor?.textContent).toBe('Simulate this account');
            expect(
                anchor
                    ?.getAttribute('href')
                    ?.startsWith(`${routes.propCalculator.simulator}?`),
            ).toBe(true);
            expect(container.textContent.toLowerCase()).toContain(
                'fresh start',
            );
            expect(container.textContent).toContain('without whole contracts');
        });

        it('says the rulebook could not be loaded, with the error, and links nothing', () => {
            render(
                <SimulateAccountLink
                    plan={PLAN}
                    rulebook={undefined}
                    rulebookError="the rulebook query failed"
                    stage={SizingStage.Funded}
                />,
            );
            expect(container.querySelector('a')).toBeNull();
            expect(container.textContent).toContain(
                'rulebook could not be loaded',
            );
            expect(container.textContent).toContain(
                'the rulebook query failed',
            );
        });

        it('says so when the rulebook has not loaded or the account is live, and links nothing', () => {
            render(
                <SimulateAccountLink
                    plan={PLAN}
                    rulebook={undefined}
                    rulebookError={null}
                    stage={SizingStage.Funded}
                />,
            );
            expect(container.querySelector('a')).toBeNull();
            expect(container.textContent).toContain('rulebook has not loaded');
            render(
                <SimulateAccountLink
                    plan={PLAN}
                    rulebook={DEFAULT_RULEBOOK}
                    rulebookError={null}
                    stage={SizingStage.Live}
                />,
            );
            expect(container.querySelector('a')).toBeNull();
            expect(container.textContent).toContain('live account');
        });
    });

    describe('LiveTransitionPreviewCard', () => {
        it('shows the TopStep live start with the always-the-same note', () => {
            const account = AccountReconstruction.rebuild(FUNDED, PLAN);
            render(<LiveTransitionPreviewCard account={account} plan={PLAN} />);
            expect(container.textContent).toContain('$10,000');
            expect(container.textContent).toContain('always $10,000');
        });
    });

    describe('NextPayoutSection', () => {
        const posted: { requests: OverviewRequest[] }[] = [];

        class FakeWorker {
            protected listener: ((event: { data: unknown }) => void) | null =
                null;

            addEventListener(
                type: string,
                listener: (event: { data: unknown }) => void,
            ) {
                if (type === 'message') this.listener = listener;
            }

            postMessage(message: {
                request: { requests: OverviewRequest[] };
                runId: number;
            }) {
                posted.push(message.request);
                const outcomes: OverviewOutcome[] =
                    message.request.requests.map((request) => ({
                        ...overviewOutcomeOf({
                            ...request,
                            spec: { ...request.spec, run: TINY_RUN },
                        }),
                        key: overviewRequestKey(request),
                    }));
                queueMicrotask(() => {
                    this.listener?.({
                        data: {
                            kind: 'done',
                            result: { outcomes },
                            runId: message.runId,
                        },
                    });
                });
            }

            protected deliver(data: unknown) {
                this.listener?.({ data });
            }

            terminate() {
                this.listener = null;
            }
        }

        class ChainFailingWorker extends FakeWorker {
            override postMessage(message: {
                request: { requests: OverviewRequest[] };
                runId: number;
            }) {
                const isChain = message.request.requests.some(
                    (request) =>
                        request.kind === OverviewRequestKind.ValueChain,
                );
                if (!isChain) {
                    super.postMessage(message);
                    return;
                }
                posted.push(message.request);
                queueMicrotask(() => {
                    this.deliver({
                        kind: 'failed',
                        reason: 'the chain worker crashed',
                        runId: message.runId,
                    });
                });
            }
        }

        class SilentWorker extends FakeWorker {
            override postMessage(message: {
                request: { requests: OverviewRequest[] };
                runId: number;
            }) {
                posted.push(message.request);
            }
        }

        beforeEach(() => {
            posted.length = 0;
        });

        it('computes the value, the milestone, the next payout, the payout path, the chain position and the retire information from the account state', async () => {
            vi.stubGlobal('Worker', FakeWorker);
            const account = AccountReconstruction.rebuild(FUNDED, PLAN);
            render(
                <NextPayoutSection
                    account={account}
                    input={FUNDED}
                    measuredRebuyLag={null}
                    plan={PLAN}
                    rulebook={DEFAULT_RULEBOOK}
                    rulebookError={null}
                />,
            );
            await settle();
            const text = container.textContent;
            expect(text).toContain('Value from this state, credit-free');
            expect(text).toContain(
                'From the account state as of 2026-03-02, not a fresh start',
            );
            expect(text).toContain('Expected time to the next payout');
            expect(text).toContain('Path to the next payout');
            expect(text).toContain('Position in the value chain of the plan');
            expect(text).toContain('Keep or start a fresh account');
            expect(text).toContain('Information only');
            const kinds = posted.flatMap((request) =>
                request.requests.map((candidate) => candidate.kind),
            );
            expect(kinds).toContain(OverviewRequestKind.AccountFromState);
            expect(kinds).toContain(OverviewRequestKind.RetireComparison);
            expect(kinds).toContain(OverviewRequestKind.ValueChain);
            const everyRequest = posted.flatMap((entry) => entry.requests);
            for (const request of everyRequest) {
                expect(JSON.stringify(request)).not.toContain('computeRisk');
            }
        });

        it('keeps the account figures when the group of fresh-chain requests fails, and says only the chain is unavailable', async () => {
            posted.length = 0;
            vi.stubGlobal('Worker', ChainFailingWorker);
            const account = AccountReconstruction.rebuild(FUNDED, PLAN);
            render(
                <NextPayoutSection
                    account={account}
                    input={FUNDED}
                    measuredRebuyLag={null}
                    plan={PLAN}
                    rulebook={DEFAULT_RULEBOOK}
                    rulebookError={null}
                />,
            );
            await settle();
            const text = container.textContent;
            expect(text).toContain('Value from this state, credit-free');
            expect(text).toContain('Expected time to the next payout');
            expect(text).toContain('Keep or start a fresh account');
            expect(text).toContain('Value chain: the chain worker crashed');
        });

        it('says the account cannot be valued after the next payout request, while the value now and the next payout stay (TopStep 50K at 50,300)', async () => {
            vi.stubGlobal('Worker', FakeWorker);
            const nearThreshold: AccountSnapshotInput = {
                ...FUNDED,
                balance: dollars(50_300),
                highestEodBalance: dollars(50_300),
                highestIntradayBalance: dollars(50_300),
            };
            const account = AccountReconstruction.rebuild(nearThreshold, PLAN);
            render(
                <NextPayoutSection
                    account={account}
                    input={nearThreshold}
                    measuredRebuyLag={null}
                    plan={PLAN}
                    rulebook={DEFAULT_RULEBOOK}
                    rulebookError={null}
                />,
            );
            await settle();
            const text = container.textContent;
            expect(text).toContain('Value from this state, credit-free');
            expect(text).toContain('Expected time to the next payout');
            expect(text).toContain(
                'The account cannot be valued after the next payout request',
            );
            expect(text).not.toContain('Credit-free gain from the milestone');
        });

        it('announces the pending figures through a status role', () => {
            vi.stubGlobal('Worker', SilentWorker);
            const account = AccountReconstruction.rebuild(FUNDED, PLAN);
            render(
                <NextPayoutSection
                    account={account}
                    input={FUNDED}
                    measuredRebuyLag={null}
                    plan={PLAN}
                    rulebook={DEFAULT_RULEBOOK}
                    rulebookError={null}
                />,
            );
            const status = container.querySelector(
                '[role="status"][aria-label="Computing the figures from this state"]',
            );
            expect(status).not.toBeNull();
            expect(
                container
                    .querySelector('[role="status"]:not([aria-label])')
                    ?.textContent.includes('Comparing with a fresh account'),
            ).toBe(true);
        });

        it('says the rulebook could not be loaded, with the error, instead of saying it has not loaded', () => {
            vi.stubGlobal('Worker', FakeWorker);
            const account = AccountReconstruction.rebuild(FUNDED, PLAN);
            render(
                <NextPayoutSection
                    account={account}
                    input={FUNDED}
                    measuredRebuyLag={null}
                    plan={PLAN}
                    rulebook={undefined}
                    rulebookError="the rulebook query failed"
                />,
            );
            expect(container.textContent).toContain(
                'rulebook could not be loaded',
            );
            expect(container.textContent).toContain(
                'the rulebook query failed',
            );
            expect(container.textContent).not.toContain('has not loaded');
            expect(posted).toHaveLength(0);
        });

        it('does not call a non-live account with an unresolvable plan a live account', () => {
            vi.stubGlobal('Worker', FakeWorker);
            const unlisted = Object.create(PLAN, {
                id: { value: { ...PLAN.id, accountSize: 12_345 } },
            }) as Plan;
            const account = AccountReconstruction.rebuild(FUNDED, PLAN);
            render(
                <NextPayoutSection
                    account={account}
                    input={FUNDED}
                    measuredRebuyLag={null}
                    plan={unlisted}
                    rulebook={DEFAULT_RULEBOOK}
                    rulebookError={null}
                />,
            );
            expect(container.textContent).not.toContain('live account');
            expect(container.textContent).toContain(
                'plan of this account is not modeled',
            );
            expect(posted).toHaveLength(0);
        });

        it('says the rulebook has not loaded instead of computing', () => {
            vi.stubGlobal('Worker', FakeWorker);
            const account = AccountReconstruction.rebuild(FUNDED, PLAN);
            render(
                <NextPayoutSection
                    account={account}
                    input={FUNDED}
                    measuredRebuyLag={null}
                    plan={PLAN}
                    rulebook={undefined}
                    rulebookError={null}
                />,
            );
            expect(container.textContent).toContain('rulebook has not loaded');
            expect(posted).toHaveLength(0);
        });

        it('says a live account has no from-state value model and posts nothing', () => {
            vi.stubGlobal('Worker', FakeWorker);
            const liveInput = { ...FUNDED, stage: SizingStage.Live };
            const account = AccountReconstruction.rebuild(liveInput, PLAN);
            render(
                <NextPayoutSection
                    account={account}
                    input={liveInput}
                    measuredRebuyLag={null}
                    plan={PLAN}
                    rulebook={DEFAULT_RULEBOOK}
                    rulebookError={null}
                />,
            );
            expect(container.textContent).toContain(
                'live account has no from-state value model',
            );
            expect(posted).toHaveLength(0);
        });

        it('explains that web workers are missing instead of showing a blank section', () => {
            vi.stubGlobal('Worker', undefined);
            const account = AccountReconstruction.rebuild(FUNDED, PLAN);
            render(
                <NextPayoutSection
                    account={account}
                    input={FUNDED}
                    measuredRebuyLag={null}
                    plan={PLAN}
                    rulebook={DEFAULT_RULEBOOK}
                    rulebookError={null}
                />,
            );
            expect(container.textContent).toContain(
                'Web workers are not available in this browser.',
            );
        });
    });

    describe('NextPayoutCard', () => {
        it('lists a ready account, a pending account and a refused account, each in its own state', () => {
            const [request] = overviewAccountRequestsFor(
                [
                    {
                        account: FUNDED,
                        firmId: FirmId.TopStep,
                        measuredRebuyLag: null,
                        optIns: NO_PLAN_OPT_INS,
                        planSerial: serializePlanId(PLAN.id),
                    },
                ],
                DEFAULT_RULEBOOK,
            );
            if (request === undefined) throw new Error('no request');
            const model: NextPayoutCardModel = {
                disclosures: ['never merged into the fresh-start projection'],
                rows: [
                    {
                        accountId: 'a',
                        label: 'Alpha',
                        plan: 'TopStep 50K',
                        view: readyView(request),
                    },
                    {
                        accountId: 'b',
                        label: 'Bravo',
                        plan: 'TopStep 50K',
                        view: { kind: AccountFromStateViewKind.Pending },
                    },
                    {
                        accountId: 'c',
                        label: 'Charlie',
                        plan: 'TopStep 50K',
                        view: {
                            kind: AccountFromStateViewKind.Refused,
                            reason: 'the stop is too wide',
                        },
                    },
                ],
                statusNote: null,
            };
            render(<NextPayoutCard model={model} />);
            const text = container.textContent;
            expect(text).toContain('$1,800 (SE $70)');
            expect(text).toContain('Not funded yet');
            expect(text).toContain('Pending');
            expect(text).toContain('Charlie: the stop is too wide');
            expect(text).toContain('never merged');
            expect(container.querySelectorAll(':scope tbody tr')).toHaveLength(
                3,
            );
        });

        it('shows the status note when there is no account to project', () => {
            render(
                <NextPayoutCard
                    model={{
                        disclosures: [],
                        rows: [],
                        statusNote: 'No active account has a snapshot.',
                    }}
                />,
            );
            expect(container.textContent).toContain(
                'No active account has a snapshot.',
            );
        });
    });
});
