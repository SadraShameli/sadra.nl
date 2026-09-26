import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type AccountPrefillParameters } from '~/app/(app)/prop-calculator/accounts/_components/accountPrefill';
import NewPropAccountPage from '~/app/(app)/prop-calculator/accounts/new/page';
import {
    ALL_FIRMS,
    NO_PLAN_OPT_INS,
    type Plan,
    serializePlanId,
    type TradingFirm,
} from '~/lib/prop-calculator';
import { CalculatorUrlParameter, UrlFlag } from '~/lib/schemas/url';

vi.mock('~/lib/auth/server', () => ({
    getServerSession: () => Promise.resolve({ user: { id: 'user-1' } }),
}));

vi.mock('next/navigation', () => ({
    redirect: (href: string) => {
        throw new Error(`unexpected redirect to ${href}`);
    },
}));

vi.mock('~/trpc/server', () => ({
    api: {
        propAccounts: {
            account: { list: { prefetch: () => Promise.resolve() } },
            copyGroup: { list: { prefetch: () => Promise.resolve() } },
        },
    },
    HydrateClient: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('~/app/(app)/prop-calculator/accounts/_components/AccountForm', () => ({
    AccountCreator: (properties: Record<string, unknown>) => (
        <output className="account-creator-under-test">
            {JSON.stringify(properties)}
        </output>
    ),
}));

interface FirmPlan {
    readonly firm: TradingFirm;
    readonly plan: Plan;
}

function findFirmPlan(isWanted: (plan: Plan) => boolean): FirmPlan {
    for (const firm of ALL_FIRMS) {
        const plan = firm.plans.find(isWanted);
        if (plan !== undefined) return { firm, plan };
    }
    throw new Error('no modeled plan matches');
}

const withFundedReset = findFirmPlan((plan) => plan.fundedReset !== null);

describe('new account page prefill', () => {
    let container: HTMLDivElement;
    let root: Root;

    async function render(parameters: AccountPrefillParameters) {
        const page = await NewPropAccountPage({
            searchParams: Promise.resolve(parameters),
        });
        act(() => {
            root.render(page);
        });
    }

    function creatorProperties(): unknown {
        const output = container.querySelector('.account-creator-under-test');
        return JSON.parse(output?.textContent ?? 'null');
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

    it('passes a taken opt-in from the query to the account form', async () => {
        await render({
            [CalculatorUrlParameter.Firm]: withFundedReset.firm.id,
            [CalculatorUrlParameter.FundedReset]: UrlFlag.On,
            [CalculatorUrlParameter.Plan]: serializePlanId(
                withFundedReset.plan.id,
            ),
        });
        expect(creatorProperties()).toEqual({
            initialFirm: withFundedReset.firm.id,
            initialOptIns: {
                takesFundedReset: true,
                takesOneTimeEarlyWithdrawal: false,
            },
            initialPlan: serializePlanId(withFundedReset.plan.id),
        });
        expect(container.querySelector('[role="status"]')).toBeNull();
    });

    it('passes no opt-ins without a prefill', async () => {
        await render({});
        expect(creatorProperties()).toEqual({
            initialFirm: null,
            initialOptIns: NO_PLAN_OPT_INS,
            initialPlan: null,
        });
    });
});
