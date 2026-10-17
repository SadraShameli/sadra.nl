'use client';

import { Clock2 } from 'lucide-react';
import * as React from 'react';

import { Input } from '~/components/ui/input';
import {
    Popover,
    PopoverAnchor,
    PopoverContent,
} from '~/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { cn } from '~/lib/utilities';

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const CLOCK_PART_DIGITS = 2;
const CLOCK_SEPARATOR = ':';
const CENTERING_DIVISOR = 2;
const NO_SELECTION = '';

class ClockTime {
    static parse(value: string): ClockTime {
        const [hour = 0, minute = 0] = value.split(CLOCK_SEPARATOR).map(Number);
        return new ClockTime(hour, minute);
    }

    static part(value: number): string {
        return String(value).padStart(CLOCK_PART_DIGITS, '0');
    }

    constructor(
        readonly hour: number,
        readonly minute: number,
    ) {}

    toString(): string {
        return [this.hour, this.minute]
            .map((part) => ClockTime.part(part))
            .join(CLOCK_SEPARATOR);
    }

    withHour(hour: number): ClockTime {
        return new ClockTime(hour, this.minute);
    }

    withMinute(minute: number): ClockTime {
        return new ClockTime(this.hour, minute);
    }
}

function centerInColumn(element: HTMLButtonElement | null): void {
    const column = element?.parentElement;
    if (element === null || column === null || column === undefined) return;
    column.scrollTop =
        element.offsetTop -
        (column.clientHeight - element.offsetHeight) / CENTERING_DIVISOR;
}

function TimeColumn({
    count,
    label,
    onSelect,
    selected,
}: {
    readonly count: number;
    readonly label: string;
    readonly onSelect: (value: number) => void;
    readonly selected: number;
}) {
    return (
        <ToggleGroup
            aria-label={label}
            className="relative h-52 w-14 scrollbar-none flex-col justify-start gap-0.5 overflow-y-auto"
            onValueChange={(next: string) => {
                if (next !== NO_SELECTION) onSelect(Number(next));
            }}
            orientation="vertical"
            size="sm"
            type="single"
            value={String(selected)}
        >
            {Array.from({ length: count }, (_, option) => (
                <ToggleGroupItem
                    className="h-8 min-h-8 w-full shrink-0 tabular-nums"
                    key={option}
                    ref={option === selected ? centerInColumn : undefined}
                    value={String(option)}
                >
                    {ClockTime.part(option)}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    );
}

function TimeInput({
    className,
    onValueChange,
    value,
    ...properties
}: Omit<React.ComponentProps<'input'>, 'onChange' | 'type' | 'value'> & {
    onValueChange: (value: string) => void;
    value: string;
}) {
    const [isOpen, setIsOpen] = React.useState(false);
    const time = ClockTime.parse(value);
    const change = (next: ClockTime) => onValueChange(next.toString());
    return (
        <Popover onOpenChange={setIsOpen} open={isOpen}>
            <PopoverAnchor asChild>
                <div className={cn('relative flex items-center', className)}>
                    <Clock2
                        aria-hidden
                        className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground select-none"
                    />
                    <Input
                        className="appearance-none pl-8 tabular-nums [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                        onChange={(event) => onValueChange(event.target.value)}
                        onClick={() => setIsOpen(true)}
                        type="time"
                        value={value}
                        {...properties}
                    />
                </div>
            </PopoverAnchor>
            <PopoverContent
                align="start"
                className="flex w-auto gap-1 rounded-2xl p-1.5"
                onOpenAutoFocus={(event) => event.preventDefault()}
            >
                <TimeColumn
                    count={HOURS_PER_DAY}
                    label="Hour"
                    onSelect={(hour) => change(time.withHour(hour))}
                    selected={time.hour}
                />
                <TimeColumn
                    count={MINUTES_PER_HOUR}
                    label="Minute"
                    onSelect={(minute) => change(time.withMinute(minute))}
                    selected={time.minute}
                />
            </PopoverContent>
        </Popover>
    );
}

export { TimeInput };
