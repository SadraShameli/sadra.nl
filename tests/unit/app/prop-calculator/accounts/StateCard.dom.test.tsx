import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StateCardKind } from '~/app/(app)/prop-calculator/accounts/_components/detail/detailState';
import { StateCard } from '~/app/(app)/prop-calculator/accounts/_components/detail/StateCard';
import {
    dollars,
    findFirm,
    FirmId,
    FundedNextVariant,
} from '~/lib/prop-calculator';
import {
    AccountReconstruction,
    type AccountSnapshotInput,
    DashboardBalanceConvention,
    DEFAULT_RULEBOOK,
    NO_PENDING_PAYOUT_COUNTS,
    SizingStage,
} from '~/lib/prop-calculator/advisor';

import { infoText } from '../infoPopover';

const INPUT: AccountSnapshotInput = {
    asOf: '2026-02-10',
    balance: dollars(10_000),
    dashboardConvention: DashboardBalanceConvention.Nominal,
    liveStartBalance: dollars(10_000),
    stage: SizingStage.Live,
};

function liveNotModeledView() {
    const plan = findFirm(FirmId.FundedNext)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.FundedNext,
        variant: FundedNextVariant.Legacy,
    });
    if (plan === undefined) throw new Error('no FundedNext Legacy plan');
    return {
        account: AccountReconstruction.rebuild(
            INPUT,
            plan,
            null,
            NO_PENDING_PAYOUT_COUNTS,
            DEFAULT_RULEBOOK.live.cushionPercent,
        ),
        asOf: INPUT.asOf,
        input: INPUT,
        issues: [],
        kind: StateCardKind.Ready,
    } as const;
}

describe('StateCard', () => {
    let container: HTMLDivElement;
    let root: Root;

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

    it('shows a floor, lock and cushion it cannot reconstruct as missing values with their reason, never the word unavailable', () => {
        act(() => {
            root.render(<StateCard view={liveNotModeledView()} />);
        });
        const values = [...container.querySelectorAll('dd')].map(
            (value) => value.textContent,
        );
        expect(values).toEqual([
            '–Not available',
            '–Not available',
            '–Not available',
        ]);
        expect(container.textContent).not.toContain('unavailable');
        expect(infoText(container, 'Not available')).toContain(
            'No live stage is modeled for this plan',
        );
    });
});
