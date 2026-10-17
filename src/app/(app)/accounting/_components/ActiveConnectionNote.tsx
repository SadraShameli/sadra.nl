import { FILTER_CONTROL_CLASS } from '~/components/ui/filter-control';
import { CredentialRegistry } from '~/lib/accounting/credentials/index';
import { cn } from '~/lib/utilities';

export function ActiveConnectionNote({
    credential,
    roleNoun,
}: {
    credential: undefined | { kind: string; label: string };
    roleNoun: string;
}) {
    const descriptor = credential
        ? CredentialRegistry.instance.get(credential.kind)
        : undefined;
    return credential ? (
        <span
            className={cn(
                FILTER_CONTROL_CLASS,
                'inline-flex shrink-0 items-center border border-line px-4 whitespace-nowrap text-ink-muted dark:border-line',
            )}
        >
            {descriptor?.label ?? credential.kind} · {credential.label}
        </span>
    ) : (
        <span className="text-xs text-ink-muted">No {roleNoun} set.</span>
    );
}
