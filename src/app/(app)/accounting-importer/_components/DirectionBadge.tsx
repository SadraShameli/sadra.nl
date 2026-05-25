import type { BookingDirection } from '~/lib/accounting-importer/core/types';

import { Badge } from '~/components/ui/Badge';

export function DirectionBadge({ direction }: { direction: BookingDirection }) {
    return (
        <Badge
            className="font-mono text-[10px]"
            variant={direction === 'IN' ? 'success' : 'destructive'}
        >
            {direction}
        </Badge>
    );
}
