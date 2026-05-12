export type TimeWindow = {
    id: string;
    label: string;
    start: string;
    end: string;
};

export type WeightCategory =
    | 'mental'
    | 'context'
    | 'bias'
    | 'dol'
    | 'state'
    | 'entry'
    | 'sl'
    | 'rr';

export type ConfluenceKey =
    | 'OB'
    | 'BB'
    | 'IFVG'
    | 'REH/REL'
    | 'Trendline liquidity'
    | 'NWOG'
    | 'NDOG'
    | 'ORG'
    | 'OTE';

export type ConfluenceGroup = {
    label: string;
    items: ConfluenceKey[];
};

export type AccountType = 'funded' | 'eval';

export type BiasDirection = 'bullish' | 'bearish' | 'unclear';

export type DolType = 'REH' | 'REL' | 'Imbalance' | 'FVG' | 'EQ' | 'None';

export type DayType = 'balanced' | 'imbalanced';

export type SetupType = 'reversal' | 'continuation';

export type DisplacementDirection = 'toward' | 'away' | 'none';

export type Grade =
    | 'A+'
    | 'A'
    | 'A-'
    | 'B+'
    | 'B'
    | 'B-'
    | 'C+'
    | 'C'
    | 'C-'
    | 'D'
    | 'F';

export type Recommendation =
    | 'strong-take'
    | 'take'
    | 'marginal'
    | 'skip'
    | 'hard-skip';

export type Outcome = 'win' | 'loss' | 'breakeven' | 'no-trade';

export type TradingPlanConfig = {
    windows: TimeWindow[];
    risk: {
        fundedDollars: number;
        evalDollars: number;
        maxTradesPerWindow: number;
    };
    setup: {
        minRR: number;
        requiredPdArrays: number;
        allowedConfluences: ConfluenceKey[];
    };
    weights: Record<WeightCategory, number>;
    knockouts: {
        outsideMacroWindow: boolean;
        bothSidedLiquidity: boolean;
        slNotProtected: boolean;
        dolAlreadyTaken: boolean;
        revengeOrFomo: boolean;
        distracted: boolean;
        boredomHunt: boolean;
    };
};

export type Answers = {
    mental: {
        hesitation: boolean;
        boredomHunt: boolean;
        revengeOrFomo: boolean;
        distracted: boolean;
    };
    context: {
        windowId: string | null;
        accountType: AccountType;
        windowQuotaUsed: boolean;
    };
    bias: {
        weekly: BiasDirection;
        daily: BiasDirection;
        fourHour: BiasDirection;
        oneHour: BiasDirection;
        fifteenMin: BiasDirection;
        conviction: number;
    };
    dol: {
        type: DolType;
        singular: boolean;
        bothSided: boolean;
        distanceR: number;
    };
    state: {
        opposingSweep: boolean;
        displacement: DisplacementDirection;
        dayType: DayType;
        setupType: SetupType;
    };
    entry: {
        onFvg: boolean;
        confluences: ConfluenceKey[];
    };
    sl: {
        ob: boolean;
        bb: boolean;
        swing: boolean;
    };
    rr: {
        targetR: number;
        slippageR: number;
    };
    finals: {
        dolAlreadyTaken: boolean;
        overExtended: boolean;
        notes: string;
    };
};

export type ComponentScore = {
    earned: number;
    max: number;
    label: string;
    note: string;
};

export type AssessmentResult = {
    grade: Grade;
    score: number;
    recommendation: Recommendation;
    suggestedSizeMultiplier: number;
    componentScores: Record<WeightCategory, ComponentScore>;
    strengths: string[];
    weaknesses: string[];
    redFlags: string[];
    improvements: string[];
};

export type TradingPlanRow = {
    id: string;
    userId: string;
    name: string;
    isActive: boolean;
    sortOrder: number;
    config: TradingPlanConfig;
    createdAt: Date;
    updatedAt: Date;
};

export type TradeAssessmentRow = {
    id: string;
    userId: string;
    planId: string | null;
    planSnapshot: TradingPlanConfig;
    answers: Answers;
    result: AssessmentResult;
    score: number;
    grade: string;
    recommendation: string;
    outcome: string | null;
    outcomeR: number | null;
    outcomeNotes: string | null;
    outcomeRecordedAt: Date | null;
    createdAt: Date;
};
