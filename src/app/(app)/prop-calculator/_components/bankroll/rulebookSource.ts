import { CopySplitFundedSource } from '~/lib/prop-calculator/advisor/policy';

export enum RulebookSource {
    DefaultFailed = 'default-failed',
    DefaultLoading = 'default-loading',
    DefaultSessionFailed = 'default-session-failed',
    DefaultSessionPending = 'default-session-pending',
    DefaultSignedOut = 'default-signed-out',
    User = 'user',
}

export interface RulebookSourceInputs {
    readonly hasRulebook: boolean;
    readonly hasSession: boolean;
    readonly isFailed: boolean;
    readonly isSessionFailed: boolean;
    readonly isSessionPending: boolean;
}

export interface RulebookSourceNoticeContent {
    readonly isFailure: boolean;
    readonly text: string;
}

const DEFAULT_RULEBOOK_OWNER_TEXT = 'the default rulebook';

const RULEBOOK_SOURCE_NOTICE: Readonly<
    Record<RulebookSource, null | RulebookSourceNoticeContent>
> = {
    [RulebookSource.DefaultFailed]: {
        isFailure: true,
        text: `Your rulebook could not be loaded, so ${DEFAULT_RULEBOOK_OWNER_TEXT} is used here.`,
    },
    [RulebookSource.DefaultLoading]: {
        isFailure: false,
        text: `Loading your rulebook: ${DEFAULT_RULEBOOK_OWNER_TEXT} is used until it loads.`,
    },
    [RulebookSource.DefaultSessionFailed]: {
        isFailure: true,
        text: `Your sign-in could not be checked, so ${DEFAULT_RULEBOOK_OWNER_TEXT} is used here.`,
    },
    [RulebookSource.DefaultSessionPending]: {
        isFailure: false,
        text: `Checking your sign-in: ${DEFAULT_RULEBOOK_OWNER_TEXT} is used until it finishes.`,
    },
    [RulebookSource.DefaultSignedOut]: null,
    [RulebookSource.User]: null,
};

export function copySplitFundedSourceOf(
    source: RulebookSource,
): CopySplitFundedSource {
    return source === RulebookSource.User
        ? CopySplitFundedSource.UserRulebook
        : CopySplitFundedSource.DefaultRulebook;
}

export function rulebookOwnerText(source: RulebookSource): string {
    return source === RulebookSource.User
        ? 'your rulebook'
        : DEFAULT_RULEBOOK_OWNER_TEXT;
}

export function rulebookSourceNotice(
    source: RulebookSource,
): null | RulebookSourceNoticeContent {
    return RULEBOOK_SOURCE_NOTICE[source];
}

export function rulebookSourceOf(inputs: RulebookSourceInputs): RulebookSource {
    if (!inputs.hasSession) {
        if (inputs.isSessionPending)
            return RulebookSource.DefaultSessionPending;
        return inputs.isSessionFailed
            ? RulebookSource.DefaultSessionFailed
            : RulebookSource.DefaultSignedOut;
    }
    if (inputs.hasRulebook) return RulebookSource.User;
    return inputs.isFailed
        ? RulebookSource.DefaultFailed
        : RulebookSource.DefaultLoading;
}
