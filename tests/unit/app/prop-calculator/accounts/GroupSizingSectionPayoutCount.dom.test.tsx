import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type CopyGroupAccount,
    copyGroupRows,
} from '~/app/(app)/prop-calculator/accounts/_components/copyGroups/copyGroupRows';
import {
    COPY_GROUP_PAYOUT_COUNT_CONCURRENT_TEXT,
    COPY_GROUP_PAYOUT_COUNT_NOT_CHECKED_TEXT,
    type CopyGroupSizingSection,
    withPositionSizing,
} from '~/app/(app)/prop-calculator/accounts/copy-groups/copyGroupSizingModel';
import {
    GroupSizingSection,
    GroupSizingViewKind,
} from '~/app/(app)/prop-calculator/accounts/copy-groups/GroupSizingSection';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
} from '~/lib/prop-accounts';
import {
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type LiveTransitionTrigger,
    MffuVariant,
    PayoutCountTotalTrigger,
    type PlanId,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
} from '~/lib/prop-calculator';
import {
    type CopyGroupSizingMember,
    DEFAULT_RULEBOOK,
} from '~/lib/prop-calculator/advisor';

import { fundedReconstructed } from '../../../lib/prop-accounts/reconstructionFixtures';

const GROUP = {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Main copy',
    notes: null,
};

const MFF_PRO_ID: PlanId = {
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
};

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

function accountRow(id: string): CopyGroupAccount {
    return {
        archivedAt: null,
        copyGroupId: GROUP.id,
        externalFirmId: null,
        firmId: FirmId.Mffu,
        id,
        label: id,
        planLabel: null,
        planSerial: serializePlanId(MFF_PRO_ID),
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tracking: AccountTracking.Modeled,
    };
}

function memberOf(
    id: string,
    paid: null | number,
    cap: null | number,
): CopyGroupSizingMember {
    return {
        account: readyFundedAccount(),
        accountPolicy:
            cap === null
                ? null
                : new StubTriggerPolicy([
                      new PayoutCountTotalTrigger(cap, CONFIRMED_SOURCE),
                  ]),
        id,
        label: id,
        paidPayoutsSinceLastLiveAccount: paid,
        personalRequestOverride: null,
        personalRetainedCushion: null,
    };
}

function readyFundedAccount() {
    const plan = findFirm(FirmId.Mffu)?.findPlan(MFF_PRO_ID);
    if (plan === undefined) throw new Error('no MFF Pro 50K plan');
    const balance = plan.accountSize + 20_000;
    const funded = fundedReconstructed(plan, {
        balance,
        cumulativePayout: 0,
        cycleBestDayProfit: balance - plan.accountSize,
        lastPayoutBalance: plan.accountSize,
        payoutsIssued: 1,
    });
    if (funded.fundedTracker === null) throw new Error('expected a tracker');
    funded.fundedTracker.sessionDaysSinceAnchor = 999;
    funded.state.qualifyingDays = 999;
    return funded;
}

function sectionOf(
    members: readonly CopyGroupSizingMember[],
): CopyGroupSizingSection {
    return withPositionSizing(
        {
            asOf: '2026-09-26',
            exposure: null,
            inputs: {
                leftOutLabels: [],
                members,
                rulebook: DEFAULT_RULEBOOK,
                simulationMembers: [],
            },
            staleMembers: [],
            unsizedMembers: [],
        },
        null,
    );
}

describe('the copy-group card shows its firm payout limit check (PT-36n, F-145)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(section: CopyGroupSizingSection) {
        const [row] = copyGroupRows(
            [GROUP],
            [accountRow('a'), accountRow('b')],
        ).groups;
        if (row === undefined) throw new Error('no row for the group');
        act(() => {
            root.render(
                <GroupSizingSection
                    row={row}
                    sizing={{ kind: GroupSizingViewKind.Ready, section }}
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

    it('says the members filing together would reach the verified firm limit, with the source citation and the filing-together rule', () => {
        render(sectionOf([memberOf('a', 2, 4), memberOf('b', 2, 4)]));

        const text = container.textContent;
        expect(text).toContain('a and b');
        expect(text).toContain('live-account transition');
        expect(text).toContain('3 of 4 payouts taken');
        expect(text).toContain('https://example.test/policy');
        expect(text).toContain('a synthetic test quote');
        expect(text).toContain(COPY_GROUP_PAYOUT_COUNT_CONCURRENT_TEXT);
        expect(text).not.toContain(COPY_GROUP_PAYOUT_COUNT_NOT_CHECKED_TEXT);
    });

    it('says the firm payout limit was not checked when a member paid count is unknown', () => {
        render(sectionOf([memberOf('a', null, 4), memberOf('b', null, 4)]));

        const text = container.textContent;
        expect(text).toContain(COPY_GROUP_PAYOUT_COUNT_NOT_CHECKED_TEXT);
        expect(text).not.toContain(COPY_GROUP_PAYOUT_COUNT_CONCURRENT_TEXT);
    });

    it('says nothing about the firm payout limit when the group stays under it', () => {
        render(sectionOf([memberOf('a', 2, 6), memberOf('b', 2, 6)]));

        const text = container.textContent;
        expect(text).not.toContain(COPY_GROUP_PAYOUT_COUNT_CONCURRENT_TEXT);
        expect(text).not.toContain(COPY_GROUP_PAYOUT_COUNT_NOT_CHECKED_TEXT);
    });

    it('says nothing about the firm payout limit for a firm with no verified firm cap', () => {
        render(sectionOf([memberOf('a', 2, null), memberOf('b', 2, null)]));

        const text = container.textContent;
        expect(text).not.toContain(COPY_GROUP_PAYOUT_COUNT_CONCURRENT_TEXT);
        expect(text).not.toContain(COPY_GROUP_PAYOUT_COUNT_NOT_CHECKED_TEXT);
    });
});
