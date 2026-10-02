import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type CopyGroupAccount,
    copyGroupRows,
} from '~/app/(app)/prop-calculator/accounts/_components/copyGroups/copyGroupRows';
import {
    type OverviewAccountRow,
    type OverviewSnapshotRow,
} from '~/app/(app)/prop-calculator/accounts/_components/overview/overviewModel';
import {
    COPY_GROUP_LIVE_TRIGGERS_ENFORCED_TEXT,
    COPY_GROUP_LIVE_TRIGGERS_NOT_CHECKED_TEXT,
    copyGroupSizingSectionsOf,
} from '~/app/(app)/prop-calculator/accounts/copy-groups/copyGroupSizingModel';
import { GroupSizingSection } from '~/app/(app)/prop-calculator/accounts/copy-groups/GroupSizingSection';
import { formatCurrency } from '~/lib/format';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
    DashboardBalanceConvention,
    usdCents,
} from '~/lib/prop-accounts';
import {
    CENTS_PER_DOLLAR,
    dollars,
    findFirm,
    FirmAccountPolicy,
    FirmId,
    type LiveTransitionTrigger,
    MffuVariant,
    PolicySourceKind,
    PolicyVerification,
    serializePlanId,
    SingleDayProfitTrigger,
} from '~/lib/prop-calculator';
import { DEFAULT_RULEBOOK } from '~/lib/prop-calculator/advisor';

const USER_ID = 'user-a';
const TODAY = '2026-09-26';
const GROUP = {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Main copy',
    notes: null,
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

function mffProPlan() {
    const plan = findFirm(FirmId.Mffu)?.findPlan({
        accountSize: 50_000,
        firm: FirmId.Mffu,
        variant: MffuVariant.Pro,
    });
    if (plan === undefined) throw new Error('no MFF Pro 50K plan');
    return plan;
}

const PLAN = mffProPlan();
const DOCUMENTED_RISK = DEFAULT_RULEBOOK.funded.riskCents / CENTS_PER_DOLLAR;
const PEAK = PLAN.accountSize + 20_000;
const THRESHOLD = PEAK - PLAN.fundedDrawdown.amount;
const ROOMY_BALANCE_CENTS = Math.round((THRESHOLD + DOCUMENTED_RISK * 5) * 100);

function accountRow(id: string): CopyGroupAccount & OverviewAccountRow {
    return {
        accountSize: PLAN.accountSize,
        archivedAt: null,
        copyGroupId: GROUP.id,
        dashboardConvention: DashboardBalanceConvention.Nominal,
        externalFirmId: null,
        firmId: PLAN.id.firm,
        firstFundedTradeOn: '2026-08-01',
        fundedOn: '2026-08-01',
        id,
        label: id,
        liveStartBalanceCents: null,
        notes: null,
        optIns: {},
        personalRules: {},
        planLabel: null,
        planSerial: serializePlanId(PLAN.id),
        purchasedOn: '2026-07-01',
        readIssues: [],
        replacesAccountId: null,
        stage: AccountStage.Funded,
        status: AccountStatus.Active,
        tags: [],
        tracking: AccountTracking.Modeled,
        userId: USER_ID,
    } as unknown as CopyGroupAccount & OverviewAccountRow;
}

function snapshotRow(accountId: string): OverviewSnapshotRow {
    return {
        accountId,
        asOf: TODAY,
        balanceAtLastPayoutCents: null,
        balanceCents: usdCents(ROOMY_BALANCE_CENTS),
        createdAt: new Date(`${TODAY}T00:00:00Z`),
        cumulativePayoutCents: null,
        cycleBestDayProfitCents: null,
        dashboardFloorCents: null,
        evalBestDayProfitCents: null,
        floorAtLastPayoutCents: null,
        highestEodBalanceCents: usdCents(Math.round(PEAK * 100)),
        highestIntradayBalanceCents: null,
        id: `${accountId}-snapshot`,
        lastPayoutOn: null,
        lastTradedOn: null,
        payoutsTaken: null,
        qualifyingDaysSinceLastPayout: null,
        tradingDays: 20,
        userId: USER_ID,
    };
}

const mffu = findFirm(FirmId.Mffu) as unknown as {
    accountPolicy: FirmAccountPolicy;
};
const originalPolicy = mffu.accountPolicy;

function sectionFor(triggers: null | readonly LiveTransitionTrigger[]) {
    const accounts = [accountRow('a'), accountRow('b')];
    if (triggers !== null) mffu.accountPolicy = new StubTriggerPolicy(triggers);
    const sections = copyGroupSizingSectionsOf(
        DEFAULT_RULEBOOK,
        USER_ID,
        TODAY,
        accounts,
        [],
        [],
        accounts.map((account) => snapshotRow(account.id)),
        copyGroupRows([GROUP], accounts).groups,
    );
    const section = sections.get(GROUP.id);
    const [row] = copyGroupRows([GROUP], accounts).groups;
    if (section === undefined || row === undefined) {
        throw new Error('no section for the group');
    }
    return { row, section };
}

describe('the copy-group sizing view words a verified live trigger and a sub-contract rung (PT-36h, F-145, F-154)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(triggers: null | readonly LiveTransitionTrigger[]) {
        const { row, section } = sectionFor(triggers);
        act(() => {
            root.render(
                <GroupSizingSection
                    row={row}
                    sizing={{ kind: 'ready', section }}
                />,
            );
        });
    }

    function setStop(text: string) {
        const input = container.querySelector<HTMLInputElement>(
            'input[id^="copy-group-stop-"]',
        );
        if (input === null) throw new Error('no stop input');
        act(() => {
            Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value',
            )?.set?.call(input, text);
            input.dispatchEvent(new Event('input', { bubbles: true }));
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
        mffu.accountPolicy = originalPolicy;
    });

    const verifiedSingleDay = [
        new SingleDayProfitTrigger(dollars(250), true, false, CONFIRMED_SOURCE),
    ];

    it('says in words that live triggers are not checked for a firm no source confirms', () => {
        render(null);

        expect(container.textContent).toContain(
            COPY_GROUP_LIVE_TRIGGERS_NOT_CHECKED_TEXT,
        );
        expect(container.textContent).not.toContain(
            COPY_GROUP_LIVE_TRIGGERS_ENFORCED_TEXT,
        );
    });

    it('prices a verified single-day trigger into the shown group size and says the trigger is applied', () => {
        render(verifiedSingleDay);

        expect(container.textContent).toContain(
            `Documented size for every copy: ${formatCurrency(100)}`,
        );
        expect(container.textContent).toContain(
            COPY_GROUP_LIVE_TRIGGERS_ENFORCED_TEXT,
        );
        expect(container.textContent).not.toContain(
            COPY_GROUP_LIVE_TRIGGERS_NOT_CHECKED_TEXT,
        );
    });

    it('says the group size cannot be placed when one contract at the entered stop risks more than it', () => {
        render(null);

        setStop('20');

        expect(container.textContent).toContain('cannot be placed');
        expect(container.textContent).toContain(formatCurrency(400, 2));
    });

    it('says how many whole contracts each copy places when the group size fits at the entered stop', () => {
        render(null);

        setStop('5');

        expect(container.textContent).toContain(
            'Each copy places 2 contracts at this stop',
        );
        expect(container.textContent).not.toContain('cannot be placed');
    });

    it('says one contract at the entered stop risks more than the verified ceiling leaves, not that the cushion is gone', () => {
        render(verifiedSingleDay);

        setStop('100');

        expect(container.textContent).toContain(
            'cannot be sized at this stop',
        );
        expect(container.textContent).toContain(
            'One contract at this stop risks more than the size allowed for a and b.',
        );
        expect(container.textContent).not.toContain('No cushion room');
        expect(container.textContent).not.toContain('cushion room left');
    });

    it('says nothing about contracts while no stop is entered', () => {
        render(null);

        expect(container.textContent).not.toContain('cannot be placed');
        expect(container.textContent).not.toContain('Each copy places');
    });
});
