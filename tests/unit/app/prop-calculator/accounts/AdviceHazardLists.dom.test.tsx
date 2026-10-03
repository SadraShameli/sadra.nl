import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type AdviceValueView,
    type PayoutStakeView,
    type RiskCandidatesView,
    ValueSectionKind,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceValueModel';
import { PayoutReadyBanner } from '~/app/(app)/prop-calculator/accounts/_components/advice/PayoutReadyBanner';
import { RiskCandidatesTable } from '~/app/(app)/prop-calculator/accounts/_components/advice/RiskCandidatesTable';
import { RiskCandidates } from '~/app/(app)/prop-calculator/accounts/_components/advice/ValueSections';

const PAYOUT_LIST =
    'ul[aria-label="Live-transfer and payout-trigger assumptions behind the payout request"]';
const CANDIDATES_LIST =
    'ul[aria-label="Live-transfer and payout-trigger assumptions behind the risk candidates"]';
const HAZARD_NOTE = 'Live transfer: priced at a 30% hazard, a synthetic note.';

const UNCERTAIN = { standardError: 5, value: 1000 };

function candidatesView(notes: readonly string[]): RiskCandidatesView {
    return {
        isRanked: false,
        label: 'Value of one trade at each candidate risk',
        liveTransferNotes: notes,
        rows: [
            {
                continuation: UNCERTAIN,
                contractsText: null,
                isDocumented: true,
                isEngineOptimum: false,
                monthlyNetCharge: 0,
                netOfDurationCharge: 900,
                rank: 1,
                risk: {
                    disclosure: null,
                    isFallback: false,
                    label: 'dollars',
                    text: '$250',
                },
                riskDollars: 250,
            },
        ],
        sizingNote: null,
    };
}

function stakeView(notes: readonly string[]): PayoutStakeView {
    return {
        continueNow: UNCERTAIN,
        evAtStake: UNCERTAIN,
        liveTransferNotes: notes,
        requestedAmount: 500,
        requestNow: UNCERTAIN,
        traderReceivesNow: 450,
        whatIf: null,
    };
}

function valueViewOf(candidates: RiskCandidatesView): AdviceValueView {
    return {
        boundaryNote: null,
        candidates: { kind: ValueSectionKind.Ready, view: candidates },
        firstSwing: null,
        flatRiskReason: null,
        replacementFee: 0,
        stake: null,
        swings: [],
        tree: null,
    };
}

describe('the hazard lists render inside the components that own the figures (PT-36k, F-V26)', () => {
    let container: HTMLDivElement;
    let root: Root;

    function render(element: ReactElement) {
        act(() => {
            root.render(element);
        });
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

    it('prints the payout-stake hazard notes inside the request-payout banner', () => {
        render(
            <PayoutReadyBanner
                flag={null}
                stake={{
                    kind: ValueSectionKind.Ready,
                    view: stakeView([HAZARD_NOTE]),
                }}
            />,
        );

        const list = container.querySelector(PAYOUT_LIST);
        expect(list?.textContent).toContain(HAZARD_NOTE);
    });

    it('prints no hazard list in the banner for a stake without notes', () => {
        render(
            <PayoutReadyBanner
                flag={null}
                stake={{
                    kind: ValueSectionKind.Ready,
                    view: stakeView([]),
                }}
            />,
        );

        expect(container.querySelector(PAYOUT_LIST)).toBeNull();
    });

    it('prints the hazard notes inside the risk candidates table', () => {
        render(<RiskCandidatesTable view={candidatesView([HAZARD_NOTE])} />);

        const list = container.querySelector(CANDIDATES_LIST);
        expect(list?.textContent).toContain(HAZARD_NOTE);
    });

    it('prints no hazard list in the table for candidates without notes', () => {
        render(<RiskCandidatesTable view={candidatesView([])} />);

        expect(container.querySelector(CANDIDATES_LIST)).toBeNull();
    });

    it('prints the hazard notes through the risk candidates section', () => {
        render(
            <RiskCandidates
                valueView={valueViewOf(candidatesView([HAZARD_NOTE]))}
            />,
        );

        expect(container.querySelector(CANDIDATES_LIST)?.textContent).toContain(
            HAZARD_NOTE,
        );
    });
});

describe('the advice panel keeps no hazard list of its own (PT-36k, F-V26)', () => {
    const source = readFileSync(
        path.resolve(
            import.meta.dirname,
            '../../../../../src/app/(app)/prop-calculator/accounts/_components/advice/AdvicePanel.tsx',
        ),
        'utf8',
    );

    it.each([
        'PayoutStakeLiveTransfer',
        'RiskCandidatesLiveTransfer',
        'LiveTransferNotesList',
    ])('defines no %s', (name) => {
        expect(source).not.toContain(name);
    });
});
