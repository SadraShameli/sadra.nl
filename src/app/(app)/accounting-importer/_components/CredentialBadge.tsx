import { Badge } from '~/components/ui/Badge';
import {
    getCredentialDescriptor,
    toneClass,
} from '~/lib/accounting-importer/credentials/index';
import { cn } from '~/lib/utils';

export function CredentialBadge({ kind }: { kind: string }) {
    const d = getCredentialDescriptor(kind);
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
