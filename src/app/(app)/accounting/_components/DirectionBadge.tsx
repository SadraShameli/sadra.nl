import type { BookingDirection } from '~/lib/accounting/core/types';

import { Badge } from '~/components/ui/badge';

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
