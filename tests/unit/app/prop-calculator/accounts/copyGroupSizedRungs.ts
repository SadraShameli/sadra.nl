import { type CopyGroupSizingSection } from '~/app/(app)/prop-calculator/accounts/copy-groups/copyGroupSizingModel';
import {
    type CopyGroupSizingMember,
    documentedSizingOf,
    personalCapsFromAccount,
    ReconstructedLiveKind,
} from '~/lib/prop-calculator/advisor';

export function soloRungSumOf(section: CopyGroupSizingSection): number {
    return section.inputs.members.reduce(
        (sum, member) =>
            sum +
            soloRungRisksOf(section, member).reduce(
                (total, risk) => total + risk,
                0,
            ),
        0,
    );
}

function soloRungRisksOf(
    section: CopyGroupSizingSection,
    member: CopyGroupSizingMember,
): readonly number[] {
    const { account } = member;
    if (account.kind === ReconstructedLiveKind.Live) {
        throw new Error('a live member has no solo sizing');
    }
    const { sizing } = documentedSizingOf(account, section.inputs.rulebook, {
        ...(member.accountPolicy !== null && {
            accountPolicy: member.accountPolicy,
        }),
        paidPayoutsSinceLastLiveAccount: member.paidPayoutsSinceLastLiveAccount,
        personalCaps: personalCapsFromAccount(account, member.personalCaps),
        personalDll: member.personalDll ?? null,
    });
    return sizing.rungs.map((rung) => rung.risk);
}
