export enum LadderIgnoredInput {
    FundedPhase = 'fundedPhase',
    IdleDays = 'idleDays',
    MaxAttempts = 'maxAttempts',
    OwnLadder = 'ownLadder',
    PathGranularity = 'pathGranularity',
    RebuyLag = 'rebuyLag',
}

export const LADDER_IGNORED_INPUT_REASONS: Readonly<
    Record<LadderIgnoredInput, string>
> = {
    [LadderIgnoredInput.FundedPhase]:
        'scores the evaluation only, not the funded phase',
    [LadderIgnoredInput.IdleDays]:
        'trades every day and does not model idle days',
    [LadderIgnoredInput.MaxAttempts]:
        'prices unlimited retries into the cost per funded account',
    [LadderIgnoredInput.OwnLadder]:
        'builds its own eval ladders from the rung grid',
    [LadderIgnoredInput.PathGranularity]:
        'resolves each trade with a single win/loss draw',
    [LadderIgnoredInput.RebuyLag]:
        'does not model the days an account slot sits empty between attempts',
};
