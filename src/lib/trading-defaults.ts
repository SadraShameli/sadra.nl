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
    hint: string;
    key: keyof TradingPlanConfig['weights'];
    label: string;
}[] = [
    {
        hint: 'Clean execution mindset — no hesitation, boredom, revenge or distraction.',
        key: 'mental',
        label: 'Mental state',
    },
    {
        hint: 'Inside a macro window, on the right account, with quota remaining.',
        key: 'context',
        label: 'Session context',
    },
    {
        hint: 'Higher-timeframe alignment from weekly down to LTF.',
        key: 'bias',
        label: 'HTF bias',
    },
    {
        hint: 'Singular, well-defined DOL with no conflicting bilateral targets.',
        key: 'dol',
        label: 'Draw on liquidity',
    },
    {
        hint: 'Opposing sweep + displacement aligned with chosen setup type.',
        key: 'state',
        label: 'Market state',
    },
    {
        hint: 'FVG entry stacked with entry PD arrays, liquidity targets, and opening gaps.',
        key: 'entry',
        label: 'Entry quality',
    },
    {
        hint: 'Stop loss protected by the required count of PD arrays.',
        key: 'sl',
        label: 'Stop protection',
    },
    {
        hint: 'Target R meets or exceeds the plan minimum after slippage.',
        key: 'rr',
        label: 'Risk / reward',
    },
];

export const CONFLUENCE_GROUPS: ConfluenceGroup[] = [
    { items: [...ENTRY_CONFLUENCE_KEYS], label: 'Entry confluences' },
    { items: [...DOL_CONFLUENCE_KEYS], label: 'Draw on liquidity' },
];

export const CONFLUENCE_OPTIONS = CONFLUENCE_GROUPS.flatMap((g) => g.items);

export const DEFAULT_DOL_TYPES = [...DOL_TYPE_VALUES];

export const PLAN_TIMEZONE = 'America/New_York';

export const DEFAULT_PLAN: TradingPlanConfig = {
    knockouts: {
        boredomHunt: true,
        bothSidedLiquidity: true,
        distracted: true,
        dolAlreadyTaken: true,
        outsideMacroWindow: true,
        revengeOrFomo: true,
        slNotProtected: true,
    },
    risk: {
        evalDollars: 500,
        fundedDollars: 250,
        maxTradesPerWindow: 1,
    },
    setup: {
        allowedConfluences: [...ENTRY_CONFLUENCE_KEYS, ...DOL_CONFLUENCE_KEYS],
        allowedDolTypes: [...DOL_TYPE_VALUES],
        minRR: 2,
        requiredPdArrays: 3,
    },
    weights: {
        bias: 15,
        context: 10,
        dol: 15,
        entry: 15,
        mental: 15,
        rr: 10,
        sl: 10,
        state: 10,
    },
    windows: [
        { end: '10:10', id: 'w1', label: 'AM first', start: '09:50' },
        { end: '11:10', id: 'w2', label: 'AM second', start: '10:50' },
        { end: '14:10', id: 'w3', label: 'PM first', start: '13:50' },
        { end: '15:10', id: 'w4', label: 'PM second', start: '14:50' },
    ],
};

export const GRADE_THRESHOLDS: {
    grade: Grade;
    min: number;
}[] = [
    { grade: 'A+', min: 90 },
    { grade: 'A', min: 85 },
    { grade: 'A-', min: 80 },
    { grade: 'B+', min: 75 },
    { grade: 'B', min: 70 },
    { grade: 'B-', min: 65 },
    { grade: 'C+', min: 60 },
    { grade: 'C', min: 55 },
    { grade: 'C-', min: 50 },
    { grade: 'D', min: 40 },
    { grade: 'D', min: 0 },
];
