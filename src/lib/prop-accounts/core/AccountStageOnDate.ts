import { impliedEvalPassOn } from './AccountEventKind';
import { type PlanLifecycleFacts } from './AccountLifecycle';
import { AccountStage } from './AccountStage';
import { compareText } from './IsoDate';

export interface AccountStageStarts {
    readonly evalPassedOn: null | string;
    readonly movedLiveOn: null | string;
}

export interface StagedAccount {
    readonly fundedOn: null | string;
    readonly purchasedOn: string;
    readonly stage: AccountStage;
}

export const NO_RECORDED_STAGE_STARTS: AccountStageStarts = {
    evalPassedOn: null,
    movedLiveOn: null,
};

export function accountStageOn(
    account: StagedAccount,
    facts: Pick<PlanLifecycleFacts, 'isInstantFunded'>,
    recorded: AccountStageStarts,
    asOf: string,
): AccountStage {
    if (account.stage === AccountStage.Eval) return AccountStage.Eval;
    const evalLeftOn = evalLeftOnOf(account, facts, recorded);
    if (evalLeftOn !== null && compareText(asOf, evalLeftOn) < 0) {
        return AccountStage.Eval;
    }
    if (account.stage === AccountStage.Funded) return AccountStage.Funded;
    return recorded.movedLiveOn === null ||
        compareText(asOf, recorded.movedLiveOn) >= 0
        ? AccountStage.Live
        : AccountStage.Funded;
}

function evalLeftOnOf(
    account: StagedAccount,
    facts: Pick<PlanLifecycleFacts, 'isInstantFunded'>,
    recorded: AccountStageStarts,
): null | string {
    return facts.isInstantFunded
        ? null
        : (recorded.evalPassedOn ??
              impliedEvalPassOn(account, facts, false)?.on ??
              null);
}
