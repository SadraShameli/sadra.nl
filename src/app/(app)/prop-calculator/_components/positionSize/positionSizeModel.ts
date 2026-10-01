import {
    formatRiskDisplay,
    type RiskDisplayFormatted,
} from '~/app/(app)/prop-calculator/_components/riskDisplay';
import { formatGateCurrency } from '~/lib/format';
import {
    ALL_FIRMS,
    ALL_INSTRUMENTS,
    CENT_ROUNDING_TOLERANCE_IN_CENTS,
    CENTS_PER_DOLLAR,
    type ContractCount,
    contractLimitAt,
    contractsAtStop,
    dollars,
    type Dollars,
    formatOneContractRisk,
    fundedStartContractLimit,
    INSTRUMENTS,
    type InstrumentSpec,
    type InstrumentSymbol,
    minStopPoints,
    MismatchSeverity,
    type Plan,
    points,
    type Points,
    type PositionSizingConfig,
    siblingInstrumentRisk,
    type SiblingInstrumentRiskResult,
    simInputsSizingIssue,
    TierBasis,
    type TierProfitContext,
    type TradingFirm,
    TradingPhase,
} from '~/lib/prop-calculator';
import { type RiskDisplayUnit } from '~/lib/prop-calculator/advisor';
import { feeEquivalentTradeRisk } from '~/lib/prop-calculator/economics';

export enum PositionSizeOutcome {
    BelowOneContractEval = 'below-one-contract-eval',
    BelowOneContractRefused = 'below-one-contract-refused',
    Capped = 'capped',
    Placed = 'placed',
}

export const POSITION_SIZE_INSTRUMENTS: readonly InstrumentSpec[] =
    ALL_INSTRUMENTS;

export const POSITION_SIZE_PHASE_LABELS: Readonly<
    Record<TradingPhase, string>
> = {
    [TradingPhase.Eval]: 'Eval',
    [TradingPhase.Funded]: 'Funded',
};

export interface ExactRiskStop {
    exactPoints: Points;
    isTickAligned: boolean;
    riskAtTickStop: Dollars;
    tickPoints: Points;
}

export interface PositionSizeInput {
    instrument: InstrumentSymbol;
    phase: TradingPhase;
    plan: Plan;
    retryFee: Dollars;
    risk: Dollars;
    stopPoints: Points;
    tierProfit: Dollars | null;
    unit: RiskDisplayUnit;
}

export interface PositionSizeResult {
    atRiskIfBustedText: null | string;
    cap: ContractCount | null;
    contracts: ContractCount;
    exactRiskStop: ExactRiskStop | null;
    feeEquivalentRisk: Dollars | null;
    fittingContracts: ContractCount;
    leftover: Dollars | null;
    minStopAtCap: null | Points;
    notes: readonly string[];
    oneContractRiskText: string;
    outcome: PositionSizeOutcome;
    placedRisk: Dollars | null;
    positionSizing: PositionSizingConfig;
    refusal: null | string;
    riskDisplay: RiskDisplayFormatted;
    siblingInstrument: SiblingInstrumentRiskResult;
}

const POINTS_DISPLAY_DECIMALS = 4;

export function formatPoints(value: number): string {
    return String(Number(value.toFixed(POINTS_DISPLAY_DECIMALS)));
}

export function fundedTierOptions(
    plan: Plan,
    instrument: InstrumentSymbol,
): readonly Dollars[] {
    const { isMicro } = INSTRUMENTS[instrument];
    return Object.values(TierBasis).flatMap((basis) =>
        plan.fundedContractTierBreakpoints(basis, isMicro).map(dollars),
    );
}

export function normalizePositionSizeInput(
    input: PositionSizeInput,
): PositionSizeInput {
    const phases = positionSizePhases(input.plan);
    const phase = phases.includes(input.phase)
        ? input.phase
        : (phases[0] ?? TradingPhase.Funded);
    const tierProfit =
        phase === TradingPhase.Funded &&
        input.tierProfit !== null &&
        fundedTierOptions(input.plan, input.instrument).includes(
            input.tierProfit,
        )
            ? input.tierProfit
            : null;
    return phase === input.phase && tierProfit === input.tierProfit
        ? input
        : { ...input, phase, tierProfit };
}

export function positionSizeFirm(plan: Plan): TradingFirm | undefined {
    return ALL_FIRMS.find((firm) => firm.plans.includes(plan));
}

export function positionSizeFor(input: PositionSizeInput): PositionSizeResult {
    const { phase, risk } = input;
    const instrument = INSTRUMENTS[input.instrument];
    const positionSizing: PositionSizingConfig = {
        instrument,
        stopPoints: input.stopPoints,
    };
    const cap = contractCap(input, positionSizing);
    const sized = contractsAtStop(risk, positionSizing, cap);
    const { contracts: placedContracts, fittingContracts, isCapped } = sized;
    const minStopAtCap = pointsOrNull(
        cap === null ? null : minStopPoints(risk, cap, instrument.pointValue),
    );
    const exactRiskStop = exactRiskStopFor(risk, placedContracts, instrument);
    const outcome = outcomeOf(fittingContracts, isCapped, phase);
    const feeEquivalentRisk = feeEquivalentRiskFor(input);
    const siblingInstrument = siblingInstrumentRisk({
        contracts: placedContracts,
        instrument,
        room: input.plan.drawdownFor(phase).amount,
        stopPoints: input.stopPoints,
    });
    return {
        atRiskIfBustedText: atRiskIfBustedTextFor(input),
        cap,
        contracts: placedContracts,
        exactRiskStop,
        feeEquivalentRisk,
        fittingContracts,
        leftover: isCapped ? null : dollars(sized.leftover),
        minStopAtCap,
        notes: [
            ...belowOneContractNotes(outcome, risk, positionSizing),
            ...(isCapped
                ? cappedNotes(input, fittingContracts, cap, exactRiskStop)
                : exactStopNotes(
                      risk,
                      placedContracts,
                      instrument,
                      exactRiskStop,
                  )),
        ],
        oneContractRiskText: formatOneContractRisk(positionSizing),
        outcome,
        placedRisk: isCapped ? null : dollars(sized.placedRisk),
        positionSizing,
        refusal:
            outcome === PositionSizeOutcome.BelowOneContractRefused
                ? simInputsSizingIssue({
                      instrument: input.instrument,
                      riskPerTrade: risk,
                      stopPoints: input.stopPoints,
                  })
                : null,
        riskDisplay: formatRiskDisplay(input.unit, {
            accountDollars: risk,
            evAtStake: null,
            feeEquivalent: feeEquivalentRisk,
        }),
        siblingInstrument,
    };
}

export function positionSizePhases(plan: Plan): readonly TradingPhase[] {
    return plan.isInstantFunded
        ? [TradingPhase.Funded]
        : [TradingPhase.Eval, TradingPhase.Funded];
}

export function positionSizeStatusText(
    input: PositionSizeInput,
    result: PositionSizeResult,
): string {
    const { symbol } = result.positionSizing.instrument;
    const stop = result.exactRiskStop;
    const stopText =
        stop === null
            ? ''
            : `; the stop for the exact risk is ${formatPoints(stop.tickPoints)} points, risking ${formatGateCurrency(stop.riskAtTickStop)}`;
    const belowOneContract = `No whole ${symbol} contract fits: one contract risks ${result.oneContractRiskText}`;
    switch (result.outcome) {
        case PositionSizeOutcome.BelowOneContractEval: {
            return `${belowOneContract}.`;
        }
        case PositionSizeOutcome.BelowOneContractRefused: {
            return `${belowOneContract}, and the funded simulation refuses this risk.`;
        }
        case PositionSizeOutcome.Capped: {
            return `${result.contracts} ${symbol}, held to the ${input.phase} contract limit${stopText}.`;
        }
        case PositionSizeOutcome.Placed: {
            const leftover =
                result.leftover === null
                    ? ''
                    : `, ${formatGateCurrency(result.leftover)} left over`;
            return `${result.contracts} ${symbol}${leftover}${stopText}.`;
        }
    }
}

export function siblingInstrumentSeverityText(
    result: PositionSizeResult,
): null | string {
    switch (result.siblingInstrument.severity) {
        case MismatchSeverity.ExceedsPlannedRisk: {
            return 'That risks more than you intended on this trade.';
        }
        case MismatchSeverity.ExceedsRoom: {
            return "That would exceed your plan's full drawdown budget, not today's remaining cushion or daily loss limit: a real risk of ruin from one fat-fingered symbol.";
        }
        case MismatchSeverity.None: {
            return null;
        }
    }
}

export function siblingInstrumentText(
    result: PositionSizeResult,
): null | string {
    const { sibling, siblingRisk } = result.siblingInstrument;
    return sibling === null || siblingRisk === null
        ? null
        : `The same ${result.contracts} on ${sibling.symbol} would risk ${formatGateCurrency(dollars(siblingRisk))}.`;
}

function atRiskIfBustedTextFor(input: PositionSizeInput): null | string {
    if (input.phase !== TradingPhase.Eval) return null;
    const formatted = formatRiskDisplay(input.unit, {
        accountDollars: input.retryFee,
        evAtStake: null,
        feeEquivalent: input.retryFee,
    });
    return `At risk if busted: ${formatted.text} (${formatted.label.toLowerCase()}), assuming a fresh eval; a fee already paid is never added on top.`;
}

function belowOneContractNotes(
    outcome: PositionSizeOutcome,
    risk: Dollars,
    positionSizing: PositionSizingConfig,
): string[] {
    if (outcome !== PositionSizeOutcome.BelowOneContractEval) return [];
    const entered = formatGateCurrency(risk);
    return [
        `No whole ${positionSizing.instrument.symbol} contract fits: one contract at a ${formatPoints(positionSizing.stopPoints)} point stop risks ${formatOneContractRisk(positionSizing)}, above your ${entered}. The eval simulation still models ${entered} per trade, because eval risk is capped at the contract limit and not rounded to whole contracts, but a real order needs at least one contract: raise the risk, tighten the stop or use a micro.`,
    ];
}

function cappedNotes(
    input: PositionSizeInput,
    fittingContracts: ContractCount,
    cap: ContractCount | null,
    exactRiskStop: ExactRiskStop | null,
): string[] {
    if (cap === null || exactRiskStop === null) return [];
    const { symbol, tickSize } = INSTRUMENTS[input.instrument];
    const limit = `The ${input.phase} contract limit is ${cap} ${symbol}: ${fittingContracts} would fit at your ${formatPoints(input.stopPoints)} point stop.`;
    const tickStop = `a stop of ${formatPoints(exactRiskStop.tickPoints)} points`;
    const tickRisk = formatGateCurrency(exactRiskStop.riskAtTickStop);
    const landing = exactRiskStop.isTickAligned
        ? `Offset the entry to ${tickStop} to put ${tickRisk} on ${cap} contracts.`
        : `${formatGateCurrency(input.risk)} on ${cap} contracts lands at a ${formatPoints(exactRiskStop.exactPoints)} point stop, off the ${formatPoints(tickSize)} point tick: offset the entry to ${tickStop}, which risks ${tickRisk}.`;
    return [
        `${limit} ${landing} A wider stop on ${cap} contracts risks more than you entered.`,
    ];
}

function contractCap(
    input: PositionSizeInput,
    positionSizing: PositionSizingConfig,
): ContractCount | null {
    const { phase, plan, tierProfit } = input;
    if (tierProfit === null && phase === TradingPhase.Funded) {
        return fundedStartContractLimit(plan, positionSizing);
    }
    return contractLimitAt(
        plan.contractLimits,
        phase,
        positionSizing.instrument.isMicro,
        tierProfit === null
            ? plan.tierProfitContext(plan.initialState())
            : tierContext(tierProfit),
    );
}

function exactRiskStopFor(
    risk: Dollars,
    placedContracts: ContractCount,
    instrument: InstrumentSpec,
): ExactRiskStop | null {
    const exactPoints = pointsOrNull(
        minStopPoints(risk, placedContracts, instrument.pointValue),
    );
    if (exactPoints === null) return null;
    const riskCents = wholeCents(risk);
    const tickCents = Math.round(
        instrument.pointValue * instrument.tickSize * CENTS_PER_DOLLAR,
    );
    const ticks = Math.floor(riskCents / (placedContracts * tickCents));
    const riskAtTickCents = ticks * placedContracts * tickCents;
    return {
        exactPoints,
        isTickAligned: riskAtTickCents === riskCents,
        riskAtTickStop: dollars(riskAtTickCents / CENTS_PER_DOLLAR),
        tickPoints: points(ticks * instrument.tickSize),
    };
}

function exactStopNotes(
    risk: Dollars,
    placedContracts: ContractCount,
    instrument: InstrumentSpec,
    exactRiskStop: ExactRiskStop | null,
): string[] {
    if (exactRiskStop === null || exactRiskStop.isTickAligned) return [];
    return [
        `The exact stop for ${formatGateCurrency(risk)} on ${placedContracts} ${instrument.symbol} is ${formatPoints(exactRiskStop.exactPoints)} points, off the ${formatPoints(instrument.tickSize)} point tick: rounded down to ${formatPoints(exactRiskStop.tickPoints)} points it risks ${formatGateCurrency(exactRiskStop.riskAtTickStop)}, never more than you entered.`,
    ];
}

function feeEquivalentRiskFor(input: PositionSizeInput): Dollars | null {
    if (input.phase !== TradingPhase.Eval) return null;
    return feeEquivalentTradeRisk({
        evalDrawdown: input.plan.drawdown.amount,
        retryFee: input.retryFee,
        risk: input.risk,
    }).value;
}

function outcomeOf(
    fittingContracts: ContractCount,
    isCapped: boolean,
    phase: TradingPhase,
): PositionSizeOutcome {
    if (isCapped) return PositionSizeOutcome.Capped;
    if (fittingContracts > 0) return PositionSizeOutcome.Placed;
    switch (phase) {
        case TradingPhase.Eval: {
            return PositionSizeOutcome.BelowOneContractEval;
        }
        case TradingPhase.Funded: {
            return PositionSizeOutcome.BelowOneContractRefused;
        }
    }
}

function pointsOrNull(value: null | number): null | Points {
    return value === null ? null : points(value);
}

function tierContext(profit: Dollars): TierProfitContext {
    return {
        peakDayCloseProfit: profit,
        peakIntradayProfit: profit,
        profit,
        sessionOpenProfit: profit,
    };
}

function wholeCents(amount: number): number {
    return Math.floor(
        amount * CENTS_PER_DOLLAR + CENT_ROUNDING_TOLERANCE_IN_CENTS,
    );
}
