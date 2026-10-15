import {
    type DpStateValues,
    DpStateValuesKind,
    type DpTradeValueCents,
    type DpValueCents,
} from '~/lib/prop-calculator/advisor/dp';
import {
    type DpValueSample,
    DpValueStateKind,
} from '~/lib/schemas/propAccountOutputs';

export function dpValueSamplesOf(values: DpStateValues): DpValueSample[] {
    if (values.state.kind !== DpStateValuesKind.Read) return [];
    const { candidates, documentedRung, value } = values.state.report;
    const current = sampleOf(DpValueStateKind.Current, null, value);
    if (current === null) return [];
    const rung =
        documentedRung === null
            ? []
            : [
                  sampleOf(
                      DpValueStateKind.AfterWin,
                      documentedRung.riskCents,
                      documentedRung.afterWin,
                  ),
                  sampleOf(
                      DpValueStateKind.AfterLoss,
                      documentedRung.riskCents,
                      documentedRung.afterLoss,
                  ),
              ];
    return [
        current,
        ...rung,
        ...candidates.map((candidate) => candidateSampleOf(candidate)),
    ].filter((sample) => sample !== null);
}

function candidateSampleOf(candidate: DpTradeValueCents): DpValueSample | null {
    return sampleOf(
        DpValueStateKind.Candidate,
        candidate.riskCents,
        candidate.expected,
    );
}

function sampleOf(
    kind: DpValueStateKind,
    riskCents: null | number,
    value: DpValueCents,
): DpValueSample | null {
    return value.rateZeroCashCents === null
        ? null
        : {
              kind,
              rateAdjustedValueCents: value.rateAdjustedCents,
              riskCents,
              valueCents: value.rateZeroCashCents,
          };
}
