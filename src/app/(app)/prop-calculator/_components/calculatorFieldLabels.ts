import { type EnginePolicy } from '~/lib/prop-calculator/advisor/policy';

export const CALCULATOR_FIELD_LABELS = {
    fundedHorizonDays: 'Funded horizon (trading days)',
    instrument: 'Instrument (contract-limit enforcement)',
    payoutRequestOverride: 'Payout request size ($)',
    rebuyLagDays: 'Rebuy lag (trading days)',
    retainedCushionRequest: 'Retained cushion on payout ($)',
    stopPoints: 'Stop distance (points)',
} as const satisfies Partial<Record<keyof EnginePolicy, string>>;
