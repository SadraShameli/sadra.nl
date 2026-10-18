import { Badge } from '~/components/ui/badge';
import { CredentialRegistry } from '~/lib/accounting/credentials/index';

export function CredentialBadge({ kind }: { kind: string }) {
    return (
        <Badge>{CredentialRegistry.instance.get(kind)?.label ?? kind}</Badge>
    );
}
