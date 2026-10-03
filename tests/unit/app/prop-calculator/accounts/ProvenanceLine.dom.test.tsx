import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type AssumptionView,
    provenanceTextOf,
} from '~/app/(app)/prop-calculator/accounts/_components/advice/adviceViewModel';
import { AssumptionsList } from '~/app/(app)/prop-calculator/accounts/_components/advice/AssumptionsList';
import { ProvenanceLine } from '~/app/(app)/prop-calculator/accounts/_components/advice/ProvenanceLine';
import { FirmId } from '~/lib/prop-calculator';
import {
    type AdviceProvenance,
    AdviceSource,
    AssumptionBias,
    SizingObjective,
    StartBasis,
} from '~/lib/prop-calculator/advisor';
import { firmDataProvenance } from '~/lib/prop-calculator/describe';

const PROVENANCE: AdviceProvenance = {
    computedAt: '2026-09-27',
    firmDataDate: '2026-10-02',
    objective: SizingObjective.MonthlyNet,
    planRulesFingerprint: 'abc123def456',
    seed: 42,
    snapshotDate: '2026-09-26',
    solverVersion: null,
    source: AdviceSource.FundedSweepFresh,
    startBasis: StartBasis.Fresh,
    trials: 20_000,
};

describe('the provenance line reads in words (PT-108 step 5, F-125, F-126)', () => {
    let container: HTMLDivElement;
    let root: Root;

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

    function render(
        provenance: AdviceProvenance,
        firmId: FirmId = FirmId.TopStep,
    ) {
        act(() => {
            root.render(
                <ProvenanceLine firmId={firmId} provenance={provenance} />,
            );
        });
    }

    it('prints typed labels for the source and the start basis, never the enum values', () => {
        render(PROVENANCE);

        const text = container.textContent;
        expect(text).toContain('Fresh funded sweep');
        expect(text).toContain('fresh start');
        expect(text).not.toContain('funded-sweep-fresh');
    });

    it('labels a from-state basis as the current state', () => {
        render({
            ...PROVENANCE,
            source: AdviceSource.LadderSearchFromState,
            startBasis: StartBasis.FromState,
        });

        const text = container.textContent;
        expect(text).toContain('Ladder search (from state)');
        expect(text).toContain('from your current state');
        expect(text).not.toContain('from-state');
    });

    it('says the figures were simulated with the trial count and the seed', () => {
        render(PROVENANCE);

        expect(container.textContent).toContain(
            'simulated, 20,000 trials, seed 42',
        );
    });

    it('says no simulation ran when the advice carries no trials', () => {
        render({ ...PROVENANCE, seed: null, trials: null });

        const text = container.textContent;
        expect(text).toContain('no simulation run');
        expect(text).not.toContain('seed');
    });

    it('shows the plan rules fingerprint when the advice carries one', () => {
        render(PROVENANCE);

        expect(container.textContent).toContain(
            'plan rules fingerprint abc123def456',
        );
    });

    it('says firm data is unverified when there is no verification date', () => {
        render({ ...PROVENANCE, firmDataDate: null });

        expect(container.textContent).toContain('firm data unverified');
        expect(container.textContent).not.toContain('firm data verified');
    });

    it('shows the verification date when there is one', () => {
        render(PROVENANCE);

        expect(container.textContent).toContain(
            'firm data verified 2026-10-02',
        );
    });

    it("names TopStep's open items U32, U33 and N-53 behind a count", () => {
        render(PROVENANCE);

        const summary = container.querySelector('summary');
        expect(summary?.textContent).toBe(
            `${String(firmDataProvenance(FirmId.TopStep).openItems.length)} open items`,
        );
        const items = container.querySelector('details')?.textContent ?? '';
        expect(items).toContain('U32');
        expect(items).toContain('U33');
        expect(items).toContain('N-53');
    });

    it("names Apex's own open item, not another firm's", () => {
        render(PROVENANCE, FirmId.Apex);

        const items = container.querySelector('details')?.textContent ?? '';
        expect(items).toContain('403');
        expect(items).not.toContain('U32');
    });
});

describe('provenanceTextOf (PT-108 step 5)', () => {
    it('says a firm with no open items has none', () => {
        const text = provenanceTextOf(PROVENANCE, []);

        expect(text.openItemsSummary).toBe('no open items');
        expect(text.openItems).toEqual([]);
    });

    it('counts one open item in the singular', () => {
        const text = provenanceTextOf(PROVENANCE, ['U1: a question']);

        expect(text.openItemsSummary).toBe('1 open item');
    });

    it('carries the source and start labels among its parts', () => {
        const text = provenanceTextOf(PROVENANCE, []);

        expect(text.parts).toContain('Fresh funded sweep');
        expect(text.parts).toContain('fresh start');
    });
});

describe('the assumptions list badges firm data that is unverified (PT-108 step 5, F-125)', () => {
    let container: HTMLDivElement;
    let root: Root;

    const ASSUMPTIONS: readonly AssumptionView[] = [
        { bias: AssumptionBias.Optimistic, text: 'Triggers are not checked.' },
    ];

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

    function badges(): string[] {
        return [...container.querySelectorAll('span')]
            .map((span) => span.textContent)
            .filter((text) => text === 'unverified');
    }

    function render(isFirmDataUnverified: boolean, list = ASSUMPTIONS) {
        act(() => {
            root.render(
                <AssumptionsList
                    assumptions={list}
                    isFirmDataUnverified={isFirmDataUnverified}
                />,
            );
        });
    }

    it('shows an "unverified" badge beside the assumptions when the firm data has no verification date', () => {
        render(true);

        expect(badges()).toEqual(['unverified']);
        expect(container.textContent).toContain('Triggers are not checked.');
    });

    it('shows the badge even when no input was defaulted', () => {
        render(true, []);

        expect(badges()).toEqual(['unverified']);
        expect(container.textContent).toContain('No inputs were defaulted');
    });

    it('shows no badge when the firm data is verified', () => {
        render(false);

        expect(badges()).toEqual([]);
    });
});
