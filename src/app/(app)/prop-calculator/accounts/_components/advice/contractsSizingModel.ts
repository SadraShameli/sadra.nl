import {
    fundedTierOptions,
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
    contractLimitAt,
    type Dollars,
    dollars,
    INSTRUMENTS,
    type InstrumentSymbol,
    type Plan,
    points,
    type TierProfitContext,
    TradingPhase,
} from '~/lib/prop-calculator';
import { type RiskDisplayUnit } from '~/lib/prop-calculator/advisor';
import { routes } from '~/lib/site/routes';

export interface ContractsSizingInput {
    readonly instrument: InstrumentSymbol;
    readonly phase: TradingPhase;
    readonly plan: Plan;
    readonly risk: number;
    readonly stopPoints: null | number;
    readonly tierContext: null | TierProfitContext;
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
        tierProfit: tierProfitOf(input),
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

function tierProfitOf(input: ContractsSizingInput): Dollars | null {
    const { instrument, phase, plan, tierContext } = input;
    if (tierContext === null || phase !== TradingPhase.Funded) return null;
    const { isMicro } = INSTRUMENTS[instrument];
    const capAt = (context: TierProfitContext) =>
        contractLimitAt(plan.contractLimits, phase, isMicro, context);
    const actualCap = capAt(tierContext);
    if (actualCap === capAt(plan.tierProfitContext(plan.initialState()))) {
        return null;
    }
    const matching = fundedTierOptions(plan, instrument).filter(
        (option) => capAt(uniformTierContext(option)) === actualCap,
    );
    return matching.length === 0 ? null : dollars(Math.min(...matching));
}

function uniformTierContext(profit: number): TierProfitContext {
    return {
        peakDayCloseProfit: profit,
        peakIntradayProfit: profit,
        profit,
        sessionOpenProfit: profit,
    };
}
