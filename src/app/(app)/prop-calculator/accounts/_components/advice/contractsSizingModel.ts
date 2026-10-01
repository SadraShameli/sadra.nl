import {
    normalizePositionSizeInput,
    positionSizeFor,
    type PositionSizeInput,
    positionSizeStatusText,
    siblingInstrumentSeverityText,
    siblingInstrumentText,
} from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeModel';
import {
    defaultPositionSize,
    encodePositionSize,
    PositionSizeUrlParameter,
} from '~/app/(app)/prop-calculator/_components/positionSize/positionSizeUrlState';
import {
    dollars,
    type InstrumentSymbol,
    type Plan,
    points,
    type TradingPhase,
} from '~/lib/prop-calculator';
import { type RiskDisplayUnit } from '~/lib/prop-calculator/advisor';
import { routes } from '~/lib/site/routes';

export interface ContractsSizingInput {
    readonly instrument: InstrumentSymbol;
    readonly phase: TradingPhase;
    readonly plan: Plan;
    readonly risk: number;
    readonly stopPoints: null | number;
    readonly unit: RiskDisplayUnit;
}

export interface ContractsSizingView {
    readonly href: string;
    readonly inline: null | {
        readonly contracts: number;
        readonly siblingSeverityText: null | string;
        readonly siblingText: null | string;
        readonly statusText: string;
    };
}

export function contractsSizingOf(
    input: ContractsSizingInput,
): ContractsSizingView {
    const stopPoints =
        input.stopPoints !== null && input.stopPoints > 0
            ? points(input.stopPoints)
            : null;
    const state: PositionSizeInput = normalizePositionSizeInput({
        instrument: input.instrument,
        phase: input.phase,
        plan: input.plan,
        retryFee: dollars(input.plan.retryFee()),
        risk: dollars(input.risk),
        stopPoints: stopPoints ?? defaultPositionSize().stopPoints,
        tierProfit: null,
        unit: input.unit,
    });
    const query = encodePositionSize(
        state,
        stopPoints === null ? [PositionSizeUrlParameter.Stop] : [],
    );
    const href = `${routes.propCalculator.positionSize}?${query}`;
    if (stopPoints === null) return { href, inline: null };
    const result = positionSizeFor(state);
    return {
        href,
        inline: {
            contracts: result.contracts,
            siblingSeverityText: siblingInstrumentSeverityText(result),
            siblingText: siblingInstrumentText(result),
            statusText: positionSizeStatusText(state, result),
        },
    };
}
