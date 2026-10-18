import { Spinner } from '~/components/ui/spinner';

const COMPUTING_LABEL = 'Computing';

export function ComputingIndicator() {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <Spinner aria-hidden className="size-3.5" />
            <span role="status">{COMPUTING_LABEL}</span>
        </span>
    );
}
