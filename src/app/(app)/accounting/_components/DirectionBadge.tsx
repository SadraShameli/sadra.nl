import { Badge } from '~/components/ui/badge';
import {
    BOOKING_DIRECTIONS,
    type BookingDirection,
} from '~/lib/accounting/core/types';

const DIRECTION_LABEL: Readonly<Record<BookingDirection, string>> = {
    IN: 'In',
    OUT: 'Out',
};

export const DIRECTION_OPTIONS: readonly {
    readonly label: string;
    readonly value: BookingDirection;
}[] = BOOKING_DIRECTIONS.map((direction) => ({
    label: DIRECTION_LABEL[direction],
    value: direction,
}));

export function DirectionBadge({ direction }: { direction: BookingDirection }) {
    return <Badge>{DIRECTION_LABEL[direction]}</Badge>;
}

export function directionLabel(value: string): string {
    const direction = BOOKING_DIRECTIONS.find((d) => d === value);
    return direction === undefined ? value : DIRECTION_LABEL[direction];
}
