export const ENTRY_CONFLUENCE_KEYS = [
    'OB',
    'BB',
    'IFVG',
    'OTE',
    'VAH',
    'VAL',
    'POC',
] as const;

export const DOL_CONFLUENCE_KEYS = [
    'REH/REL',
    'Trendline liquidity',
    'NWOG',
    'NDOG',
    'ORG',
] as const;

export const DOL_TYPE_VALUES = [...DOL_CONFLUENCE_KEYS, 'None'] as const;

export const ACCOUNT_TYPE_VALUES = ['funded', 'eval'] as const;

export const BIAS_DIRECTION_VALUES = ['bullish', 'bearish', 'unclear'] as const;

export const DAY_TYPE_VALUES = ['balanced', 'imbalanced'] as const;

export const SETUP_TYPE_VALUES = ['reversal', 'continuation'] as const;

export const DISPLACEMENT_DIRECTION_VALUES = [
    'toward',
    'away',
    'none',
] as const;

export const GRADE_VALUES = [
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
] as const;

export const RECOMMENDATION_VALUES = [
    'strong-take',
    'take',
    'marginal',
    'skip',
    'hard-skip',
] as const;

export const OUTCOME_VALUES = ['win', 'loss', 'breakeven', 'no-trade'] as const;

export const WEIGHT_CATEGORY_VALUES = [
    'mental',
    'context',
    'bias',
    'dol',
    'state',
    'entry',
    'sl',
    'rr',
] as const;

export type ConfluenceKey =
    | (typeof ENTRY_CONFLUENCE_KEYS)[number]
    | (typeof DOL_CONFLUENCE_KEYS)[number];

export type DolType = (typeof DOL_TYPE_VALUES)[number];

export type AccountType = (typeof ACCOUNT_TYPE_VALUES)[number];

export type BiasDirection = (typeof BIAS_DIRECTION_VALUES)[number];

export type DayType = (typeof DAY_TYPE_VALUES)[number];

export type SetupType = (typeof SETUP_TYPE_VALUES)[number];

export type DisplacementDirection =
    (typeof DISPLACEMENT_DIRECTION_VALUES)[number];

export type Grade = (typeof GRADE_VALUES)[number];

export type Recommendation = (typeof RECOMMENDATION_VALUES)[number];

export type Outcome = (typeof OUTCOME_VALUES)[number];

export type WeightCategory = (typeof WEIGHT_CATEGORY_VALUES)[number];

export type ConfluenceGroup = {
    label: string;
    items: ConfluenceKey[];
};

export type {
    Answers,
    AssessmentResult,
    ComponentScore,
    TimeWindow,
    TradeAssessmentRow,
    TradingPlanConfig,
    TradingPlanRow,
} from '~/lib/schemas/trading';
