export interface CalendarWeekInactivityRule {
    readonly sessionsPerWeek: number;
}

export interface CalendarWeekTrackedState {
    calendarWeekSessionsElapsed?: number;
    calendarWeekSessionsTraded?: number;
}

export function advanceCalendarWeekForInactivity(
    state: CalendarWeekTrackedState,
    isTraded: boolean,
): void {
    state.calendarWeekSessionsTraded =
        (state.calendarWeekSessionsTraded ?? 0) + (isTraded ? 1 : 0);
    state.calendarWeekSessionsElapsed =
        (state.calendarWeekSessionsElapsed ?? 0) + 1;
}

export function assertValidCalendarWeekInactivityRule(
    rule: CalendarWeekInactivityRule,
    label: string,
): void {
    if (
        !Number.isSafeInteger(rule.sessionsPerWeek) ||
        rule.sessionsPerWeek <= 0
    ) {
        throw new Error(
            `${label}: calendarWeekInactivity.sessionsPerWeek must be a positive integer, got ${rule.sessionsPerWeek}`,
        );
    }
}

export function didCalendarWeekCloseForInactivity(
    rule: CalendarWeekInactivityRule | null,
    state: CalendarWeekTrackedState,
    isTraded: boolean,
): boolean {
    if (rule === null) return false;
    advanceCalendarWeekForInactivity(state, isTraded);
    if (!isCalendarWeekComplete(rule, state)) return false;
    const wasWeekEmpty = isCalendarWeekClosedEmpty(rule, state);
    resetCalendarWeek(state);
    return wasWeekEmpty;
}

export function isCalendarWeekClosedEmpty(
    rule: CalendarWeekInactivityRule,
    state: CalendarWeekTrackedState,
): boolean {
    return (
        isCalendarWeekComplete(rule, state) &&
        !didCalendarWeekTradeAnySession(state)
    );
}

function didCalendarWeekTradeAnySession(
    state: CalendarWeekTrackedState,
): boolean {
    return (state.calendarWeekSessionsTraded ?? 0) > 0;
}

function isCalendarWeekComplete(
    rule: CalendarWeekInactivityRule,
    state: CalendarWeekTrackedState,
): boolean {
    return (state.calendarWeekSessionsElapsed ?? 0) >= rule.sessionsPerWeek;
}

function resetCalendarWeek(state: CalendarWeekTrackedState): void {
    state.calendarWeekSessionsElapsed = 0;
    state.calendarWeekSessionsTraded = 0;
}
