import { type BankrollParameters } from '~/lib/prop-calculator/advisor/Rulebook';
import { SizingObjective } from '~/lib/prop-calculator/advisor/SizingObjective';

export function chooseObjective(
    availableCents: null | number,
    bankroll: BankrollParameters,
): SizingObjective {
    if (availableCents === null) return SizingObjective.MonthlyNet;
    if (bankroll.objectiveSwitchCents === null)
        return SizingObjective.MonthlyNet;
    return availableCents < bankroll.objectiveSwitchCents
        ? SizingObjective.RuinFirst
        : SizingObjective.MonthlyNet;
}
