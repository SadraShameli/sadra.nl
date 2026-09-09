export enum FirmId {
    AlphaFutures = 'alphafutures',
    Apex = 'apex',
    FundedNext = 'fundednext',
    Lucid = 'lucid',
    Mffu = 'mffu',
    TopStep = 'topstep',
    Tpt = 'tpt',
    Tradeify = 'tradeify',
}

const FIRM_IDS = new Map<string, FirmId>(
    Object.values(FirmId).map((id) => [id, id]),
);

export function parseFirmId(value: string): FirmId | undefined {
    return FIRM_IDS.get(value);
}
