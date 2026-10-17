import {
    ToolsWorkerPhase,
    type ToolsWorkerState,
} from '~/app/(app)/prop-calculator/_components/useToolsWorker';
import { Alert, AlertDescription } from '~/components/ui/alert';

interface BankrollRunStatusProperties {
    idleText?: string;
    isRequested: boolean;
    state: ToolsWorkerState;
}

const RUNNING_TEXT = 'Simulating, this can take a few seconds.';

export function BankrollRunStatus({
    idleText,
    isRequested,
    state,
}: BankrollRunStatusProperties) {
    if (isRequested && state.phase === ToolsWorkerPhase.Running) {
        return (
            <p
                aria-live="polite"
                className="animate-pulse text-sm text-muted-foreground"
                role="status"
            >
                {RUNNING_TEXT}
            </p>
        );
    }
    if (isRequested && state.phase === ToolsWorkerPhase.Failed) {
        return (
            <Alert variant="destructive">
                <AlertDescription>{state.reason}</AlertDescription>
            </Alert>
        );
    }
    return isRequested || idleText === undefined ? null : (
        <p className="text-sm text-muted-foreground">{idleText}</p>
    );
}
