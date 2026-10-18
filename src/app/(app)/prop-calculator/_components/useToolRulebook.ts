'use client';

import { useSession } from '~/lib/auth/client';
import {
    DEFAULT_RULEBOOK,
    type RulebookParameters,
} from '~/lib/prop-calculator/advisor';
import { api } from '~/trpc/react';

import { RulebookSource, rulebookSourceOf } from './bankroll/rulebookSource';

export enum ToolRulebookStatus {
    Failed = 'failed',
    Loading = 'loading',
    Ready = 'ready',
}

export interface ToolRulebook {
    readonly hasSession: boolean;
    readonly isQueryError: boolean;
    readonly rulebook: RulebookParameters;
    readonly source: RulebookSource;
    readonly status: ToolRulebookStatus;
    readonly userRulebook: null | RulebookParameters;
}

const STATUS_BY_SOURCE: Readonly<Record<RulebookSource, ToolRulebookStatus>> = {
    [RulebookSource.DefaultFailed]: ToolRulebookStatus.Failed,
    [RulebookSource.DefaultLoading]: ToolRulebookStatus.Loading,
    [RulebookSource.DefaultSessionFailed]: ToolRulebookStatus.Failed,
    [RulebookSource.DefaultSessionPending]: ToolRulebookStatus.Loading,
    [RulebookSource.DefaultSignedOut]: ToolRulebookStatus.Ready,
    [RulebookSource.User]: ToolRulebookStatus.Ready,
};

export function useToolRulebook(): ToolRulebook {
    const session = useSession();
    const hasSession = session.data?.user.id !== undefined;
    const rulebookQuery = api.propAccounts.rulebook.get.useQuery(undefined, {
        enabled: hasSession,
    });
    const userRulebook = hasSession ? (rulebookQuery.data ?? null) : null;
    const source = rulebookSourceOf({
        hasRulebook: userRulebook !== null,
        hasSession,
        isFailed: rulebookQuery.isError,
        isSessionFailed: session.error !== null,
        isSessionPending: session.isPending,
    });
    return {
        hasSession,
        isQueryError: rulebookQuery.isError,
        rulebook: userRulebook ?? DEFAULT_RULEBOOK,
        source,
        status: STATUS_BY_SOURCE[source],
        userRulebook,
    };
}
