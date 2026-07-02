import { Badge } from '~/components/ui/Badge';
import { CredentialRegistry } from '~/lib/accounting/credentials/index';

export function ActiveConnectionNote({
    credential,
    roleNoun,
}: {
    credential: undefined | { kind: string; label: string };
    roleNoun: string;
}) {
    const descriptor = credential
        ? CredentialRegistry.instance().get(credential.kind)
        : undefined;
    return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {credential ? (
                <Badge className="font-normal" variant="outline">
                    {descriptor?.label ?? credential.kind} · {credential.label}
                </Badge>
            ) : (
                <span>No {roleNoun} set.</span>
            )}
        </div>
    );
}
