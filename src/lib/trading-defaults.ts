import type {
    ConfluenceGroup,
    Grade,
    TradingPlanConfig,
} from './trading-types';
import {
    DOL_CONFLUENCE_KEYS,
    DOL_TYPE_VALUES,
    ENTRY_CONFLUENCE_KEYS,
} from './trading-types';

export const WEIGHT_CATEGORIES: {
    key: keyof TradingPlanConfig['weights'];
    label: string;
    hint: string;
}[] = [
    {
        key: 'mental',
        label: 'Mental state',
        hint: 'Clean execution mindset — no hesitation, boredom, revenge or distraction.',
    },
    {
        key: 'context',
        label: 'Session context',
        hint: 'Inside a macro window, on the right account, with quota remaining.',
    },
    {
        key: 'bias',
        label: 'HTF bias',
        hint: 'Higher-timeframe alignment from weekly down to LTF.',
    },
    {
        key: 'dol',
        label: 'Draw on liquidity',
        hint: 'Singular, well-defined DOL with no conflicting bilateral targets.',
    },
    {
        key: 'state',
        label: 'Market state',
        hint: 'Opposing sweep + displacement aligned with chosen setup type.',
    },
    {
        key: 'entry',
        label: 'Entry quality',
        hint: 'FVG entry stacked with entry PD arrays, liquidity targets, and opening gaps.',
    },
    {
        key: 'sl',
        label: 'Stop protection',
        hint: 'Stop loss protected by the required count of PD arrays.',
    },
    {
        key: 'rr',
        label: 'Risk / reward',
        hint: 'Target R meets or exceeds the plan minimum after slippage.',
    },
];

export const CONFLUENCE_GROUPS: ConfluenceGroup[] = [
    { label: 'Entry confluences', items: [...ENTRY_CONFLUENCE_KEYS] },
    { label: 'Draw on liquidity', items: [...DOL_CONFLUENCE_KEYS] },
];

export const CONFLUENCE_OPTIONS = CONFLUENCE_GROUPS.flatMap((g) => g.items);

export const DEFAULT_DOL_TYPES = [...DOL_TYPE_VALUES];

export const PLAN_TIMEZONE = 'America/New_York';

export const DEFAULT_PLAN: TradingPlanConfig = {
    windows: [
        { id: 'w1', label: 'AM first', start: '09:50', end: '10:10' },
        { id: 'w2', label: 'AM second', start: '10:50', end: '11:10' },
        { id: 'w3', label: 'PM first', start: '13:50', end: '14:10' },
        { id: 'w4', label: 'PM second', start: '14:50', end: '15:10' },
    ],
    risk: {
        fundedDollars: 250,
        evalDollars: 500,
        maxTradesPerWindow: 1,
    },
    setup: {
        minRR: 2,
        requiredPdArrays: 3,
        allowedConfluences: [...ENTRY_CONFLUENCE_KEYS, ...DOL_CONFLUENCE_KEYS],
        allowedDolTypes: [...DOL_TYPE_VALUES],
    },
    weights: {
        mental: 15,
        context: 10,
        bias: 15,
        dol: 15,
        state: 10,
        entry: 15,
        sl: 10,
        rr: 10,
    },
    knockouts: {
        outsideMacroWindow: true,
        bothSidedLiquidity: true,
        slNotProtected: true,
        dolAlreadyTaken: true,
        revengeOrFomo: true,
        distracted: true,
        boredomHunt: true,
    },
};

export const GRADE_THRESHOLDS: {
    min: number;
    grade: Grade;
}[] = [
    { min: 90, grade: 'A+' },
    { min: 85, grade: 'A' },
    { min: 80, grade: 'A-' },
    { min: 75, grade: 'B+' },
    { min: 70, grade: 'B' },
    { min: 65, grade: 'B-' },
    { min: 60, grade: 'C+' },
    { min: 55, grade: 'C' },
    { min: 50, grade: 'C-' },
    { min: 40, grade: 'D' },
    { min: 0, grade: 'D' },
];
