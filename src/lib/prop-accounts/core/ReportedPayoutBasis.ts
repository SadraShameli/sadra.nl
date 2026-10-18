export enum ReportedPayoutBasis {
    Gross = 'gross',
    Net = 'net',
}

const REPORTED_PAYOUT_BASIS_LABEL: Readonly<
    Record<ReportedPayoutBasis, string>
> = {
    [ReportedPayoutBasis.Gross]: 'Gross, before the profit split',
    [ReportedPayoutBasis.Net]: 'Net, what you received',
};

export function reportedPayoutBasisLabel(value: ReportedPayoutBasis): string {
    return REPORTED_PAYOUT_BASIS_LABEL[value];
}
