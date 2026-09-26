import {
    type Plan,
    type PlanOptIns,
    type TradingFirm,
} from '~/lib/prop-calculator';

import {
    type CalculatorAction,
    CalculatorActionType,
} from './calculatorReducer';
import { toolForPathname } from './toolCatalog';

export enum ToolLinkKind {
    Boundary = 'boundary',
    InGroup = 'in-group',
}

export function classifyToolLink(from: string, to: string): ToolLinkKind {
    return toolForPathname(pathOf(from)) !== null &&
        toolForPathname(pathOf(to)) !== null
        ? ToolLinkKind.InGroup
        : ToolLinkKind.Boundary;
}

export function openInSimulatorActions(
    firm: TradingFirm,
    plan: Plan,
    optIns: PlanOptIns,
): CalculatorAction[] {
    return [
        { firm, type: CalculatorActionType.SetFirm },
        { plan, type: CalculatorActionType.SetPlan },
        {
            isTaken: optIns.takesFundedReset,
            type: CalculatorActionType.SetTakesFundedReset,
        },
        {
            isTaken: optIns.takesOneTimeEarlyWithdrawal,
            type: CalculatorActionType.SetTakesOneTimeEarlyWithdrawal,
        },
    ];
}

function pathOf(href: string): string {
    const end = href.search(/[?#]/);
    return end === -1 ? href : href.slice(0, end);
}
