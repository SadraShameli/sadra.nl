const NEW_YORK_TIME_ZONE = 'America/New_York';
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;
const OPENING_BELL_SECONDS = 9 * SECONDS_PER_HOUR + 30 * SECONDS_PER_MINUTE;
const CLOSING_BELL_SECONDS = 16 * SECONDS_PER_HOUR;
const DEGREES_PER_HOUR_ON_DIAL = 30;
const DEGREES_PER_MINUTE_ON_DIAL = 6;
const HOURS_ON_DIAL = 12;

enum Weekday {
    Sunday = 0,
    Monday = 1,
    Tuesday = 2,
    Wednesday = 3,
    Thursday = 4,
    Friday = 5,
    Saturday = 6,
}

const WEEKDAY_BY_SHORT_NAME: ReadonlyMap<string, Weekday> = new Map([
    ['Fri', Weekday.Friday],
    ['Mon', Weekday.Monday],
    ['Sat', Weekday.Saturday],
    ['Sun', Weekday.Sunday],
    ['Thu', Weekday.Thursday],
    ['Tue', Weekday.Tuesday],
    ['Wed', Weekday.Wednesday],
]);

const NEXT_WEEKDAY: Readonly<Record<Weekday, Weekday>> = {
    [Weekday.Friday]: Weekday.Saturday,
    [Weekday.Monday]: Weekday.Tuesday,
    [Weekday.Saturday]: Weekday.Sunday,
    [Weekday.Sunday]: Weekday.Monday,
    [Weekday.Thursday]: Weekday.Friday,
    [Weekday.Tuesday]: Weekday.Wednesday,
    [Weekday.Wednesday]: Weekday.Thursday,
};

const NEW_YORK_PARTS = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
    timeZone: NEW_YORK_TIME_ZONE,
    weekday: 'short',
});

export enum MarketStatus {
    Closed = 'CLOSED',
    Open = 'OPEN',
}

export class NyseBell {
    private readonly weekday: Weekday;
    readonly hour: number;
    readonly minute: number;
    readonly second: number;

    constructor(now: Date) {
        const parts = new Map(
            NEW_YORK_PARTS.formatToParts(now).map((part) => [
                part.type,
                part.value,
            ]),
        );
        this.hour = Number(requiredPart(parts, 'hour')) % 24;
        this.minute = Number(requiredPart(parts, 'minute'));
        this.second = Number(requiredPart(parts, 'second'));
        const weekday = WEEKDAY_BY_SHORT_NAME.get(
            requiredPart(parts, 'weekday'),
        );
        if (weekday === undefined)
            throw new UnreadableNewYorkTimeError('weekday');
        this.weekday = weekday;
    }

    private get secondsIntoDay(): number {
        return (
            this.hour * SECONDS_PER_HOUR +
            this.minute * SECONDS_PER_MINUTE +
            this.second
        );
    }

    get hourHandDegrees(): number {
        return (
            (this.hour % HOURS_ON_DIAL) * DEGREES_PER_HOUR_ON_DIAL +
            this.minute * (DEGREES_PER_HOUR_ON_DIAL / SECONDS_PER_MINUTE)
        );
    }

    get isOpen(): boolean {
        return (
            isTradingDay(this.weekday) &&
            this.secondsIntoDay >= OPENING_BELL_SECONDS &&
            this.secondsIntoDay < CLOSING_BELL_SECONDS
        );
    }

    get minuteHandDegrees(): number {
        return (
            this.minute * DEGREES_PER_MINUTE_ON_DIAL +
            this.second * (DEGREES_PER_MINUTE_ON_DIAL / SECONDS_PER_MINUTE)
        );
    }

    get secondHandDegrees(): number {
        return this.second * DEGREES_PER_MINUTE_ON_DIAL;
    }

    get secondsUntilNextBell(): number {
        if (this.isOpen) return CLOSING_BELL_SECONDS - this.secondsIntoDay;
        if (
            isTradingDay(this.weekday) &&
            this.secondsIntoDay < OPENING_BELL_SECONDS
        )
            return OPENING_BELL_SECONDS - this.secondsIntoDay;
        let remaining =
            SECONDS_PER_DAY - this.secondsIntoDay + OPENING_BELL_SECONDS;
        let day = NEXT_WEEKDAY[this.weekday];
        while (!isTradingDay(day)) {
            remaining += SECONDS_PER_DAY;
            day = NEXT_WEEKDAY[day];
        }
        return remaining;
    }

    get status(): MarketStatus {
        return this.isOpen ? MarketStatus.Open : MarketStatus.Closed;
    }

    get wallClock(): string {
        return clockText(this.hour, this.minute, this.second);
    }

    get countdown(): string {
        const remaining = this.secondsUntilNextBell;
        return clockText(
            Math.floor(remaining / SECONDS_PER_HOUR),
            Math.floor((remaining % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
            remaining % SECONDS_PER_MINUTE,
        );
    }
}

export class UnreadableNewYorkTimeError extends Error {
    constructor(part: string) {
        super(`Could not read the New York ${part} from Intl.DateTimeFormat`);
        this.name = 'UnreadableNewYorkTimeError';
    }
}

function clockText(hours: number, minutes: number, seconds: number): string {
    return [hours, minutes, seconds]
        .map((value) => String(value).padStart(2, '0'))
        .join(':');
}

function isTradingDay(day: Weekday): boolean {
    return day !== Weekday.Saturday && day !== Weekday.Sunday;
}

function requiredPart(
    parts: ReadonlyMap<Intl.DateTimeFormatPartTypes, string>,
    type: Intl.DateTimeFormatPartTypes,
): string {
    const value = parts.get(type);
    if (value === undefined) throw new UnreadableNewYorkTimeError(type);
    return value;
}
