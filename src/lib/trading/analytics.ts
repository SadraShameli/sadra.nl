import type { Grade, Outcome, WeightCategory } from '~/lib/trading/types';

import { PLAN_TIMEZONE } from '~/lib/trading/defaults';

export interface LightAssessment {
    actualRiskTaken?: null | number;
    componentScores?: null | Partial<
        Record<WeightCategory, { earned: number; max: number }>
    >;
    createdAt: Date | string;
    executionDeviations?: null | string[];
    followedPlan?: boolean | null;
    grade: string;
    id: string;
    outcome: null | string;
    outcomeNotes?: null | string;
    outcomeR: null | number;
    planId: null | string;
    planSnapshotWindows?:
        | null
        | {
              end: string;
              id: string;
              label: string;
              start: string;
          }[];
    score: number;
    setupType?: null | string;
    windowId?: null | string;
}

export const GRADE_RANK: Record<string, number> = {
    A: 1,
    'A+': 0,
    'A-': 2,
    B: 4,
    'B+': 3,
    'B-': 5,
    C: 7,
    'C+': 6,
    'C-': 8,
    D: 9,
    F: 10,
};

export const GRADE_DISPLAY_ORDER: Grade[] = [
    'A+',
    'A',
    'A-',
    'B+',
    'B',
    'B-',
    'C+',
    'C',
    'C-',
    'D',
    'F',
];

export interface DayCell {
    bestGrade: null | string;
    breakevens: number;
    date: string;
    inMonth: boolean;
    losses: number;
    rSum: number;
    total: number;
    wins: number;
}

export interface DrawdownStats {
    durationTrades: number;
    maxDrawdownDollars: number;
    maxDrawdownPct: number;
    troughBalance: number;
}

export interface EquityPoint {
    balance: number;
    date: string;
    drawdown: number;
}

export interface FilterCriteria {
    dateFrom?: null | string;
    dateTo?: null | string;
    grades?: string[];
    mentalFlags?: (
        'boredomHunt' | 'distracted' | 'hesitation' | 'revengeOrFomo'
    )[];
    outcomes?: string[];
    planIds?: string[];
    query?: null | string;
    setupTypes?: string[];
    windowIds?: string[];
}

export interface StreakStats {
    bestLoss: number;
    bestWin: number;
    consecutiveTradingDays: number;
    currentLoss: number;
    currentWin: number;
}

interface ImpactBucket {
    rs: number[];
    total: number;
    wins: number;
}

export function componentScoreCorrelation(
    rows: LightAssessment[],
    category: WeightCategory,
): { avgR: number; count: number; pctOfMax: number }[] {
    const buckets: { rs: number[] }[] = [];
    for (let index = 0; index < 5; index++) buckets.push({ rs: [] });
    for (const r of rows) {
        if (!isCountedOutcome(r.outcome)) continue;
        if (r.outcomeR === null || !Number.isFinite(r.outcomeR)) continue;
        const cs = r.componentScores?.[category];
        if (!cs || cs.max <= 0) continue;
        const pct = cs.earned / cs.max;
        const index = Math.min(4, Math.floor(pct * 5));
        buckets[index]?.rs.push(r.outcomeR);
    }
    return buckets.map((b, index) => ({
        avgR:
            b.rs.length > 0 ? b.rs.reduce((s, x) => s + x, 0) / b.rs.length : 0,
        count: b.rs.length,
        pctOfMax: (index + 1) * 20,
    }));
}

export function computeStreaks(rows: LightAssessment[]): StreakStats {
    const sorted = rows
        .filter((r) => isCountedOutcome(r.outcome))
        .toSorted(
            (a, b) =>
                toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime(),
        );
    let currentWin = 0;
    let currentLoss = 0;
    for (const r of sorted) {
        if (r.outcome === 'win') {
            if (currentLoss > 0) break;
            currentWin += 1;
        } else if (r.outcome === 'loss') {
            if (currentWin > 0) break;
            currentLoss += 1;
        } else {
            break;
        }
    }

    let bestWin = 0;
    let bestLoss = 0;
    let runWin = 0;
    let runLoss = 0;
    const chrono = sorted.toReversed();
    for (const r of chrono) {
        if (r.outcome === 'win') {
            runWin += 1;
            runLoss = 0;
            if (runWin > bestWin) bestWin = runWin;
        } else if (r.outcome === 'loss') {
            runLoss += 1;
            runWin = 0;
            if (runLoss > bestLoss) bestLoss = runLoss;
        } else {
            runWin = 0;
            runLoss = 0;
        }
    }

    const days = new Set<string>();
    for (const r of sorted) {
        const day = dateKey(r.createdAt);
        const dow = dayOfWeek(r.createdAt);
        if (dow === 0 || dow === 6) continue;
        days.add(day);
    }
    let consecutiveTradingDays = 0;
    if (days.size > 0) {
        const cursor = new Date();
        for (let index = 0; index < 365; index++) {
            const k = dateKey(cursor);
            const dow = dayOfWeek(cursor);
            if (dow === 0 || dow === 6) {
                cursor.setDate(cursor.getDate() - 1);
                continue;
            }
            if (days.has(k)) {
                consecutiveTradingDays += 1;
                cursor.setDate(cursor.getDate() - 1);
            } else {
                if (index === 0) {
                    cursor.setDate(cursor.getDate() - 1);
                    continue;
                }
                break;
            }
        }
    }

    return {
        bestLoss,
        bestWin,
        consecutiveTradingDays,
        currentLoss,
        currentWin,
    };
}

export function cumulativeRSeries(
    rows: LightAssessment[],
): { cumR: number; date: string; r: number }[] {
    const valid = rows
        .filter(
            (r): r is LightAssessment & { outcomeR: number } =>
                isCountedOutcome(r.outcome) &&
                r.outcomeR !== null &&
                Number.isFinite(r.outcomeR),
        )
        .toSorted(
            (a, b) =>
                toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime(),
        );
    let cum = 0;
    return valid.map((r) => {
        cum += r.outcomeR;
        return {
            cumR: cum,
            date: toDate(r.createdAt).toISOString(),
            r: r.outcomeR,
        };
    });
}

export function dateKey(d: Date | string, tz = PLAN_TIMEZONE): string {
    return new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        month: '2-digit',
        timeZone: tz,
        year: 'numeric',
    }).format(toDate(d));
}

export function dayCellGrid(
    monthIso: string,
    rows: LightAssessment[],
): DayCell[][] {
    const [yString, mString] = monthIso.split('-', 2);
    const year = Number(yString);
    const month = Number(mString);
    const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
    const lastOfMonth = new Date(Date.UTC(year, month, 0));

    const dayMap = new Map<string, DayCell>();
    for (const r of rows) {
        const key = dateKey(r.createdAt);
        const cell = dayMap.get(key) ?? {
            bestGrade: null,
            breakevens: 0,
            date: key,
            inMonth: true,
            losses: 0,
            rSum: 0,
            total: 0,
            wins: 0,
        };
        cell.total += 1;

        tallyOutcome(cell, r.outcome);

        if (r.outcomeR !== null && Number.isFinite(r.outcomeR))
            cell.rSum += r.outcomeR;
        if (
            cell.bestGrade === null ||
            (GRADE_RANK[r.grade] ?? 99) < (GRADE_RANK[cell.bestGrade] ?? 99)
        ) {
            cell.bestGrade = r.grade;
        }
        dayMap.set(key, cell);
    }

    const startDow = firstOfMonth.getUTCDay();
    const mondayOffset = (startDow + 6) % 7;
    const gridStart = new Date(firstOfMonth);
    gridStart.setUTCDate(gridStart.getUTCDate() - mondayOffset);

    const weeks: DayCell[][] = [];
    const cursor = new Date(gridStart);
    while (cursor <= lastOfMonth || cursor.getUTCDay() !== 1) {
        const week: DayCell[] = [];
        for (let index = 0; index < 7; index++) {
            const y = cursor.getUTCFullYear();
            const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
            const d = String(cursor.getUTCDate()).padStart(2, '0');
            const key = `${y}-${m}-${d}`;
            const isInMonth = cursor.getUTCMonth() === month - 1;
            const existing = dayMap.get(key);
            week.push(
                existing
                    ? { ...existing, inMonth: isInMonth }
                    : {
                          bestGrade: null,
                          breakevens: 0,
                          date: key,
                          inMonth: isInMonth,
                          losses: 0,
                          rSum: 0,
                          total: 0,
                          wins: 0,
                      },
            );
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        weeks.push(week);
        if (weeks.length > 6) break;
    }
    return weeks;
}

export function dayOfWeek(d: Date | string, tz = PLAN_TIMEZONE): number {
    const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
    }).format(toDate(d));
    const map: Record<string, number> = {
        Fri: 5,
        Mon: 1,
        Sat: 6,
        Sun: 0,
        Thu: 4,
        Tue: 2,
        Wed: 3,
    };
    return map[weekday] ?? 0;
}

export function dayOfWeekStats(rows: LightAssessment[]): {
    avgR: number;
    count: number;
    dow: number;
    label: string;
    winRate: number;
}[] {
    const buckets = new Map<
        number,
        { rs: number[]; total: number; wins: number }
    >();
    for (const r of rows) {
        if (!isCountedOutcome(r.outcome)) continue;
        const dow = dayOfWeek(r.createdAt);
        const b = buckets.get(dow) ?? { rs: [], total: 0, wins: 0 };
        b.total += 1;
        if (r.outcome === 'win') b.wins += 1;
        if (r.outcomeR !== null && Number.isFinite(r.outcomeR))
            b.rs.push(r.outcomeR);
        buckets.set(dow, b);
    }
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return [1, 2, 3, 4, 5].map((dow) => {
        const b = buckets.get(dow);
        return {
            avgR:
                b && b.rs.length > 0
                    ? b.rs.reduce((s, x) => s + x, 0) / b.rs.length
                    : 0,
            count: b?.total ?? 0,
            dow,
            label: labels[dow] ?? '',
            winRate: b && b.total > 0 ? b.wins / b.total : 0,
        };
    });
}

export function deviationFrequency(
    rows: LightAssessment[],
): { count: number; deviation: string; winRate: number }[] {
    const counts = new Map<string, { total: number; wins: number }>();
    for (const r of rows) {
        if (!isCountedOutcome(r.outcome)) continue;
        if (!r.executionDeviations || r.executionDeviations.length === 0)
            continue;
        for (const d of r.executionDeviations) {
            const b = counts.get(d) ?? { total: 0, wins: 0 };
            b.total += 1;
            if (r.outcome === 'win') b.wins += 1;
            counts.set(d, b);
        }
    }
    return [...counts]
        .map(([deviation, b]) => ({
            count: b.total,
            deviation,
            winRate: b.total > 0 ? b.wins / b.total : 0,
        }))
        .toSorted((a, b) => b.count - a.count);
}

export function drawdownStats(points: EquityPoint[]): DrawdownStats {
    if (points.length === 0) {
        return {
            durationTrades: 0,
            maxDrawdownDollars: 0,
            maxDrawdownPct: 0,
            troughBalance: 0,
        };
    }
    let maxDdPct = 0;
    let maxDdDollars = 0;
    let trough = points[0]?.balance ?? 0;
    let runStart = -1;
    let worstRun = 0;
    let peak = points[0]?.balance ?? 0;
    let isInDrawdown = false;
    let currentRunStart = -1;

    for (const [index, p] of points.entries()) {
        if (p.balance >= peak) {
            peak = p.balance;
            if (isInDrawdown) {
                isInDrawdown = false;
                const runLength = index - currentRunStart;
                if (runLength > worstRun) {
                    worstRun = runLength;
                    runStart = currentRunStart;
                }
            }
        } else {
            if (!isInDrawdown) {
                isInDrawdown = true;
                currentRunStart = index;
            }
            const ddDollars = peak - p.balance;
            if (ddDollars > maxDdDollars) {
                maxDdDollars = ddDollars;
                trough = p.balance;
            }
            const ddPct = peak === 0 ? 0 : ddDollars / peak;
            if (ddPct > maxDdPct) maxDdPct = ddPct;
        }
    }
    if (isInDrawdown) {
        const runLength = points.length - currentRunStart;
        if (runLength > worstRun) worstRun = runLength;
    }
    void runStart;

    return {
        durationTrades: worstRun,
        maxDrawdownDollars: maxDdDollars,
        maxDrawdownPct: maxDdPct,
        troughBalance: trough,
    };
}

export function equityCurveFromR(
    rows: LightAssessment[],
    options: { dollarRiskPerTrade: number; startingBalance: number },
): EquityPoint[] {
    const valid = rows
        .filter(
            (r): r is LightAssessment & { outcomeR: number } =>
                isCountedOutcome(r.outcome) &&
                r.outcomeR !== null &&
                Number.isFinite(r.outcomeR),
        )
        .toSorted(
            (a, b) =>
                toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime(),
        );

    let balance = options.startingBalance;
    let peak = balance;
    return valid.map((r) => {
        balance += r.outcomeR * options.dollarRiskPerTrade;
        if (balance > peak) peak = balance;
        const drawdown = peak === 0 ? 0 : 1 - balance / peak;
        return {
            balance,
            date: toDate(r.createdAt).toISOString(),
            drawdown,
        };
    });
}

export function executionImpactByGrade(rows: LightAssessment[]): {
    deviated: { avgR: number; count: number; winRate: number };
    followed: { avgR: number; count: number; winRate: number };
}[] {
    const counted = rows.filter(
        (r) =>
            isCountedOutcome(r.outcome) &&
            r.followedPlan !== undefined &&
            r.followedPlan !== null,
    );
    const followed = emptyImpactBucket();
    const deviated = emptyImpactBucket();
    for (const r of counted) {
        const target = r.followedPlan ? followed : deviated;
        target.total += 1;
        if (r.outcome === 'win') target.wins += 1;
        if (r.outcomeR !== null && Number.isFinite(r.outcomeR))
            target.rs.push(r.outcomeR);
    }
    return [
        {
            deviated: summarizeImpactBucket(deviated),
            followed: summarizeImpactBucket(followed),
        },
    ];
}

export function expectancyR(rows: LightAssessment[]): {
    avgR: number;
    sample: number;
    winRate: number;
} {
    const counted = rows.filter(
        (r): r is LightAssessment & { outcomeR: number } =>
            isCountedOutcome(r.outcome) &&
            r.outcomeR !== null &&
            Number.isFinite(r.outcomeR),
    );
    if (counted.length === 0) return { avgR: 0, sample: 0, winRate: 0 };
    const sumR = counted.reduce((s, r) => s + r.outcomeR, 0);
    const wins = counted.filter((r) => r.outcome === 'win').length;
    return {
        avgR: sumR / counted.length,
        sample: counted.length,
        winRate: wins / counted.length,
    };
}

export function filterAssessments<
    T extends LightAssessment & {
        mentalFlags?: null | string[];
        notesSnippet?: null | string;
    },
>(rows: T[], criteria: FilterCriteria): T[] {
    return rows.filter((r) => {
        if (
            criteria.grades &&
            criteria.grades.length > 0 &&
            !criteria.grades.includes(r.grade)
        )
            return false;
        if (
            criteria.outcomes &&
            criteria.outcomes.length > 0 &&
            (!r.outcome || !criteria.outcomes.includes(r.outcome))
        )
            return false;
        if (
            criteria.windowIds &&
            criteria.windowIds.length > 0 &&
            (!r.windowId || !criteria.windowIds.includes(r.windowId))
        )
            return false;
        if (
            criteria.setupTypes &&
            criteria.setupTypes.length > 0 &&
            (!r.setupType || !criteria.setupTypes.includes(r.setupType))
        )
            return false;
        if (
            criteria.planIds &&
            criteria.planIds.length > 0 &&
            (!r.planId || !criteria.planIds.includes(r.planId))
        )
            return false;
        if (criteria.mentalFlags && criteria.mentalFlags.length > 0) {
            const flags = new Set(r.mentalFlags);
            if (criteria.mentalFlags.every((f) => !flags.has(f))) return false;
        }
        if (criteria.dateFrom && dateKey(r.createdAt) < criteria.dateFrom)
            return false;
        if (criteria.dateTo && dateKey(r.createdAt) > criteria.dateTo)
            return false;
        if (criteria.query && criteria.query.trim().length > 0) {
            const q = criteria.query.toLowerCase();
            const haystack = (r.notesSnippet ?? '').toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });
}

export function gradeCalibration(
    rows: LightAssessment[],
): { avgR: number; count: number; grade: Grade }[] {
    const buckets = new Map<string, { rs: number[] }>();
    for (const r of rows) {
        if (!isCountedOutcome(r.outcome)) continue;
        if (r.outcomeR === null || !Number.isFinite(r.outcomeR)) continue;
        const b = buckets.get(r.grade) ?? { rs: [] };
        b.rs.push(r.outcomeR);
        buckets.set(r.grade, b);
    }
    return GRADE_DISPLAY_ORDER.map((g) => {
        const b = buckets.get(g);
        const count = b?.rs.length ?? 0;
        return {
            avgR:
                count > 0
                    ? (b?.rs ?? []).reduce((s, x) => s + x, 0) / count
                    : 0,
            count,
            grade: g,
        };
    });
}

export function outcomeDistribution(rows: LightAssessment[]): {
    count: number;
    outcome: 'breakeven' | 'loss' | 'no-trade' | 'win';
    share: number;
}[] {
    const counts = { breakeven: 0, loss: 0, 'no-trade': 0, win: 0 };
    let total = 0;
    for (const r of rows) {
        if (r.outcome === null) continue;
        if (['breakeven', 'loss', 'no-trade', 'win'].includes(r.outcome)) {
            counts[r.outcome as keyof typeof counts] += 1;
            total += 1;
        }
    }
    return (['win', 'loss', 'breakeven', 'no-trade'] as const).map(
        (outcome) => ({
            count: counts[outcome],
            outcome,
            share: total > 0 ? counts[outcome] / total : 0,
        }),
    );
}

export function perWindowStats(rows: LightAssessment[]): {
    avgR: number;
    count: number;
    label: string;
    windowId: string;
    winRate: number;
}[] {
    const buckets = new Map<
        string,
        { label: string; rs: number[]; total: number; wins: number }
    >();
    for (const r of rows) {
        if (!r.windowId) continue;
        const label =
            r.planSnapshotWindows?.find((w) => w.id === r.windowId)?.label ??
            r.windowId;
        const b = buckets.get(r.windowId) ?? {
            label,
            rs: [],
            total: 0,
            wins: 0,
        };
        if (isCountedOutcome(r.outcome)) {
            b.total += 1;
            if (r.outcome === 'win') b.wins += 1;
            if (r.outcomeR !== null && Number.isFinite(r.outcomeR))
                b.rs.push(r.outcomeR);
        }
        buckets.set(r.windowId, b);
    }
    return [...buckets].map(([windowId, b]) => ({
        avgR:
            b.rs.length > 0 ? b.rs.reduce((s, x) => s + x, 0) / b.rs.length : 0,
        count: b.total,
        label: b.label,
        windowId,
        winRate: b.total > 0 ? b.wins / b.total : 0,
    }));
}

export function toDate(d: Date | string): Date {
    return d instanceof Date ? d : new Date(d);
}

export function winRateByGrade(
    rows: LightAssessment[],
): { count: number; grade: Grade; winRate: number; wins: number }[] {
    const buckets = new Map<string, { total: number; wins: number }>();
    for (const r of rows) {
        if (!isCountedOutcome(r.outcome)) continue;
        const b = buckets.get(r.grade) ?? { total: 0, wins: 0 };
        b.total += 1;
        if (r.outcome === 'win') b.wins += 1;
        buckets.set(r.grade, b);
    }
    return GRADE_DISPLAY_ORDER.map((g) => {
        const b = buckets.get(g);
        return {
            count: b?.total ?? 0,
            grade: g,
            winRate: b && b.total > 0 ? b.wins / b.total : 0,
            wins: b?.wins ?? 0,
        };
    });
}

function emptyImpactBucket(): ImpactBucket {
    return { rs: [], total: 0, wins: 0 };
}

function isCountedOutcome(o: null | string): o is Outcome {
    return (['win', 'loss', 'breakeven'] as Array<null | string>).includes(o);
}

function summarizeImpactBucket(b: ImpactBucket): {
    avgR: number;
    count: number;
    winRate: number;
} {
    return {
        avgR:
            b.rs.length > 0 ? b.rs.reduce((s, x) => s + x, 0) / b.rs.length : 0,
        count: b.total,
        winRate: b.total > 0 ? b.wins / b.total : 0,
    };
}

function tallyOutcome(cell: DayCell, outcome: null | string): void {
    switch (outcome) {
        case 'breakeven': {
            cell.breakevens += 1;
            break;
        }
        case 'loss': {
            cell.losses += 1;
            break;
        }
        case null: {
            break;
        }
        case 'win': {
            cell.wins += 1;
            break;
        }
    }
}
