'use client';

import { Clock2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '~/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
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
    'aria-label': ariaLabel,
    className,
    disabled,
    id,
    onValueChange,
    value,
}: {
    readonly 'aria-label'?: string;
    readonly className?: string;
    readonly disabled?: boolean;
    readonly id?: string;
    readonly onValueChange: (value: string) => void;
    readonly value: string;
}) {
    const [isOpen, setIsOpen] = React.useState(false);
    const time = ClockTime.parse(value);
    const change = (next: ClockTime) => onValueChange(next.toString());
    return (
        <Popover onOpenChange={setIsOpen} open={isOpen}>
            <PopoverTrigger asChild>
                <Button
                    aria-label={ariaLabel}
                    className={cn(
                        'justify-start gap-2 font-normal tabular-nums',
                        className,
                    )}
                    disabled={disabled}
                    id={id}
                    type="button"
                    variant="outline"
                >
                    <Clock2
                        className="text-muted-foreground"
                        data-icon="inline-start"
                    />
                    {time.toString()}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="flex w-auto gap-1 rounded-2xl p-1.5"
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
