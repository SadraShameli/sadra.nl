export interface CalendarWeekInactivityRule {
    readonly sessionsPerWeek: number;
}

export interface CalendarWeekTrackedState {
    calendarWeekSessionsElapsed?: number;
    calendarWeekSessionsTraded?: number;
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
    const sessionsTraded =
        (state.calendarWeekSessionsTraded ?? 0) + (isTraded ? 1 : 0);
    const sessionsElapsed = (state.calendarWeekSessionsElapsed ?? 0) + 1;
    state.calendarWeekSessionsTraded = sessionsTraded;
    state.calendarWeekSessionsElapsed = sessionsElapsed;
    if (sessionsElapsed < rule.sessionsPerWeek) return false;
    const isWeekEmpty = sessionsTraded === 0;
    state.calendarWeekSessionsElapsed = 0;
    state.calendarWeekSessionsTraded = 0;
    return isWeekEmpty;
}
