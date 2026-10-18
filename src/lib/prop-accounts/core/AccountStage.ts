import { SizingStage as AccountStage } from '~/lib/prop-calculator/advisor';

export { SizingStage as AccountStage } from '~/lib/prop-calculator/advisor';

const STAGE_LABEL: Readonly<Record<AccountStage, string>> = {
    [AccountStage.Eval]: 'Evaluation',
    [AccountStage.Funded]: 'Funded',
    [AccountStage.Live]: 'Live',
};

export function accountStageBreakdown(
    counts: readonly { readonly count: number; readonly stage: AccountStage }[],
): string {
    return counts
        .map(({ count, stage }) => `${count} ${accountStageLabel(stage)}`)
        .join(', ');
}

export function accountStageLabel(stage: AccountStage): string {
    return STAGE_LABEL[stage];
}
