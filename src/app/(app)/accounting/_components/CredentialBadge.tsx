import { Badge } from '~/components/ui/Badge';
import {
    CredentialRegistry,
    toneClass,
} from '~/lib/accounting/credentials/index';
import { cn } from '~/lib/utils';

export function CredentialBadge({ kind }: { kind: string }) {
    const d = CredentialRegistry.instance().get(kind);
    if (!d) return <Badge variant="outline">{kind}</Badge>;
    return (
        <Badge
            className={cn('font-medium', toneClass(d.tone))}
            variant="secondary"
        >
            {d.label}
        </Badge>
    );
}
