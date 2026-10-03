import { type AccountState, type FirmAccountPolicy, type Plan } from '~/lib/prop-calculator/core';
import { type EvalStateValueResult } from '~/lib/prop-calculator/core';
import { type FundedStateValueResult } from '~/lib/prop-calculator/core/FundedStateValue';

import { type DifferenceReasonDetail } from '../DifferenceReason';
import {
    type DpAdviceGapEntry,
    type DpAdviceSamples,
    type DpSampleStage,
} from '../DpAdviceRow';
import { type ReconstructedFundedOrEvalAccount } from '../ReconstructedAccount';
import { type RulebookParameters } from '../Rulebook';
import { type SizingObjective } from '../SizingObjective';
import { type DpGateCitation, type DpGateFailure, type DpValidationVerdict } from './DpValidationGate';
import { type DpSolveConfig } from './DpConfigKey';

export const EVAL_CUSHION_STEP_DOLLARS_DEFAULT = 100;

export type DpAdviceAccount = Pick<
    ReconstructedFundedOrEvalAccount,
    'fundedTracker' | 'kind' | 'plan' | 'state'
>;

export type DpEligibility =
    | { readonly eligible: false; readonly reason: string }
    | { readonly eligible: true };

export interface DpAdvice {
    readonly configKey: string;
    readonly gaps: readonly DpAdviceGapEntry[];
    readonly notValidated: DpNotValidatedDetail | null;
    readonly objective: SizingObjective;
    readonly reasons: readonly DifferenceReasonDetail[];
    readonly samples: DpAdviceSamples;
    readonly solverVersion: number;
    readonly validated: boolean;
    readonly validationRef: null | string;
}

export interface DpAdviceInput {
    readonly account: DpAdviceAccount;
    readonly accountPolicy?: FirmAccountPolicy;
    readonly config: DpSolveConfig;
    readonly documentedPeakRisk: null | number;
    readonly documentedRungDollars: number;
    readonly solution: DpSolutionView;
    readonly validation: DpValidationVerdict;
}

export interface DpNotValidatedDetail {
    readonly citation: DpGateCitation | null;
    readonly failure: DpGateFailure;
    readonly result: null | string;
}

export interface DpSolutionView {
    readonly evalResult: Pick<EvalStateValueResult, 'riskAtReachedState'> & {
        readonly dayPolicy: { readonly ladder: readonly number[] };
    };
    readonly fundedResult: Pick<
        FundedStateValueResult,
        'cushionGrid' | 'dayPolicy' | 'isGridSaturated'
    >;
}

export interface DpSolveConfigInput
    extends Omit<DpSolveConfig, 'fundedGrid' | 'planSerial'> {
    readonly fundedGrid: DpSolveConfig['fundedGrid'];
    readonly personalPayoutRequest: null | number;
    readonly personalRetainedCushion: null | number;
    readonly plan: Plan;
    readonly rulebook: RulebookParameters;
}

export function dpAdviceFor(_input: DpAdviceInput): DpAdvice {
    throw new Error('not implemented');
}

export function dpEligibility(_plan: Plan): DpEligibility {
    throw new Error('not implemented');
}

export function dpEvalDayIndex(_state: AccountState): null | number {
    throw new Error('not implemented');
}

export function dpSolveConfigFor(_input: DpSolveConfigInput): DpSolveConfig {
    throw new Error('not implemented');
}

export function ineligibleDpAdvice(_input: {
    readonly config: DpSolveConfig;
    readonly reason: string;
    readonly stage: DpSampleStage;
}): DpAdvice {
    throw new Error('not implemented');
}
