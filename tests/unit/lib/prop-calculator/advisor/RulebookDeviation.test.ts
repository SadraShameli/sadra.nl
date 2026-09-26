import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { DayStopRuleKind, fraction } from '~/lib/prop-calculator';
import {
    DEFAULT_RULEBOOK,
    EvalSizingMode,
    LadderFractionSource,
    ReviewWeekday,
    rulebookDeviation,
    type RulebookParameters,
    RuleSource,
} from '~/lib/prop-calculator/advisor';

const SKILL_LINES = readFileSync(
    new URL(
        '../../../../../.claude/skills/prop-firm-trading/SKILL.md',
        import.meta.url,
    ),
    'utf8',
).split('\n');

const HARD_RULES_HEADING = 'HIS HARD RULES';
const HARD_RULE_PATTERN = /^Hard Rule (\d+)$/;

function edited(change: Partial<RulebookParameters>): RulebookParameters {
    return { ...structuredClone(DEFAULT_RULEBOOK), ...change };
}

function evalEdited(
    change: Partial<RulebookParameters['eval']>,
): RulebookParameters {
    return edited({ eval: { ...DEFAULT_RULEBOOK.eval, ...change } });
}

function hardRuleItems(): Set<string> {
    const start = SKILL_LINES.findIndex((line) =>
        isAnchorPrefix(headingText(line) ?? '', HARD_RULES_HEADING),
    );
    if (start === -1) return new Set();
    const sectionLines = SKILL_LINES.slice(start + 1);
    const sectionEnd = sectionLines.findIndex(
        (line) => headingText(line) !== null,
    );
    const items = new Set<string>();
    for (const line of sectionLines.slice(0, sectionEnd)) {
        const item = /^(\d+)\.\s+\*\*/.exec(line);
        if (item?.[1] !== undefined) items.add(item[1]);
    }
    return items;
}

function headingText(line: string): null | string {
    const match = /^#{1,6}\s+(.+)$/.exec(line);
    return match?.[1] ?? null;
}

function isAnchorPrefix(text: string, anchor: string): boolean {
    return (
        text === anchor ||
        text.startsWith(`${anchor} `) ||
        text.startsWith(`${anchor}:`)
    );
}

function isSkillAnchor(anchor: string): boolean {
    return SKILL_LINES.some((line) => {
        const heading = headingText(line);
        if (heading !== null) return isAnchorPrefix(heading, anchor);
        const boldLabel = /^\*\*(.+?)\*\*/.exec(line)?.[1];
        const tableLabel = /^\|\s*\*\*(.+?)\*\*\s*\|/.exec(line)?.[1];
        return (
            (boldLabel !== undefined && isAnchorPrefix(boldLabel, anchor)) ||
            tableLabel === anchor
        );
    });
}

describe('RuleSource', () => {
    it('cites SKILL.md anchors, one per hard rule plus the named sections', () => {
        expect(Object.values(RuleSource)).toEqual([
            'THE OPTIMAL EVAL LADDER',
            'General derivation for any plan',
            'Hard Rule 1',
            'Hard Rule 2',
            'Hard Rule 3',
            'Hard Rule 4',
            'Hard Rule 5',
            'Hard Rule 6',
            'Hard Rule 7',
            'Hard Rule 8',
            'HIS NUMBERS',
            'Live account (NOT replaceable)',
            'PAYOUT SIZING',
            'Reassessment cadence',
        ]);
    });

    it('finds every anchor in SKILL.md as a heading, a bold label, a table row or a numbered hard rule', () => {
        const hardRules = hardRuleItems();
        expect(hardRules.size).toBe(8);
        const missing = Object.values(RuleSource).filter((source) => {
            const hardRule = HARD_RULE_PATTERN.exec(source)?.[1];
            return hardRule === undefined
                ? !isSkillAnchor(source)
                : !hardRules.has(hardRule);
        });
        expect(missing).toEqual([]);
    });

    it('does not match an anchor that SKILL.md lacks', () => {
        expect(isSkillAnchor('Eval ladder')).toBe(false);
        expect(isSkillAnchor('Payout size')).toBe(false);
        expect(isSkillAnchor('Live sizing')).toBe(false);
    });
});

describe('rulebookDeviation', () => {
    it('is empty for the defaults', () => {
        expect(rulebookDeviation(DEFAULT_RULEBOOK)).toEqual([]);
        expect(rulebookDeviation(structuredClone(DEFAULT_RULEBOOK))).toEqual(
            [],
        );
    });

    it('reports Hard Rule 5 after changing the funded risk', () => {
        expect(
            rulebookDeviation(
                edited({
                    funded: { ...DEFAULT_RULEBOOK.funded, riskCents: 30_000 },
                }),
            ),
        ).toEqual([RuleSource.HardRule5]);
    });

    it('reports the general derivation after switching the eval mode', () => {
        expect(
            rulebookDeviation(
                edited({
                    eval: {
                        ...DEFAULT_RULEBOOK.eval,
                        mode: EvalSizingMode.MaxRisk,
                    },
                }),
            ),
        ).toEqual([RuleSource.GeneralDerivation]);
        expect(
            rulebookDeviation(
                edited({
                    eval: {
                        ...DEFAULT_RULEBOOK.eval,
                        ladderFractionSource:
                            LadderFractionSource.MffRapidEodSearch,
                    },
                }),
            ),
        ).toEqual([RuleSource.GeneralDerivation]);
    });

    it('maps every parameter group to its section anchor', () => {
        const cases: [RulebookParameters, RuleSource[]][] = [
            [
                edited({
                    strategy: { ...DEFAULT_RULEBOOK.strategy, winrate: 0.45 },
                }),
                [RuleSource.HisNumbers],
            ],
            [
                edited({
                    eval: {
                        ...DEFAULT_RULEBOOK.eval,
                        generalDerivation: {
                            escalation: 2,
                            firstRungFraction: 0.2,
                        },
                    },
                }),
                [RuleSource.GeneralDerivation],
            ],
            [
                evalEdited({
                    ladderFractionSource:
                        LadderFractionSource.MffRapidEodSearch,
                    mffSearchFractions: [0.25, 0.25, 0.25, 0.25],
                }),
                [RuleSource.EvalLadder, RuleSource.GeneralDerivation],
            ],
            [
                evalEdited({
                    maxRiskDailyCapMultiple: 3,
                    mode: EvalSizingMode.MaxRisk,
                }),
                [RuleSource.GeneralDerivation, RuleSource.HardRule4],
            ],
            [
                edited({
                    funded: {
                        ...DEFAULT_RULEBOOK.funded,
                        stopRule: { kind: DayStopRuleKind.DayGreen },
                    },
                }),
                [RuleSource.HisNumbers],
            ],
            [
                edited({
                    live: {
                        cushionPercent: {
                            postLock: fraction(0.1),
                            preLock: fraction(0.04),
                        },
                    },
                }),
                [RuleSource.LiveSizing],
            ],
            [
                edited({
                    payout: {
                        ...DEFAULT_RULEBOOK.payout,
                        retainedCushionCents: 250_000,
                    },
                }),
                [RuleSource.HardRule2],
            ],
            [
                edited({
                    payout: {
                        ...DEFAULT_RULEBOOK.payout,
                        requestCents: 100_000,
                    },
                }),
                [RuleSource.PayoutSize],
            ],
            [
                edited({ execution: { maxTradesPerWindow: 2 } }),
                [RuleSource.HardRule6],
            ],
            [
                edited({
                    review: {
                        ...DEFAULT_RULEBOOK.review,
                        weekday: ReviewWeekday.Friday,
                    },
                }),
                [RuleSource.ReassessmentCadence],
            ],
        ];
        for (const [rulebook, expected] of cases) {
            expect(rulebookDeviation(rulebook)).toEqual(expected);
        }
    });

    it('ignores edits to the parameters of an inactive eval mode', () => {
        expect(
            rulebookDeviation(
                evalEdited({ mffSearchFractions: [0.25, 0.25, 0.25, 0.25] }),
            ),
        ).toEqual([]);
        expect(
            rulebookDeviation(evalEdited({ maxRiskDailyCapMultiple: 3 })),
        ).toEqual([]);
        expect(
            rulebookDeviation(
                evalEdited({
                    mffSearchFractions: [0.5, 0.5],
                    mode: EvalSizingMode.MaxRisk,
                }),
            ),
        ).toEqual([RuleSource.GeneralDerivation]);
        expect(
            rulebookDeviation(
                evalEdited({
                    ladderFractionSource:
                        LadderFractionSource.MffRapidEodSearch,
                    maxRiskDailyCapMultiple: 3,
                }),
            ),
        ).toEqual([RuleSource.GeneralDerivation]);
    });

    it('keeps comparing the active mode parameters against the skill numbers', () => {
        expect(
            rulebookDeviation(
                evalEdited({
                    ladderFractionSource:
                        LadderFractionSource.MffRapidEodSearch,
                }),
            ),
        ).toEqual([RuleSource.GeneralDerivation]);
        expect(
            rulebookDeviation(
                evalEdited({
                    ladderFractionSource:
                        LadderFractionSource.MffRapidEodSearch,
                    mffSearchFractions: [0.5, 0.5],
                }),
            ),
        ).toEqual([RuleSource.EvalLadder, RuleSource.GeneralDerivation]);
        expect(
            rulebookDeviation(
                evalEdited({
                    maxRiskDailyCapMultiple: 3,
                    mode: EvalSizingMode.MaxRisk,
                }),
            ),
        ).toEqual([RuleSource.GeneralDerivation, RuleSource.HardRule4]);
    });

    it('lists each source once, in declaration order, when several groups differ', () => {
        const rulebook = edited({
            funded: {
                ...DEFAULT_RULEBOOK.funded,
                riskCents: 30_000,
                takeProfitCents: 60_000,
            },
            payout: {
                allowBelowHardRule2: true,
                requestCents: 50_000,
                retainedCushionCents: 100_000,
            },
            strategy: { ...DEFAULT_RULEBOOK.strategy, rr: 3 },
        });
        expect(rulebookDeviation(rulebook)).toEqual([
            RuleSource.HardRule2,
            RuleSource.HardRule5,
            RuleSource.HisNumbers,
        ]);
    });

    it('ignores alert thresholds, which are not skill rules', () => {
        expect(
            rulebookDeviation(
                edited({
                    alerts: {
                        ...DEFAULT_RULEBOOK.alerts,
                        evalDaysRemainingWarning: 3,
                    },
                }),
            ),
        ).toEqual([]);
    });
});
