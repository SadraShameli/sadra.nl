import type {
    Answers,
    AssessmentResult,
    ComponentScore,
    Grade,
    Recommendation,
    TradingPlanConfig,
    WeightCategory,
} from './types';

import { GRADE_THRESHOLDS, PLAN_TIMEZONE } from './defaults';

const MENTAL_LABELS = {
    boredomHunt: 'boredom-driven setup hunt',
    distracted: 'lack of focus',
    hesitation: 'hesitation',
    revengeOrFomo: 'revenge / FOMO impulse',
} as const;

export function findCurrentWindow(
    plan: TradingPlanConfig,
    now: Date = new Date(),
): null | string {
    const hhmm = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        hour12: false,
        minute: '2-digit',
        timeZone: PLAN_TIMEZONE,
    }).format(now);

    for (const window of plan.windows) {
        if (hhmm >= window.start && hhmm <= window.end) return window.id;
    }
    return null;
}

export function scoreAssessment(
    plan: TradingPlanConfig,
    answers: Answers,
): AssessmentResult {
    const redFlags: string[] = [];

    if (plan.knockouts.distracted && answers.mental.distracted) {
        redFlags.push('Distracted — execution risk too high to trade.');
    }
    if (plan.knockouts.revengeOrFomo && answers.mental.revengeOrFomo) {
        redFlags.push('Revenge / FOMO impulse detected — stand down.');
    }
    if (plan.knockouts.boredomHunt && answers.mental.boredomHunt) {
        redFlags.push('Setup is invented out of boredom — walk away.');
    }
    if (plan.knockouts.outsideMacroWindow && !answers.context.windowId) {
        redFlags.push('Outside macro time window.');
    }
    if (plan.knockouts.bothSidedLiquidity && answers.dol.bothSided) {
        redFlags.push(
            'Both-sided liquidity — sit out until one side is taken.',
        );
    }
    if (plan.knockouts.dolAlreadyTaken && answers.finals.dolAlreadyTaken) {
        redFlags.push('Draw on liquidity already taken or invalidated.');
    }
    const slCount =
        (answers.sl.ob ? 1 : 0) +
        (answers.sl.bb ? 1 : 0) +
        (answers.sl.swing ? 1 : 0);
    if (
        plan.knockouts.slNotProtected &&
        slCount < plan.setup.requiredPdArrays
    ) {
        redFlags.push(
            `Stop has only ${slCount}/${plan.setup.requiredPdArrays} PD arrays — protection insufficient.`,
        );
    }

    if (redFlags.length > 0) return makeKnockoutResult(redFlags);

    const mental = scoreMental(answers.mental, plan.weights.mental);
    const context = scoreContext(answers.context, plan.weights.context);
    const bias = scoreBias(answers.bias, plan.weights.bias);
    const dol = scoreDol(answers.dol, plan.weights.dol);
    const state = scoreState(answers.state, plan.weights.state);
    const entry = scoreEntry(answers.entry, plan.weights.entry);
    const sl = scoreStopLoss(
        answers.sl,
        plan.setup.requiredPdArrays,
        plan.weights.sl,
    );
    const rr = scoreRiskReward(answers.rr, plan.setup.minRR, plan.weights.rr);

    const componentScores: Record<WeightCategory, ComponentScore> = {
        bias: bias.score,
        context: context.score,
        dol: dol.score,
        entry: entry.score,
        mental: mental.score,
        rr: rr.score,
        sl: sl.score,
        state: state.score,
    };

    const totalWeight =
        plan.weights.mental +
        plan.weights.context +
        plan.weights.bias +
        plan.weights.dol +
        plan.weights.state +
        plan.weights.entry +
        plan.weights.sl +
        plan.weights.rr;

    const earned =
        mental.score.earned +
        context.score.earned +
        bias.score.earned +
        dol.score.earned +
        state.score.earned +
        entry.score.earned +
        sl.score.earned +
        rr.score.earned;

    const score = totalWeight > 0 ? (earned / totalWeight) * 100 : 0;

    const strengths = [
        ...mental.strengths,
        ...context.strengths,
        ...bias.strengths,
        ...dol.strengths,
        ...state.strengths,
        ...entry.strengths,
        ...sl.strengths,
        ...rr.strengths,
    ];
    const weaknesses = [
        ...mental.weaknesses,
        ...context.weaknesses,
        ...bias.weaknesses,
        ...dol.weaknesses,
        ...state.weaknesses,
        ...entry.weaknesses,
        ...sl.weaknesses,
        ...rr.weaknesses,
    ];
    const improvements = [
        ...bias.improvements,
        ...entry.improvements,
        ...sl.improvements,
        ...rr.improvements,
    ];

    if (answers.finals.overExtended) {
        weaknesses.push('Market already expanded too far — late entry risk.');
    }
    if (answers.mental.hesitation) {
        weaknesses.push('Hesitation flagged — execution may not match plan.');
    }

    const grade = gradeFromScore(score);
    const { recommendation, sizeMultiplier } = recommendationFromGrade(grade);

    return {
        componentScores,
        grade,
        improvements,
        recommendation,
        redFlags,
        score: Math.round(score * 10) / 10,
        strengths,
        suggestedSizeMultiplier: sizeMultiplier,
        weaknesses,
    };
}

function emptyComponentScores(): Record<WeightCategory, ComponentScore> {
    const blank = { earned: 0, label: '', max: 0, note: '' };
    return {
        bias: blank,
        context: blank,
        dol: blank,
        entry: blank,
        mental: blank,
        rr: blank,
        sl: blank,
        state: blank,
    };
}

function gradeFromScore(score: number): Grade {
    for (const { grade, min } of GRADE_THRESHOLDS) {
        if (score >= min) return grade;
    }
    return 'D';
}

function ltfAligned(
    direction: Answers['bias']['weekly'],
    ltfs: Answers['bias']['weekly'][],
): number {
    if (direction === 'unclear') return 0;
    return ltfs.filter((d) => d === direction).length;
}

function makeKnockoutResult(redFlags: string[]): AssessmentResult {
    return {
        componentScores: emptyComponentScores(),
        grade: 'F',
        improvements: [
            'Wait for the next valid window with a clean mental state and protected setup.',
        ],
        recommendation: 'hard-skip',
        redFlags,
        score: 0,
        strengths: [],
        suggestedSizeMultiplier: 0,
        weaknesses: ['Knockout violation prevents this trade.'],
    };
}

function recommendationFromGrade(grade: Grade): {
    recommendation: Recommendation;
    sizeMultiplier: number;
} {
    switch (grade) {
        case 'A':
        case 'A+': {
            return { recommendation: 'strong-take', sizeMultiplier: 1 };
        }
        case 'A-':
        case 'B+': {
            return { recommendation: 'take', sizeMultiplier: 1 };
        }
        case 'B':
        case 'B-': {
            return { recommendation: 'marginal', sizeMultiplier: 0.5 };
        }
        case 'C':
        case 'C+': {
            return { recommendation: 'marginal', sizeMultiplier: 0.25 };
        }
        case 'C-':
        case 'D': {
            return { recommendation: 'skip', sizeMultiplier: 0 };
        }
        case 'F': {
            return { recommendation: 'hard-skip', sizeMultiplier: 0 };
        }
    }
}

function scoreBias(
    answers: Answers['bias'],
    max: number,
): {
    improvements: string[];
    score: ComponentScore;
    strengths: string[];
    weaknesses: string[];
} {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const improvements: string[] = [];
    let earned = 0;

    const weekly = answers.weekly;
    const daily = answers.daily;
    const ltfDirs = [answers.fourHour, answers.oneHour, answers.fifteenMin];

    const htfAligned =
        weekly !== 'unclear' && daily !== 'unclear' && weekly === daily;

    if (htfAligned) {
        earned += max * 0.6;
        strengths.push(`Weekly + daily aligned ${weekly}.`);
    } else if (daily === 'unclear') {
        weaknesses.push('Higher-timeframe bias unclear.');
    } else {
        earned += max * 0.35;
        improvements.push(
            'Wait for weekly alignment to push this into A-tier bias.',
        );
    }

    const directionalLtf = ltfAligned(htfAligned ? weekly : daily, ltfDirs);
    if (directionalLtf > 0) {
        earned += max * 0.3 * (directionalLtf / 3);
        if (directionalLtf >= 2)
            strengths.push('Lower timeframes confirm the HTF read.');
    }

    earned +=
        max * 0.1 * Math.min(1, Math.max(0, (answers.conviction - 1) / 9));

    return {
        improvements,
        score: {
            earned: Math.min(earned, max),
            label: 'HTF bias',
            max,
            note: htfAligned ? 'Weekly + daily aligned' : 'Partial alignment',
        },
        strengths,
        weaknesses,
    };
}

function scoreContext(
    answers: Answers['context'],
    max: number,
): { score: ComponentScore; strengths: string[]; weaknesses: string[] } {
    let earned = 0;
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (answers.windowId) {
        earned += max * 0.6;
        strengths.push('Currently inside an approved macro time window.');
    } else {
        weaknesses.push('Outside the defined macro windows.');
    }

    if (answers.windowQuotaUsed) {
        weaknesses.push('Window quota already used on this account.');
    } else {
        earned += max * 0.4;
    }

    return {
        score: { earned, label: 'Session context', max, note: '' },
        strengths,
        weaknesses,
    };
}

function scoreDol(
    answers: Answers['dol'],
    max: number,
): { score: ComponentScore; strengths: string[]; weaknesses: string[] } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    let earned = 0;

    if (answers.type === 'None') {
        weaknesses.push('No defined draw on liquidity.');
    } else {
        earned += max * 0.4;
        strengths.push(`Clear draw on liquidity (${answers.type}).`);
    }

    if (answers.singular) {
        earned += max * 0.4;
    } else {
        weaknesses.push('Draw on liquidity is not singular / well-defined.');
    }

    if (answers.distanceR >= 1.5 && answers.distanceR <= 5) {
        earned += max * 0.2;
        strengths.push(
            `Draw is ${answers.distanceR}R away — clean target room.`,
        );
    } else if (answers.distanceR < 1.5 && answers.distanceR > 0) {
        weaknesses.push(`Draw only ${answers.distanceR}R away — limited room.`);
    } else if (answers.distanceR > 5) {
        weaknesses.push(
            `Draw ${answers.distanceR}R away — risk of mid-leg failure.`,
        );
    }

    return {
        score: { earned, label: 'Draw on liquidity', max, note: '' },
        strengths,
        weaknesses,
    };
}

function scoreEntry(
    answers: Answers['entry'],
    max: number,
): {
    improvements: string[];
    score: ComponentScore;
    strengths: string[];
    weaknesses: string[];
} {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const improvements: string[] = [];
    let earned = 0;

    if (answers.onFvg) {
        earned += max * 0.4;
        strengths.push('Entering on a Fair Value Gap.');
    } else {
        weaknesses.push('Entry is not anchored to an FVG.');
    }

    const count = answers.confluences.length;
    earned += max * 0.6 * Math.min(1, count / 3);

    if (count >= 3) {
        strengths.push(
            `${count} confluences stacked at entry (${answers.confluences.join(', ')}).`,
        );
    } else if (count > 0) {
        improvements.push(
            `Add ${3 - count} more confluence(s) at entry to reach A-tier setup quality.`,
        );
    } else {
        weaknesses.push('No paired confluences at entry.');
    }

    return {
        improvements,
        score: {
            earned,
            label: 'Entry quality',
            max,
            note: `${count} confluence(s)`,
        },
        strengths,
        weaknesses,
    };
}

function scoreMental(
    answers: Answers['mental'],
    max: number,
): { score: ComponentScore; strengths: string[]; weaknesses: string[] } {
    const fails: string[] = [];
    if (answers.hesitation) fails.push(MENTAL_LABELS.hesitation);
    if (answers.boredomHunt) fails.push(MENTAL_LABELS.boredomHunt);
    if (answers.revengeOrFomo) fails.push(MENTAL_LABELS.revengeOrFomo);
    if (answers.distracted) fails.push(MENTAL_LABELS.distracted);

    const earned = Math.max(0, max * (1 - fails.length / 4));
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (fails.length === 0) {
        strengths.push(
            'All four mental-state checks passed — clean execution mindset.',
        );
    } else {
        weaknesses.push(`Mental flags raised: ${fails.join(', ')}.`);
    }

    return {
        score: {
            earned,
            label: 'Mental state',
            max,
            note:
                fails.length === 0
                    ? 'Clear-headed.'
                    : `${fails.length} flag(s).`,
        },
        strengths,
        weaknesses,
    };
}

function scoreRiskReward(
    answers: Answers['rr'],
    minRR: number,
    max: number,
): {
    improvements: string[];
    score: ComponentScore;
    strengths: string[];
    weaknesses: string[];
} {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const improvements: string[] = [];

    const expected = Math.max(0, answers.targetR - answers.slippageR);
    let earned = 0;

    if (expected >= 3) {
        earned = max;
        strengths.push(
            `Expected ${expected.toFixed(1)}R after slippage — exceptional payoff.`,
        );
    } else if (expected >= minRR) {
        earned =
            max *
            (0.7 +
                0.3 *
                    Math.min(1, (expected - minRR) / Math.max(0.1, 3 - minRR)));
        strengths.push(
            `Expected ${expected.toFixed(1)}R meets plan minimum (${minRR}R).`,
        );
    } else if (expected > 0) {
        earned = max * 0.3;
        weaknesses.push(
            `Expected ${expected.toFixed(1)}R is below plan minimum of ${minRR}R.`,
        );
        improvements.push(
            `Lift target or tighten stop to reach at least ${minRR}R net.`,
        );
    } else {
        weaknesses.push('Expected R is zero or negative after slippage.');
    }

    return {
        improvements,
        score: {
            earned,
            label: 'Risk / reward',
            max,
            note: `${expected.toFixed(1)}R net`,
        },
        strengths,
        weaknesses,
    };
}

function scoreState(
    answers: Answers['state'],
    max: number,
): { score: ComponentScore; strengths: string[]; weaknesses: string[] } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    let earned = 0;

    if (answers.opposingSweep) {
        earned += max * 0.3;
        strengths.push('Recent sweep of opposing liquidity present.');
    } else {
        weaknesses.push('No recent opposing sweep — entries less protected.');
    }

    if (answers.displacement === 'toward') {
        earned += max * 0.35;
        strengths.push(
            'Displacement is pointing toward the draw on liquidity.',
        );
    } else if (answers.displacement === 'away') {
        weaknesses.push(
            'Displacement away from DOL — order flow conflicts setup.',
        );
    }

    const coherent =
        (answers.dayType === 'balanced' && answers.setupType === 'reversal') ||
        (answers.dayType === 'imbalanced' &&
            answers.setupType === 'continuation');

    if (coherent) {
        earned += max * 0.35;
        strengths.push(
            answers.dayType === 'balanced'
                ? 'Balanced day with reversal at range extreme — coherent narrative.'
                : 'Imbalanced day with HTF continuation — coherent narrative.',
        );
    } else {
        weaknesses.push(
            'Setup type does not match the day type (incoherent narrative).',
        );
    }

    return {
        score: { earned, label: 'Market state', max, note: '' },
        strengths,
        weaknesses,
    };
}

function scoreStopLoss(
    answers: Answers['sl'],
    requiredPdArrays: number,
    max: number,
): {
    improvements: string[];
    score: ComponentScore;
    strengths: string[];
    weaknesses: string[];
} {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const improvements: string[] = [];

    const count =
        (answers.ob ? 1 : 0) + (answers.bb ? 1 : 0) + (answers.swing ? 1 : 0);

    const earned = max * Math.min(1, count / Math.max(1, requiredPdArrays));

    if (count >= requiredPdArrays) {
        strengths.push(
            `Stop protected by ${count} PD arrays (target ${requiredPdArrays}).`,
        );
    } else if (count > 0) {
        improvements.push(
            `Add ${requiredPdArrays - count} more PD array(s) at the stop to reach required protection.`,
        );
    } else {
        weaknesses.push('Stop loss is not protected by any PD array.');
    }

    return {
        improvements,
        score: {
            earned,
            label: 'Stop protection',
            max,
            note: `${count}/${requiredPdArrays}`,
        },
        strengths,
        weaknesses,
    };
}
