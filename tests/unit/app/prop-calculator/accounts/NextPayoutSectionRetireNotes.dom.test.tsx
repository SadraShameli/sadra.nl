import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type OverviewOutcome,
    OverviewOutcomeKind,
    overviewRequestKey,
    OverviewRequestKind,
} from '~/app/(app)/prop-calculator/_workers/overviewWorkerMessages';
import {
    FromStateDetailKind,
    fromStateDetailRequestsOf,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/fromStateDetail';
import { NextPayoutSection } from '~/app/(app)/prop-calculator/accounts/_components/detail/NextPayoutSection';
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
    AssumptionBias,
    AssumptionKind,
    assumptionText,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    type LiveTransferHazardAssumption,
    NO_PENDING_PAYOUT_COUNTS,
    SizingStage,
} from '~/lib/prop-calculator/advisor';
import {
    RetireComparisonBasis,
    RetireComparisonReason,
    type RetireComparisonResult,
    RetireComparisonVerdict,
} from '~/lib/prop-calculator/advisor/value';
import { LiveTransferContinuationKind } from '~/lib/prop-calculator/simulator';

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

const KEEP_HAZARD: LiveTransferHazardAssumption = {
    bias: AssumptionBias.Neutral,
    continuation: LiveTransferContinuationKind.NotModeled,
    hazard: 0.3,
    kind: AssumptionKind.LiveTransferHazard,
    notes: [],
    sentLiveShare: 0.41,
};

const FRESH_HAZARD: LiveTransferHazardAssumption = {
    ...KEEP_HAZARD,
    sentLiveShare: 0.52,
};

const RETIRE_LIST =
    'ul[aria-label="Live-transfer and payout-trigger assumptions behind the retire comparison"]';

const RETIRE_RESULT: RetireComparisonResult = {
    basis: RetireComparisonBasis.Simulator,
    keepRate: { standardError: 0.4, value: 12.345 },
    reason: RetireComparisonReason.NotCapacityBound,
    remainingDays: 200,
    switchCost: 150,
    switchRate: { standardError: 0.6, value: 14.2 },
    verdict: RetireComparisonVerdict.Keep,
};

describe('NextPayoutSection renders the retire hazard lines as a list (PT-73g step 6)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function renderWith(figures: RetireComparisonResult) {
        const requests = fromStateDetailRequestsOf({
            input: FUNDED,
            measuredRebuyLag: null,
            pendingPayoutCounts: NO_PENDING_PAYOUT_COUNTS,
            personalMaxRiskPerTrade: null,
            personalRules: null,
            plan: PLAN,
            rulebook: DEFAULT_RULEBOOK,
        });
        if (requests === null) throw new Error('no requests');
        const key = overviewRequestKey(requests.retire);
        const outcome: OverviewOutcome = {
            key,
            kind: OverviewOutcomeKind.Succeeded,
            result: { figures, kind: OverviewRequestKind.RetireComparison },
        };
        act(() => {
            root.render(
                <NextPayoutSection
                    account={AccountReconstruction.rebuild(
                        FUNDED,
                        PLAN,
                        null,
                        NO_PENDING_PAYOUT_COUNTS,
                    )}
                    detail={{
                        engine: {
                            failure: null,
                            outcomes: new Map([[key, outcome]]),
                        },
                        kind: FromStateDetailKind.Ready,
                        requests,
                    }}
                    input={FUNDED}
                    rulebook={DEFAULT_RULEBOOK}
                    rulebookError={null}
                />,
            );
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

    it('prints one list item per hazard line, apart from the information-only note', () => {
        renderWith({
            ...RETIRE_RESULT,
            liveTransfer: KEEP_HAZARD,
            replacementLiveTransfer: FRESH_HAZARD,
        });

        const items = [
            ...container.querySelectorAll(`${RETIRE_LIST} > li`),
        ].map((item) => item.textContent);
        expect(items).toStrictEqual([
            `Keeping this account. ${assumptionText(KEEP_HAZARD)}`,
            `A fresh account. ${assumptionText(FRESH_HAZARD)}`,
        ]);
        expect(container.textContent.toLowerCase()).toContain(
            'information only',
        );
    });

    it('prints no list when no hazard was priced', () => {
        renderWith(RETIRE_RESULT);

        expect(container.textContent).toContain(
            'Keep or start a fresh account',
        );
        expect(container.querySelector(RETIRE_LIST)).toBeNull();
    });

    describe('the not-comparable field decides what the retire view shows (PT-73g)', () => {
        const NOT_COMPARABLE: RetireComparisonResult = {
            ...RETIRE_RESULT,
            basis: RetireComparisonBasis.AverageRewardDp,
            isSlotRateHazardFree: true,
            liveTransfer: KEEP_HAZARD,
            reason: null,
            verdict: RetireComparisonVerdict.SwitchBeatsKeep,
        };

        it('withholds the fresh-account rate and says the figures are not comparable', () => {
            renderWith(NOT_COMPARABLE);

            expect(container.textContent).toContain(
                'Not comparable at this hazard',
            );
            expect(container.textContent).not.toContain(
                'A fresh account, after its cost',
            );
            expect(container.textContent).toContain('Keeping this account');
            expect(container.textContent).toContain('Cost of switching');
        });

        it('shows the fresh-account rate beside the keep rate when they are comparable', () => {
            renderWith({
                ...RETIRE_RESULT,
                liveTransfer: KEEP_HAZARD,
                reason: null,
                replacementLiveTransfer: FRESH_HAZARD,
                verdict: RetireComparisonVerdict.SwitchBeatsKeep,
            });

            expect(container.textContent).toContain(
                'A fresh account, after its cost',
            );
            expect(container.textContent).not.toContain(
                'Not comparable at this hazard',
            );
        });
    });
});
