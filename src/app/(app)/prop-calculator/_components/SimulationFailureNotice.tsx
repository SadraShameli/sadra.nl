import { cn } from '~/lib/utilities';

interface SimulationFailureNoticeProperties {
    message: null | string;
}

export function SimulationFailureNotice({
    message,
}: SimulationFailureNoticeProperties) {
    if (message === null) return null;
    return (
        <p
            className={cn(
                'app-prop-calculator__simulation-failure',
                'rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400',
            )}
        >
            {message}
        </p>
    );
}
