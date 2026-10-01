import { describe, expect, it } from 'vitest';

import {
    LiveTransitionPreviewCardKind,
    liveTransitionPreviewCardOf,
} from '~/app/(app)/prop-calculator/accounts/_components/detail/liveTransitionPreviewModel';
import { dollars } from '~/lib/prop-calculator';
import {
    LiveApplicabilityNote,
    LiveNotModeledReason,
    LiveStateApproximation,
    type LiveTransitionPreview,
    LiveTransitionPreviewGap,
    LiveTransitionPreviewKind,
} from '~/lib/prop-calculator/advisor';

const TOPSTEP_INERT: LiveTransitionPreview = {
    approximation: LiveStateApproximation.ReserveAndLfaProgressDefaulted,
    isApproximation: true,
    isInertAtAccountSize: true,
    kind: LiveTransitionPreviewKind.DocumentedLiveStart,
    note: LiveApplicabilityNote.TopStepLfaEligibleJurisdictionAssumed,
    range: { highest: dollars(10_000), lowest: dollars(10_000) },
    startingBalance: dollars(10_000),
};

const LUCID_CREDIT: LiveTransitionPreview = {
    buffer: dollars(52_100),
    cap: dollars(15_000),
    creditGross: dollars(7900),
    creditNet: dollars(7110),
    isApproximation: false,
    isCapped: false,
    kind: LiveTransitionPreviewKind.LucidDailyCredit,
    note: LiveApplicabilityNote.LucidDailyTransitionPayoutIsPastCash,
    simProfitAboveBuffer: dollars(7900),
};

function textOf(preview: LiveTransitionPreview): string {
    const model = liveTransitionPreviewCardOf(preview);
    return [model.headline, ...model.lines, ...model.caveats].join(' | ');
}

describe('liveTransitionPreviewCardOf (PT-37, F-90)', () => {
    it('states the TopStep live start and says it is always the same amount at this size', () => {
        const model = liveTransitionPreviewCardOf(TOPSTEP_INERT);
        expect(model.kind).toBe(LiveTransitionPreviewCardKind.LiveStart);
        expect(model.headline).toContain('$10,000');
        expect(model.lines.join(' ')).toContain('always $10,000');
        expect(model.caveats.join(' ')).toContain('jurisdiction');
        expect(model.caveats.join(' ').toLowerCase()).toContain('reserve');
    });

    it('shows the range when the live start depends on the reserve balance', () => {
        const text = textOf({
            ...TOPSTEP_INERT,
            isInertAtAccountSize: false,
            range: { highest: dollars(20_000), lowest: dollars(10_000) },
            startingBalance: dollars(15_000),
        });
        expect(text).toContain('$10,000');
        expect(text).toContain('$20,000');
        expect(text).not.toContain('always');
    });

    it('states the Lucid transition credit with the gross and net amounts, the buffer and the profit above it', () => {
        const model = liveTransitionPreviewCardOf(LUCID_CREDIT);
        expect(model.kind).toBe(LiveTransitionPreviewCardKind.Credit);
        expect(model.headline).toContain('$7,110');
        const text = textOf(LUCID_CREDIT);
        expect(text).toContain('$7,900');
        expect(text).toContain('$52,100');
        expect(text.toLowerCase()).toContain('already earned');
        expect(text.toLowerCase()).not.toContain('capped');
    });

    it('says when the credit is capped by the flat transition cap shared across accounts', () => {
        const text = textOf({
            ...LUCID_CREDIT,
            creditGross: dollars(15_000),
            creditNet: dollars(13_500),
            isCapped: true,
            simProfitAboveBuffer: dollars(27_900),
        });
        expect(text).toContain('$15,000');
        expect(text.toLowerCase()).toContain('capped');
        expect(text.toLowerCase()).toContain('together');
    });

    it('says why a plan is not modeled for every reason, never a blank or an em dash', () => {
        const reasons = [
            ...Object.values(LiveNotModeledReason),
            ...Object.values(LiveTransitionPreviewGap),
        ];
        const texts = new Set<string>();
        for (const reason of reasons) {
            const model = liveTransitionPreviewCardOf({
                kind: LiveTransitionPreviewKind.NotModeled,
                reason,
            });
            expect(model.kind).toBe(LiveTransitionPreviewCardKind.NotModeled);
            expect(model.headline.length).toBeGreaterThan(10);
            expect(model.headline).not.toContain('—');
            expect(model.headline).not.toContain('undefined');
            texts.add(model.headline);
        }
        expect(texts.size).toBe(reasons.length);
    });

    it('labels a firm-level approximation', () => {
        const text = textOf({ ...TOPSTEP_INERT, approximation: null });
        expect(text.toLowerCase()).toContain('approximation');
    });
});
