export enum SizingObjective {
    CycleCash = 'cycle-cash',
    MonthlyNet = 'monthly-net',
    RuinFirst = 'ruin-first',
}

export enum SpeedObjective {
    SpeedToFunded = 'speed-to-funded',
}

export const SIZING_OBJECTIVE_LABEL: Readonly<Record<SizingObjective, string>> =
    {
        [SizingObjective.CycleCash]: 'cycle cash',
        [SizingObjective.MonthlyNet]: 'monthly net',
        [SizingObjective.RuinFirst]: 'ruin first',
    };

export function sizingObjectiveText(
    objective: SizingObjective | SpeedObjective,
): string {
    switch (objective) {
        case SizingObjective.CycleCash: {
            return 'Ranks by expected cash per eval-to-funded cycle, an eval-stage proxy.';
        }
        case SizingObjective.MonthlyNet: {
            return 'Ranks by expected monthly net.';
        }
        case SizingObjective.RuinFirst: {
            return 'Ranks which plan to buy only; it never sizes eval rungs or funded risk.';
        }
        case SpeedObjective.SpeedToFunded: {
            return 'Ranks by speed to funded, not by expected monthly net.';
        }
    }
}
