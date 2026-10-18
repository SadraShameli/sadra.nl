import { Alert, AlertDescription } from '~/components/ui/alert';

interface SimulationFailureNoticeProperties {
    message: null | string;
}

export function SimulationFailureNotice({
    message,
}: SimulationFailureNoticeProperties) {
    if (message === null) return null;
    return (
        <Alert
            className="app-prop-calculator__simulation-failure"
            variant="destructive"
        >
            <AlertDescription>{message}</AlertDescription>
        </Alert>
    );
}
