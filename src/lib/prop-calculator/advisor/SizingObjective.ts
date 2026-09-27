export enum SizingObjective {
    CycleCash = 'cycle-cash',
    MonthlyNet = 'monthly-net',
    RuinFirst = 'ruin-first',
}

export function sizingObjectiveText(objective: SizingObjective): string {
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
    }
}
