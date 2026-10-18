import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BustDiagnosisCard } from '~/app/(app)/prop-calculator/accounts/_components/detail/BustDiagnosisCard';
import {
    BustDiagnosisKind,
    bustDiagnosisOf,
    BustEvidenceKind,
} from '~/lib/prop-accounts/conduct';
import { BustCause, usdCents } from '~/lib/prop-accounts/core';

describe('BustDiagnosisCard', () => {
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
        container.remove();
    });

    it('shows the Structural label and its evidence', () => {
        act(() => {
            root.render(
                <BustDiagnosisCard
                    diagnosis={{
                        evidence: [
                            {
                                detail: 'A violation occurred inside the attempt window',
                                kind: BustEvidenceKind.Violation,
                            },
                        ],
                        kind: BustDiagnosisKind.Structural,
                    }}
                />,
            );
        });
        expect(container.textContent).toContain('Structural');
        expect(container.textContent).toContain(
            'A violation occurred inside the attempt window',
        );
    });

    it('shows the WithinPlan label with the evidence the diagnosis returns and no empty-evidence line', () => {
        const diagnosis = bustDiagnosisOf({
            bustCause: BustCause.MaxDrawdown,
            decisions: [
                {
                    acceptedRiskCents: usdCents(25_000),
                    actualRiskCents: usdCents(25_000),
                },
                {
                    acceptedRiskCents: usdCents(25_000),
                    actualRiskCents: null,
                },
            ],
            violations: [],
        });
        expect(diagnosis.kind).toBe(BustDiagnosisKind.WithinPlan);
        act(() => {
            root.render(<BustDiagnosisCard diagnosis={diagnosis} />);
        });
        expect(container.textContent).toContain('Within plan');
        expect(container.textContent).toContain(
            '2 recorded decisions, none above the accepted risk; the bust cause is max drawdown',
        );
        expect(container.textContent).not.toContain(
            'No supporting evidence recorded.',
        );
    });

    it('still says no evidence is recorded when a diagnosis has none', () => {
        act(() => {
            root.render(
                <BustDiagnosisCard
                    diagnosis={{
                        evidence: [],
                        kind: BustDiagnosisKind.Unknown,
                    }}
                />,
            );
        });
        expect(container.textContent).toContain(
            'No supporting evidence recorded.',
        );
    });

    it('shows the Unknown label when there is not enough evidence to tell', () => {
        act(() => {
            root.render(
                <BustDiagnosisCard
                    diagnosis={{
                        evidence: [],
                        kind: BustDiagnosisKind.Unknown,
                    }}
                />,
            );
        });
        expect(container.textContent).toContain('Unknown');
    });

    it('renders two evidence items with identical detail text without a duplicate-key warning', () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockReturnValue(undefined);
        const duplicateDetail =
            'A oversize violation was recorded on 2026-09-01, inside the attempt window';
        act(() => {
            root.render(
                <BustDiagnosisCard
                    diagnosis={{
                        evidence: [
                            {
                                detail: duplicateDetail,
                                kind: BustEvidenceKind.Violation,
                            },
                            {
                                detail: duplicateDetail,
                                kind: BustEvidenceKind.Violation,
                            },
                        ],
                        kind: BustDiagnosisKind.Structural,
                    }}
                />,
            );
        });
        expect(container.querySelectorAll('li')).toHaveLength(2);
        expect(
            consoleError.mock.calls.some((call) =>
                String(call[0]).includes(
                    'Encountered two children with the same key',
                ),
            ),
        ).toBe(false);
        consoleError.mockRestore();
    });
});
