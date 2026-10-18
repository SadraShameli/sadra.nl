import { Badge } from '~/components/ui/badge';
import {
    CredentialRegistry,
    toneClass,
} from '~/lib/accounting/credentials/index';
import { cn } from '~/lib/utilities';

export function CredentialBadge({ kind }: { kind: string }) {
    const d = CredentialRegistry.instance.get(kind);
    return d ? (
        <Badge
            className={cn('font-medium', toneClass(d.tone))}
            variant="secondary"
        >
            {d.label}
        </Badge>
    ) : (
        <Badge variant="outline">{kind}</Badge>
    );
}
