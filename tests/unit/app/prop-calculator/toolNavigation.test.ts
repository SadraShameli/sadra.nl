import { describe, expect, it } from 'vitest';

import {
    CalculatorActionType,
    calculatorReducer,
    defaultCalculatorState,
} from '~/app/(app)/prop-calculator/_components/calculatorReducer';
import {
    classifyToolLink,
    openInSimulatorActions,
    ToolLinkKind,
} from '~/app/(app)/prop-calculator/_components/toolNavigation';
import { encodeState } from '~/app/(app)/prop-calculator/_components/urlState';
import { initialStateFromSearch } from '~/app/(app)/prop-calculator/_components/useCalculator';
import { ALL_FIRMS, FirmId } from '~/lib/prop-calculator';
import { routes } from '~/lib/site/routes';

const { accounts, analysis, compare, index, simulator, sizing } =
    routes.propCalculator;

function planWithFundedReset() {
    for (const firm of ALL_FIRMS) {
        if (firm.id === FirmId.Apex) continue;
        const plan = firm.plans.find((p) => p.fundedReset !== null);
        if (plan) return { firm, plan };
    }
    throw new Error('no non-Apex plan offers a funded reset');
}

describe('classifyToolLink', () => {
    it('treats compare to simulator as in-group', () => {
        expect(classifyToolLink(compare, simulator)).toBe(ToolLinkKind.InGroup);
    });

    it('treats a subnav link to a sibling tool as in-group, with or without a query', () => {
        expect(classifyToolLink(simulator, analysis)).toBe(
            ToolLinkKind.InGroup,
        );
        expect(classifyToolLink(analysis, `${sizing}?firm=apex&wr=0.4`)).toBe(
            ToolLinkKind.InGroup,
        );
        expect(classifyToolLink(`${analysis}?x=1#tail-risk`, sizing)).toBe(
            ToolLinkKind.InGroup,
        );
    });

    it('treats hub to tool and accounts to tool as a boundary', () => {
        expect(classifyToolLink(index, `${simulator}?firm=apex`)).toBe(
            ToolLinkKind.Boundary,
        );
        expect(classifyToolLink(accounts.index, simulator)).toBe(
            ToolLinkKind.Boundary,
        );
        expect(classifyToolLink(accounts.detail('a1'), simulator)).toBe(
            ToolLinkKind.Boundary,
        );
    });

    it('treats a tool to anywhere outside the tools as a boundary', () => {
        expect(classifyToolLink(simulator, accounts.new)).toBe(
            ToolLinkKind.Boundary,
        );
        expect(classifyToolLink(simulator, index)).toBe(ToolLinkKind.Boundary);
        expect(classifyToolLink('/elsewhere', '/other')).toBe(
            ToolLinkKind.Boundary,
        );
    });
});

describe('openInSimulatorActions', () => {
    it('dispatches SetFirm, SetPlan and the opt-ins, in that order', () => {
        const { firm, plan } = planWithFundedReset();
        const actions = openInSimulatorActions(firm, plan, {
            takesFundedReset: true,
            takesOneTimeEarlyWithdrawal: false,
        });
        expect(actions.map((action) => action.type)).toEqual([
            CalculatorActionType.SetFirm,
            CalculatorActionType.SetPlan,
            CalculatorActionType.SetTakesFundedReset,
            CalculatorActionType.SetTakesOneTimeEarlyWithdrawal,
        ]);
    });

    it('lands the reducer on the row firm, plan and opt-ins and keeps the other inputs', () => {
        const { firm, plan } = planWithFundedReset();
        const before = {
            ...defaultCalculatorState(),
            rrRatio: 2.5,
            winrate: 0.47,
        };
        const after = openInSimulatorActions(firm, plan, {
            takesFundedReset: true,
            takesOneTimeEarlyWithdrawal: false,
        }).reduce(calculatorReducer, before);
        expect(after.firm).toBe(firm);
        expect(after.plan).toBe(plan);
        expect(after.takesFundedReset).toBe(true);
        expect(after.takesOneTimeEarlyWithdrawal).toBe(false);
        expect(after.winrate).toBe(0.47);
        expect(after.rrRatio).toBe(2.5);
    });

    it('ignores the incoming query: the actions carry the whole change', () => {
        const { firm, plan } = planWithFundedReset();
        const actions = openInSimulatorActions(firm, plan, {
            takesFundedReset: false,
            takesOneTimeEarlyWithdrawal: false,
        });
        for (const action of actions) {
            expect(action.type).not.toBe(CalculatorActionType.ApplyState);
        }
    });
});

describe('boundary links hydrate through the lazy init', () => {
    it('decodes the query of a hub link into the initial state', () => {
        const { firm, plan } = planWithFundedReset();
        const withFirm = calculatorReducer(defaultCalculatorState(), {
            firm,
            type: CalculatorActionType.SetFirm,
        });
        const withPlan = calculatorReducer(withFirm, {
            plan,
            type: CalculatorActionType.SetPlan,
        });
        const shared = calculatorReducer(withPlan, {
            type: CalculatorActionType.SetWinrate,
            value: 0.52,
        });
        const href = `${simulator}?${encodeState(shared).toString()}`;
        expect(classifyToolLink(index, href)).toBe(ToolLinkKind.Boundary);
        const hydrated = initialStateFromSearch(
            new URL(href, 'https://x').search,
        );
        expect(hydrated.firm).toBe(firm);
        expect(hydrated.plan).toBe(plan);
        expect(hydrated.winrate).toBe(0.52);
    });
});
