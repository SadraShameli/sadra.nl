import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type CopyGroupAccount,
    copyGroupRows,
} from '~/app/(app)/prop-calculator/accounts/_components/copyGroups/copyGroupRows';
import {
    copyGroupRuleTermsOf,
    type CopyGroupSizingSection,
    withPositionSizing,
} from '~/app/(app)/prop-calculator/accounts/copy-groups/copyGroupSizingModel';
import {
    GroupSizingSection,
    GroupSizingViewKind,
} from '~/app/(app)/prop-calculator/accounts/copy-groups/GroupSizingSection';
import { formatCurrency } from '~/lib/format';
import {
    AccountStage,
    AccountStatus,
    AccountTracking,
} from '~/lib/prop-accounts';
import { FirmId, serializePlanId } from '~/lib/prop-calculator';
import {
    type CopyGroupSizingMember,
    CopyGroupSizingResultKind,
    DEFAULT_RULEBOOK,
    type ReconstructedFundedOrEvalAccount,
} from '~/lib/prop-calculator/advisor';

import {
    evalReconstructed,
    fundedReconstructed,
    mffBuilderPlan,
    mffProPlan,
} from '../../../lib/prop-accounts/reconstructionFixtures';

const GROUP = {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Main copy',
    notes: null,
};

const COPY_GROUPS_DIRECTORY = path.join(
    process.cwd(),
    'src',
    'app',
    '(app)',
    'prop-calculator',
    'accounts',
    'copy-groups',
);

function accountRow(id: string, stage: AccountStage): CopyGroupAccount {
    return {
        archivedAt: null,
        copyGroupId: GROUP.id,
        externalFirmId: null,
        firmId: FirmId.Mffu,
        id,
        label: id,
        planLabel: null,
        planSerial: serializePlanId(mffProPlan().id),
        stage,
        status: AccountStatus.Active,
        tracking: AccountTracking.Modeled,
    };
}

function evalAccount(
    personalMaxRiskPerTrade: null | number = null,
): ReconstructedFundedOrEvalAccount {
    return evalReconstructed(mffBuilderPlan(), { personalMaxRiskPerTrade });
}

function fundedWithCushion(
    cushion: number,
    personalMaxRiskPerTrade: null | number = null,
): ReconstructedFundedOrEvalAccount {
    const plan = mffProPlan();
    const { state } = fundedReconstructed(plan);
    return fundedReconstructed(plan, {
        balance: state.threshold + cushion,
        personalMaxRiskPerTrade,
    });
}

function memberOf(
    id: string,
    account: ReconstructedFundedOrEvalAccount,
): CopyGroupSizingMember {
    return {
        account,
        accountPolicy: null,
        id,
        label: id,
        paidPayoutsSinceLastLiveAccount: null,
        personalRequestOverride: null,
        personalRetainedCushion: null,
    };
}

function sectionOf(
    members: readonly CopyGroupSizingMember[],
): CopyGroupSizingSection {
    return withPositionSizing(
        {
            asOf: '2026-09-26',
            exposure: null,
            inputs: {
                leftOutLabels: [],
                members,
                rulebook: DEFAULT_RULEBOOK,
                simulationMembers: [],
            },
            staleMembers: [],
            unsizedMembers: [],
        },
        null,
    );
}

function sizedOf(section: CopyGroupSizingSection) {
    if (section.result.kind !== CopyGroupSizingResultKind.Sized) {
        throw new Error(
            `expected the group to be sized: ${section.result.rejection.message}`,
        );
    }
    return section.result;
}

describe('the copy group page names divergent members and every rung (PT-101, F-67, F-130)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(section: CopyGroupSizingSection, stage: AccountStage) {
        const accounts = section.inputs.members.map((member) =>
            accountRow(member.id, stage),
        );
        const [row] = copyGroupRows([GROUP], accounts).groups;
        if (row === undefined) throw new Error('no row for the group');
        act(() => {
            root.render(
                <GroupSizingSection
                    row={row}
                    sizing={{ kind: GroupSizingViewKind.Ready, section }}
                />,
            );
        });
    }

    function rungRows(): string[][] {
        return [...container.querySelectorAll(':scope tbody tr')].map(
            (tableRow) =>
                [...tableRow.querySelectorAll('td')].map(
                    (cell) => cell.textContent,
                ),
        );
    }

    function paragraphs(): string[] {
        return [...container.querySelectorAll('p')].map(
            (paragraph) => paragraph.textContent,
        );
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('names the tight funded member as setting the size and gives the loose one a line with the difference', () => {
        const section = sectionOf([
            memberOf('loose', fundedWithCushion(5000)),
            memberOf('tight', fundedWithCushion(5000, 100)),
        ]);
        const result = sizedOf(section);
        expect(result.divergences).toHaveLength(1);
        const [divergence] = result.divergences;
        expect(divergence?.memberId).toBe('loose');
        expect(divergence?.rungIndex).toBe(0);

        render(section, AccountStage.Funded);

        const text = paragraphs();
        expect(
            text.some(
                (line) =>
                    line.includes('Documented size for every copy') &&
                    line.includes('set by tight'),
            ),
        ).toBe(true);
        expect(text).toContain(
            `loose would size trade 1 at ${formatCurrency(divergence?.ownRisk ?? 0, 2)}, above the group's ${formatCurrency(divergence?.groupRisk ?? 0, 2)} (the group takes the smaller)`,
        );
        expect(text.some((line) => line.startsWith('tight would size'))).toBe(
            false,
        );
    });

    it('lists an eval group member that diverges at a later rung with its trade number', () => {
        const soloSection = sectionOf([memberOf('solo', evalAccount())]);
        const solo = sizedOf(soloSection).sizing.rungs;
        const secondRung = solo[1]?.risk ?? 0;
        expect(solo.length).toBeGreaterThan(3);
        expect(solo[2]?.risk).toBeGreaterThan(secondRung);
        const section = sectionOf([
            memberOf('free', evalAccount()),
            memberOf('capped', evalAccount(secondRung)),
        ]);
        const result = sizedOf(section);
        const free = result.divergences.find(
            (divergence) => divergence.memberId === 'free',
        );
        expect(free?.rungIndex).toBe(2);
        expect(result.divergences.map((entry) => entry.memberId)).toEqual([
            'free',
        ]);

        render(section, AccountStage.Eval);

        expect(paragraphs()).toContain(
            `free would size trade 3 at ${formatCurrency(free?.ownRisk ?? 0, 2)}, above the group's ${formatCurrency(free?.groupRisk ?? 0, 2)} (the group takes the smaller)`,
        );
        expect(
            paragraphs().filter((line) => line.includes('would size')),
        ).toHaveLength(1);
    });

    it('prints no divergence line when every member sizes the same ladder', () => {
        const section = sectionOf([
            memberOf('a', fundedWithCushion(5000)),
            memberOf('b', fundedWithCushion(5000)),
        ]);
        expect(sizedOf(section).divergences).toEqual([]);

        render(section, AccountStage.Funded);

        expect(paragraphs().some((line) => line.includes('would size'))).toBe(
            false,
        );
    });

    it('lists every rung of an eval group, not just the first', () => {
        const section = sectionOf([
            memberOf('a', evalAccount()),
            memberOf('b', evalAccount()),
        ]);
        const { rungs } = sizedOf(section).sizing;
        expect(rungs.length).toBeGreaterThan(1);

        render(section, AccountStage.Eval);

        const rows = rungRows();
        expect(rows).toHaveLength(rungs.length);
        for (const [index, rung] of rungs.entries()) {
            expect(rows[index]?.slice(0, 4)).toEqual([
                String(index + 1),
                formatCurrency(rung.risk, 2),
                formatCurrency(rung.takeProfit, 2),
                formatCurrency(rung.runningLossAfter, 2),
            ]);
        }
    });

    it('lists the smaller later rung of a funded group', () => {
        const section = sectionOf([
            memberOf('a', fundedWithCushion(600)),
            memberOf('b', fundedWithCushion(600)),
        ]);
        const { rungs } = sizedOf(section).sizing;
        expect(rungs.map((rung) => rung.risk)).toEqual([250, 250, 100]);

        render(section, AccountStage.Funded);

        expect(rungRows().map((cells) => cells[1])).toEqual([
            '$250.00',
            '$250.00',
            '$100.00',
        ]);
    });
});

describe('the group page shows the rule terms behind the ladder and never an empty headline (PT-101)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(section: CopyGroupSizingSection, stage: AccountStage) {
        const accounts = section.inputs.members.map((member) =>
            accountRow(member.id, stage),
        );
        const [row] = copyGroupRows([GROUP], accounts).groups;
        if (row === undefined) throw new Error('no row for the group');
        act(() => {
            root.render(
                <GroupSizingSection
                    row={row}
                    sizing={{ kind: GroupSizingViewKind.Ready, section }}
                />,
            );
        });
    }

    function paragraphs(): string[] {
        return [...container.querySelectorAll('p')].map(
            (paragraph) => paragraph.textContent,
        );
    }

    beforeEach(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        container = document.createElement('div');
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        document.body.replaceChildren();
        vi.unstubAllGlobals();
    });

    it('prints the eval group max trades and stop rule under the rung table', () => {
        const section = sectionOf([
            memberOf('a', evalAccount()),
            memberOf('b', evalAccount()),
        ]);
        const { sizing } = sizedOf(section);
        const terms = copyGroupRuleTermsOf(sizing);

        render(section, AccountStage.Eval);

        for (const term of terms) expect(paragraphs()).toContain(term);
        expect(paragraphs()).toContain(
            `At most ${String(sizing.maxTrades)} trades a day.`,
        );
        expect(paragraphs()).toContain(
            'Stop rule: stop once the day is green.',
        );
    });

    it('prints the funded group max trades and stop rule', () => {
        const section = sectionOf([
            memberOf('a', fundedWithCushion(5000)),
            memberOf('b', fundedWithCushion(5000)),
        ]);
        const terms = copyGroupRuleTermsOf(sizedOf(section).sizing);

        render(section, AccountStage.Funded);

        for (const term of terms) expect(paragraphs()).toContain(term);
        expect(paragraphs()).toContain(
            `At most ${String(DEFAULT_RULEBOOK.funded.tradesPerDayMax)} trades a day.`,
        );
    });

    it('prints no headline and no table for a sized result that holds no rung', () => {
        const section = sectionOf([
            memberOf('a', fundedWithCushion(5000)),
            memberOf('b', fundedWithCushion(5000)),
        ]);
        const result = sizedOf(section);
        const emptied: CopyGroupSizingSection = {
            ...section,
            result: { ...result, sizing: { ...result.sizing, rungs: [] } },
        };

        render(emptied, AccountStage.Funded);

        expect(container.textContent).not.toContain('Documented size');
        expect(container.textContent).not.toContain('$0.00');
        expect(container.querySelector('table')).toBeNull();
    });
});

describe('the group sizing view kinds are an enum (PT-101, F-67 (3), F-130 (3))', () => {
    it('names the three kinds once, in GroupSizingViewKind', () => {
        expect(GroupSizingViewKind.Failed).toBe('failed');
        expect(GroupSizingViewKind.Pending).toBe('pending');
        expect(GroupSizingViewKind.Ready).toBe('ready');
    });

    it.each(['CopyGroupsView.tsx', 'GroupSizingSection.tsx'])(
        'leaves no bare view kind literal in %s',
        (file) => {
            const source = readFileSync(
                path.join(COPY_GROUPS_DIRECTORY, file),
                'utf8',
            );
            expect(source).not.toMatch(
                /kind\s*(?:===|!==|:)\s*'(?:failed|pending|ready)'/u,
            );
        },
    );
});
