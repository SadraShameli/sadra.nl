import type {
    ProgramBlock,
    ProgramCategory,
    ProgramSchedule,
} from '~/lib/lifting/types';

export interface OfficialProgram {
    category: ProgramCategory;
    daysPerWeek: number;
    description: string;
    lengthWeeks: number;
    name: string;
    schedule: ProgramSchedule;
    slug: string;
}

function amrap(slug: string, pct1rm: number, rest = 180): ProgramBlock {
    return {
        exerciseSlug: slug,
        kind: 'amrap',
        pct1rm,
        restSeconds: rest,
    };
}

function straight(
    slug: string,
    sets: number,
    reps: number | string,
    pct1rm?: number,
    rest = 180,
): ProgramBlock {
    return {
        exerciseSlug: slug,
        kind: 'straight',
        pct1rm,
        reps,
        restSeconds: rest,
        sets,
    };
}

const FIVE_THREE_ONE_CYCLES = 4;

const FIVE_THREE_ONE: ProgramSchedule = {
    weeks: Array.from(
        { length: FIVE_THREE_ONE_CYCLES * 4 },
        (_, weekIndex) => weekIndex,
    ).flatMap((weekIndex) => {
        const cycleWeek = (weekIndex % 4) + 1;
        const cycleNumber = Math.floor(weekIndex / 4) + 1;
        const isDeload = cycleWeek === 4;
        const main = isDeload
            ? [
                  { pct: 40, reps: 5 },
                  { pct: 50, reps: 5 },
                  { pct: 60, reps: 5 },
              ]
            : cycleWeek === 1
              ? [
                    { pct: 65, reps: 5 },
                    { pct: 75, reps: 5 },
                    { pct: 85, reps: 5 },
                ]
              : cycleWeek === 2
                ? [
                      { pct: 70, reps: 3 },
                      { pct: 80, reps: 3 },
                      { pct: 90, reps: 3 },
                  ]
                : [
                      { pct: 75, reps: 5 },
                      { pct: 85, reps: 3 },
                      { pct: 95, reps: 1 },
                  ];
        const buildDay = (mainSlug: string) => ({
            blocks: [
                ...main.map((m, index) =>
                    index === main.length - 1 && !isDeload
                        ? amrap(mainSlug, m.pct)
                        : straight(mainSlug, 1, m.reps, m.pct),
                ),
                straight(mainSlug, 5, 10, 50),
            ],
            isDeload,
            name: '',
        });
        return [
            {
                days: [
                    { ...buildDay('overhead-press'), name: 'Press' },
                    {
                        ...buildDay('conventional-deadlift'),
                        name: 'Deadlift',
                    },
                    {
                        ...buildDay('barbell-bench-press'),
                        name: 'Bench',
                    },
                    { ...buildDay('barbell-back-squat'), name: 'Squat' },
                ],
                name: `Cycle ${cycleNumber} · Week ${cycleWeek}`,
            },
        ];
    }),
};

const STRONGLIFTS_5X5: ProgramSchedule = {
    weeks: Array.from({ length: 12 }, (_, index) => ({
        days: [
            {
                blocks: [
                    straight('barbell-back-squat', 5, 5),
                    straight('barbell-bench-press', 5, 5),
                    straight('barbell-row', 5, 5),
                ],
                name: 'Workout A',
            },
            {
                blocks: [
                    straight('barbell-back-squat', 5, 5),
                    straight('overhead-press', 5, 5),
                    straight('conventional-deadlift', 1, 5),
                ],
                name: 'Workout B',
            },
            {
                blocks: [
                    straight('barbell-back-squat', 5, 5),
                    straight('barbell-bench-press', 5, 5),
                    straight('barbell-row', 5, 5),
                ],
                name: 'Workout A (repeat)',
            },
        ],
        name: `Week ${index + 1}`,
    })),
};

const STARTING_STRENGTH: ProgramSchedule = {
    weeks: Array.from({ length: 12 }, (_, index) => ({
        days: [
            {
                blocks: [
                    straight('barbell-back-squat', 3, 5),
                    straight('barbell-bench-press', 3, 5),
                    straight('conventional-deadlift', 1, 5),
                ],
                name: 'A',
            },
            {
                blocks: [
                    straight('barbell-back-squat', 3, 5),
                    straight('overhead-press', 3, 5),
                    straight('conventional-deadlift', 1, 5),
                ],
                name: 'B',
            },
            {
                blocks: [
                    straight('barbell-back-squat', 3, 5),
                    straight('barbell-bench-press', 3, 5),
                    straight('barbell-row', 3, 5),
                ],
                name: 'A',
            },
        ],
        name: `Week ${index + 1}`,
    })),
};

const PPL_6DAY: ProgramSchedule = {
    weeks: Array.from({ length: 8 }, (_, index) => ({
        days: [
            {
                blocks: [
                    straight('barbell-bench-press', 4, 6),
                    straight('overhead-press', 3, 8),
                    straight('incline-dumbbell-bench-press', 3, 10),
                    straight('dumbbell-lateral-raise', 3, 12),
                    straight('tricep-pushdown', 3, 12),
                ],
                name: 'Push',
            },
            {
                blocks: [
                    straight('conventional-deadlift', 3, 5),
                    straight('pull-up', 4, 8),
                    straight('barbell-row', 3, 8),
                    straight('face-pull', 3, 15),
                    straight('barbell-curl', 3, 10),
                ],
                name: 'Pull',
            },
            {
                blocks: [
                    straight('barbell-back-squat', 4, 6),
                    straight('romanian-deadlift', 3, 8),
                    straight('leg-press', 3, 12),
                    straight('seated-leg-curl', 3, 12),
                    straight('standing-calf-raise', 4, 12),
                ],
                name: 'Legs',
            },
            {
                blocks: [
                    straight('incline-barbell-bench-press', 4, 8),
                    straight('seated-dumbbell-shoulder-press', 3, 10),
                    straight('cable-fly', 3, 12),
                    straight('dumbbell-lateral-raise', 3, 15),
                    straight('overhead-tricep-extension', 3, 12),
                ],
                name: 'Push',
            },
            {
                blocks: [
                    straight('lat-pulldown', 4, 10),
                    straight('single-arm-dumbbell-row', 3, 10),
                    straight('seated-cable-row', 3, 12),
                    straight('rear-delt-fly', 3, 15),
                    straight('hammer-curl', 3, 10),
                ],
                name: 'Pull',
            },
            {
                blocks: [
                    straight('barbell-front-squat', 4, 6),
                    straight('barbell-hip-thrust', 3, 8),
                    straight('dumbbell-walking-lunge', 3, 10),
                    straight('leg-extension', 3, 15),
                    straight('standing-calf-raise', 4, 15),
                ],
                name: 'Legs',
            },
        ],
        name: `Week ${index + 1}`,
    })),
};

const UPPER_LOWER_4DAY: ProgramSchedule = {
    weeks: Array.from({ length: 8 }, (_, index) => ({
        days: [
            {
                blocks: [
                    straight('barbell-bench-press', 4, 6),
                    straight('barbell-row', 4, 6),
                    straight('overhead-press', 3, 8),
                    straight('lat-pulldown', 3, 10),
                    straight('barbell-curl', 3, 10),
                    straight('tricep-pushdown', 3, 10),
                ],
                name: 'Upper A',
            },
            {
                blocks: [
                    straight('barbell-back-squat', 4, 6),
                    straight('romanian-deadlift', 3, 8),
                    straight('leg-press', 3, 10),
                    straight('seated-leg-curl', 3, 12),
                    straight('standing-calf-raise', 4, 12),
                ],
                name: 'Lower A',
            },
            {
                blocks: [
                    straight('incline-barbell-bench-press', 4, 8),
                    straight('seated-cable-row', 4, 8),
                    straight('dumbbell-lateral-raise', 3, 12),
                    straight('pull-up', 3, 8),
                    straight('hammer-curl', 3, 10),
                    straight('overhead-tricep-extension', 3, 10),
                ],
                name: 'Upper B',
            },
            {
                blocks: [
                    straight('barbell-front-squat', 4, 6),
                    straight('barbell-hip-thrust', 3, 8),
                    straight('dumbbell-walking-lunge', 3, 10),
                    straight('leg-extension', 3, 15),
                    straight('standing-calf-raise', 4, 15),
                ],
                name: 'Lower B',
            },
        ],
        name: `Week ${index + 1}`,
    })),
};

const GZCLP: ProgramSchedule = {
    weeks: Array.from({ length: 8 }, (_, index) => ({
        days: [
            {
                blocks: [
                    straight('barbell-back-squat', 5, 3, 85),
                    straight('barbell-bench-press', 3, 10, 65),
                    straight('barbell-row', 3, 15),
                ],
                name: 'A1',
            },
            {
                blocks: [
                    straight('overhead-press', 5, 3, 85),
                    straight('conventional-deadlift', 3, 10, 65),
                    straight('lat-pulldown', 3, 15),
                ],
                name: 'B1',
            },
            {
                blocks: [
                    straight('barbell-bench-press', 5, 3, 85),
                    straight('barbell-back-squat', 3, 10, 65),
                    straight('single-arm-dumbbell-row', 3, 15),
                ],
                name: 'A2',
            },
            {
                blocks: [
                    straight('conventional-deadlift', 5, 3, 85),
                    straight('overhead-press', 3, 10, 65),
                    straight('seated-cable-row', 3, 15),
                ],
                name: 'B2',
            },
        ],
        name: `Week ${index + 1}`,
    })),
};

export const OFFICIAL_PROGRAMS: readonly OfficialProgram[] = [
    {
        category: 'strength',
        daysPerWeek: 4,
        description:
            "Jim Wendler's 5/3/1 with Boring But Big 5x10 accessory volume. Four lift split, four-week cycles, periodised 1RM targets.",
        lengthWeeks: 16,
        name: '5/3/1 BBB',
        schedule: FIVE_THREE_ONE,
        slug: '531-bbb',
    },
    {
        category: 'beginner',
        daysPerWeek: 3,
        description:
            'Linear progression program with 5x5 compounds. Add 2.5 kg per session until you stall.',
        lengthWeeks: 12,
        name: 'StrongLifts 5x5',
        schedule: STRONGLIFTS_5X5,
        slug: 'stronglifts-5x5',
    },
    {
        category: 'beginner',
        daysPerWeek: 3,
        description:
            "Mark Rippetoe's Starting Strength linear progression. The fastest way to add weight to your big lifts as a novice.",
        lengthWeeks: 12,
        name: 'Starting Strength',
        schedule: STARTING_STRENGTH,
        slug: 'starting-strength',
    },
    {
        category: 'hypertrophy',
        daysPerWeek: 6,
        description:
            'Classic six-day Push/Pull/Legs split. Two pushes, two pulls, two legs per week with hypertrophy-range rep schemes.',
        lengthWeeks: 8,
        name: 'Push Pull Legs (6-day)',
        schedule: PPL_6DAY,
        slug: 'ppl-6day',
    },
    {
        category: 'hypertrophy',
        daysPerWeek: 4,
        description:
            'Balanced upper/lower split four days a week. Compound focus with hypertrophy accessories.',
        lengthWeeks: 8,
        name: 'Upper / Lower (4-day)',
        schedule: UPPER_LOWER_4DAY,
        slug: 'upper-lower-4day',
    },
    {
        category: 'powerlifting',
        daysPerWeek: 4,
        description:
            'GZCLP — linear progression structured around T1 strength, T2 hypertrophy, T3 endurance tiers.',
        lengthWeeks: 8,
        name: 'GZCLP',
        schedule: GZCLP,
        slug: 'gzclp',
    },
];
