import { Calculator } from 'lucide-react';
import { type ReactNode } from 'react';

import {
    ToolsWorkerPhase,
    type ToolsWorkerState,
} from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { EmptyState, EmptyStateSize } from '~/components/ui/empty-state';

interface BankrollRunStatusProperties {
    readonly emptyText: string;
    readonly isRequested: boolean;
    readonly skeleton: ReactNode;
    readonly state: ToolsWorkerState;
}

const EMPTY_TITLE = 'No result yet';

export function BankrollEmptyResult({ text }: { readonly text: string }) {
    return (
        <EmptyState
            description={text}
            icon={Calculator}
            size={EmptyStateSize.Compact}
            title={EMPTY_TITLE}
        />
    );
}

export function BankrollRunFailure({
    state,
}: {
    readonly state: ToolsWorkerState;
}) {
    return state.phase === ToolsWorkerPhase.Failed ? (
        <Alert variant="destructive">
            <AlertDescription>{state.reason}</AlertDescription>
        </Alert>
    ) : null;
}

export function BankrollRunStatus({
    emptyText,
    isRequested,
    skeleton,
    state,
}: BankrollRunStatusProperties) {
    if (!isRequested) return <BankrollEmptyResult text={emptyText} />;
    return isAwaitingToolsResult(state) ? (
        skeleton
    ) : (
        <BankrollRunFailure state={state} />
    );
}

export function isAwaitingRequestedResult(
    isRequested: boolean,
    state: ToolsWorkerState,
): boolean {
    return isRequested && isAwaitingToolsResult(state);
}

export function isAwaitingToolsResult(state: ToolsWorkerState): boolean {
    return (
        state.phase === ToolsWorkerPhase.Idle ||
        state.phase === ToolsWorkerPhase.Running
    );
}
