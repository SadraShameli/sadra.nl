import {
    type Dollars,
    type FirmAccountPolicy,
    type InstrumentSymbol,
    TradingPhase,
} from '../core';
import { type PlanRulesFingerprintCheck } from './AdviceStaleness';
import { type MeasuredRebuyLag } from './EnginePolicyBuilder';
import { EvalSizingAdvisor } from './EvalSizingAdvisor';
import { FundedSizingAdvisor } from './FundedSizingAdvisor';
import { LiveSizingAdvisor } from './LiveSizingAdvisor';
import { type PersonalCaps } from './PersonalCaps';
import {
    type ReconstructedAccount,
    ReconstructedLiveKind,
} from './ReconstructedAccount';
import { type RulebookParameters } from './Rulebook';
import { type SizingAdvisor } from './SizingAdvisor';

const DEFAULT_FUNDED_HORIZON_DAYS = 252;
const DEFAULT_MAX_EVAL_DAYS = 150;

export interface SizingAdvisorCreateOptions {
    readonly accountPolicy?: FirmAccountPolicy;
    readonly fundedHorizonDays?: number;
    readonly maxEvalDays?: number;
    readonly measuredRebuyLag?: MeasuredRebuyLag | null;
    readonly paidPayoutsSinceLastLiveAccount?: null | number;
    readonly pendingPayouts?: Dollars;
    readonly personalCaps?: PersonalCaps;
    readonly personalDll?: Dollars | null;
    readonly personalPayoutOverride?: Dollars | null;
    readonly personalRetainedCushion?: Dollars | null;
    readonly planRulesFingerprint?: null | PlanRulesFingerprintCheck;
    readonly positionSizing?: null | {
        readonly instrument: InstrumentSymbol;
        readonly stopPoints: number;
    };
    readonly rulebook: RulebookParameters;
    readonly seed?: number;
    readonly sims?: number;
    readonly snapshotAsOf: string;
    readonly today: string;
    readonly trials?: number;
}

export class InstantFundedEvalAdvisorError extends Error {
    constructor(planLabel: string) {
        super(`${planLabel}: an instant-funded plan has no eval stage to size`);
        this.name = 'InstantFundedEvalAdvisorError';
    }
}

export function createSizingAdvisor(
    account: ReconstructedAccount,
    options: SizingAdvisorCreateOptions,
): SizingAdvisor {
    switch (account.kind) {
        case ReconstructedLiveKind.Live: {
            return new LiveSizingAdvisor({ ...options, account });
        }
        case TradingPhase.Eval: {
            if (account.plan.isInstantFunded) {
                throw new InstantFundedEvalAdvisorError(account.plan.label);
            }
            return new EvalSizingAdvisor({
                ...options,
                account,
                maxEvalDays: options.maxEvalDays ?? DEFAULT_MAX_EVAL_DAYS,
            });
        }
        case TradingPhase.Funded: {
            return new FundedSizingAdvisor({
                ...options,
                account,
                fundedHorizonDays:
                    options.fundedHorizonDays ?? DEFAULT_FUNDED_HORIZON_DAYS,
            });
        }
    }
}
