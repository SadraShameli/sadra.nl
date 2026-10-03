import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type OverviewOutcome,
    overviewOutcomeOf,
    type OverviewRequest,
    overviewRequestKey,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    dollars,
    findFirm,
    FirmId,
    type Plan,
    TopStepVariant,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    type AccountSnapshotInput,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    NO_PENDING_PAYOUT_COUNTS,
    type RulebookParameters,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

import { NextPayoutSectionWithWorker } from './NextPayoutSectionWithWorker';

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

const HAZARD_RULEBOOK: RulebookParameters = {
    ...DEFAULT_RULEBOOK,
    liveTransfer: {
        ...DEFAULT_RULEBOOK.liveTransfer,
        hazardPerPaidPayoutByFirm: { [FirmId.TopStep]: 0.3 },
    },
};

const HAZARD_LINE =
    'Live transfer: 30.0% per paid payout (your assumption, not a firm rule).';

class FakeWorker {
    private listener: ((event: { data: unknown }) => void) | null = null;

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
        const outcomes: OverviewOutcome[] = message.request.requests.map(
            (request) => ({
                ...overviewOutcomeOf({
                    ...request,
                    spec: { ...request.spec, run: TINY_RUN },
                }),
                key: overviewRequestKey(request),
            }),
        );
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

    terminate() {
        this.listener = null;
    }
}

async function settle() {
    await act(async () => {
        await new Promise((resolve) => {
            setTimeout(resolve, 30);
        });
    });
}

describe('the account detail names the live-transfer hazard behind its from-state figures (PT-73f step 4)', () => {
    let container: HTMLDivElement;
    let root: Root;

    async function renderSection(rulebook: RulebookParameters) {
        const account = AccountReconstruction.rebuild(
            FUNDED,
            PLAN,
            null,
            NO_PENDING_PAYOUT_COUNTS,
        );
        act(() => {
            root.render(
                <NextPayoutSectionWithWorker
                    account={account}
                    input={FUNDED}
                    measuredRebuyLag={null}
                    plan={PLAN}
                    rulebook={rulebook}
                    rulebookError={null}
                />,
            );
        });
        await settle();
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        vi.stubGlobal('Worker', FakeWorker);
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

    it('shows the hazard line under the figures from this state and in the retire comparison for an account whose firm has a hazard', async () => {
        await renderSection(HAZARD_RULEBOOK);

        const list = container.querySelector(
            'ul[aria-label="Live-transfer and payout-trigger assumptions behind the figures from this state"]',
        );
        expect(list).not.toBeNull();
        expect(list?.textContent).toContain(HAZARD_LINE);
        expect(list?.textContent).toContain('Value from this state.');
        const retire = [...container.querySelectorAll('h4')].find(
            (heading) =>
                heading.textContent === 'Keep or start a fresh account',
        )?.parentElement;
        expect(retire?.textContent).toContain(
            `Keeping this account. ${HAZARD_LINE}`,
        );
    });

    it('shows no live-transfer line for an account whose firm has no hazard', async () => {
        await renderSection(DEFAULT_RULEBOOK);

        expect(container.textContent).toContain(
            'Keep or start a fresh account',
        );
        expect(container.textContent).not.toContain('Live transfer');
        expect(
            container.querySelector(
                'ul[aria-label="Live-transfer and payout-trigger assumptions behind the figures from this state"]',
            ),
        ).toBeNull();
    });
});
