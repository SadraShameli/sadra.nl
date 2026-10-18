import { CALCULATOR_SCALAR_BOUNDS } from '~/lib/schemas/url';

export interface TradingInputBound {
    readonly max: number;
    readonly min: number;
    readonly step: number;
}

export interface TradingInputBounds {
    readonly fundedHorizonDays: TradingInputBound;
    readonly maxEvalDays: TradingInputBound;
    readonly trials: TradingInputBound;
}

const TRIALS_STEP = 100;
const MAX_EVAL_DAYS_STEP = 5;
const FUNDED_HORIZON_STEP = 1;
const FUNDED_HORIZON_UI_MAX_DAYS = 730;

const TRADING_INPUT_BOUNDS = {
    fundedHorizonDays: {
        max: FUNDED_HORIZON_UI_MAX_DAYS,
        min: CALCULATOR_SCALAR_BOUNDS.fundedDays.min,
        step: FUNDED_HORIZON_STEP,
    },
    maxEvalDays: {
        max: CALCULATOR_SCALAR_BOUNDS.maxDays.max,
        min: CALCULATOR_SCALAR_BOUNDS.maxDays.min,
        step: MAX_EVAL_DAYS_STEP,
    },
    trials: {
        max: CALCULATOR_SCALAR_BOUNDS.trials.max,
        min: CALCULATOR_SCALAR_BOUNDS.trials.min,
        step: TRIALS_STEP,
    },
} as const satisfies TradingInputBounds;

export function tradingInputBounds(): TradingInputBounds {
    return TRADING_INPUT_BOUNDS;
}
