import { Alert, AlertDescription } from '~/components/ui/Alert';

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
            variant="warning"
        >
            <AlertDescription>{message}</AlertDescription>
        </Alert>
    );
}
