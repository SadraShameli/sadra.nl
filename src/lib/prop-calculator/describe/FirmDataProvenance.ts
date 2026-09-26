import { FirmId } from '../core';

export interface FirmDataProvenanceEntry {
    readonly openItems: readonly string[];
    readonly source: string;
    readonly verifiedOn: string;
}

const FIRM_DATA_PROVENANCE: Readonly<Record<FirmId, FirmDataProvenanceEntry>> =
    {
        [FirmId.AlphaFutures]: {
            openItems: [],
            source: '.claude/prop-firms/alphafutures/README.md',
            verifiedOn: '2026-09-26',
        },
        [FirmId.Apex]: {
            openItems: [],
            source: '.claude/prop-firms/apex/README.md',
            verifiedOn: '2026-09-23',
        },
        [FirmId.E8Futures]: {
            openItems: [
                'N-40: whether an unlocked Zero Performance scaling tier survives a losing day is unconfirmed; the E8 help center returns HTTP 403 to a direct fetch (audit tracker N-40)',
            ],
            source: '.claude/prop-firms/e8futures/README.md',
            verifiedOn: '2026-09-23',
        },
        [FirmId.FtmoFutures]: {
            openItems: [
                'Not yet through the tree-wide bulk adversarial-verifier or line-by-line audit pass (.claude/prop-firms/REMAINING.md)',
            ],
            source: '.claude/prop-firms/ftmo-futures/README.md',
            verifiedOn: '2026-09-21',
        },
        [FirmId.FundedNext]: {
            openItems: [],
            source: '.claude/prop-firms/fundednext/README.md',
            verifiedOn: '2026-09-26',
        },
        [FirmId.Lucid]: {
            openItems: [
                'The Lucid Trader Agreement page returns an empty client-rendered body and remains unread (.claude/prop-firms/lucid/README.md, Documentation Scope)',
            ],
            source: '.claude/prop-firms/lucid/README.md',
            verifiedOn: '2026-09-26',
        },
        [FirmId.Mffu]: {
            openItems: [],
            source: '.claude/prop-firms/mffu/README.md',
            verifiedOn: '2026-09-26',
        },
        [FirmId.TopStep]: {
            openItems: [
                'N-53: the Responsible Trading Discount amount on an Express Funded Account activation with a DLL is not published (audit tracker N-53; topstep/standard.md Not Confirmed)',
            ],
            source: '.claude/prop-firms/topstep/README.md',
            verifiedOn: '2026-09-19',
        },
        [FirmId.Tpt]: {
            openItems: [],
            source: '.claude/prop-firms/tpt/README.md',
            verifiedOn: '2026-09-20',
        },
        [FirmId.Tradeify]: {
            openItems: [],
            source: '.claude/prop-firms/tradeify/README.md',
            verifiedOn: '2026-09-26',
        },
    };

export function firmDataProvenance(firmId: FirmId): FirmDataProvenanceEntry {
    return FIRM_DATA_PROVENANCE[firmId];
}
