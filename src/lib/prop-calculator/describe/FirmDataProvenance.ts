import { FirmId } from '~/lib/prop-calculator/core';

export interface FirmDataProvenanceEntry {
    readonly openItems: readonly string[];
    readonly source: string;
    readonly verifiedOn: string;
}

const FIRM_DATA_PROVENANCE: Readonly<Record<FirmId, FirmDataProvenanceEntry>> =
    {
        [FirmId.AlphaFutures]: {
            openItems: [
                'U30: the live Scaling Daily Loss Limit (30% of account) has no stated base, trigger or breach consequence, so it is not modeled and every Alpha live figure ignores it (audit question U30; .claude/prop-firms/alphafutures/live.md)',
                'U31: the Advanced Qualified maximum loss limit is $2,000 at 50K in the signed Terms but $1,750 on the product card and in help article 11634907; the model uses $2,000 (audit question U31; .claude/prop-firms/alphafutures/advanced.md)',
            ],
            source: '.claude/prop-firms/alphafutures/README.md',
            verifiedOn: '2026-09-26',
        },
        [FirmId.Apex]: {
            openItems: [
                'Every apextraderfunding.com page, the help center and the legal pages (Terms and Conditions, User Agreement, Privacy, Refund) answer HTTP 403, so the modeled $50K EOD and Intraday evaluation, re-buy and activation prices rest on the 2026-09-23 user paste and cannot be re-read (.claude/prop-firms/REMAINING.md section 5; .claude/prop-firms/apex/README.md)',
            ],
            source: '.claude/prop-firms/apex/README.md',
            verifiedOn: '2026-09-23',
        },
        [FirmId.E8Futures]: {
            openItems: [
                'N-40: whether an unlocked Zero Performance scaling tier survives a losing day is unconfirmed; the E8 help center returns HTTP 403 to a direct fetch (audit tracker N-40)',
                'The model sets the E8 reset fee equal to the eval fee, which no source states; the Account reset article (11640147) answers HTTP 403, so the modeled reset fee has no source until it is pasted (.claude/prop-firms/REMAINING.md section 5; .claude/prop-firms/e8futures/signature.md)',
            ],
            source: '.claude/prop-firms/e8futures/README.md',
            verifiedOn: '2026-09-19',
        },
        [FirmId.FtmoFutures]: {
            openItems: [
                'The FTMO configurator is behind a login wall, so the modeled Reset Fee ($109 Growth, $129 Pro at 50K) rests on the Comparison Table and the rules page, not a checkout (.claude/prop-firms/REMAINING.md section 5; .claude/prop-firms/ftmo-futures/README.md)',
                'The FTMO Futures Sim-Funded Account Terms and Conditions are not public, so every modeled Sim-Funded and Live rule rests on the rules page, the FAQ and the Evaluation terms, not the contract (.claude/prop-firms/ftmo-futures/README.md)',
            ],
            source: '.claude/prop-firms/ftmo-futures/README.md',
            verifiedOn: '2026-10-02',
        },
        [FirmId.FundedNext]: {
            openItems: [
                'U29: the FNL:003 5-day wait before the first reward is the conservative reading of the Labs card the tool uses, and no help article lists a wait (audit question U29; .claude/prop-firms/fundednext/fnl003-instant.md)',
                'U15: the FundedNext Flex and Rapid reset fee basis is unconfirmed until a dashboard reset checkout is pasted, so the modeled Flex reset of $77.99 may be too low (audit question U15; .claude/prop-firms/fundednext/flex.md)',
            ],
            source: '.claude/prop-firms/fundednext/README.md',
            verifiedOn: '2026-10-02',
        },
        [FirmId.Lucid]: {
            openItems: [
                'The Lucid Trader Agreement page returns an empty client-rendered body and remains unread, so the modeled payout, split and live rules rest on help-center articles, not the agreement (.claude/prop-firms/lucid/README.md, Documentation Scope)',
                'lucidtrading.com answers HTTP 403, so the modeled reset prices and DLL-ON promo rest on a saved homepage export and cannot be re-read (.claude/prop-firms/REMAINING.md section 5; .claude/prop-firms/lucid/README.md)',
            ],
            source: '.claude/prop-firms/lucid/README.md',
            verifiedOn: '2026-09-24',
        },
        [FirmId.Mffu]: {
            openItems: [
                'The MFF Simulated Trader Agreement and its Appendices have never been read, so every modeled Sim Funded and Live rule rests on help-center articles and plan pages, not the binding contract (.claude/prop-firms/REMAINING.md section 5; .claude/prop-firms/mffu/README.md)',
            ],
            source: '.claude/prop-firms/mffu/README.md',
            verifiedOn: '2026-10-02',
        },
        [FirmId.TopStep]: {
            openItems: [
                'N-53: the Responsible Trading Discount amount on an Express Funded Account activation with a DLL is not published, so the modeled $149 activation may be overstated (audit tracker N-53; .claude/prop-firms/topstep/standard.md, Not Confirmed)',
                'U32: Combine 55% consistency at exactly 55% is read as a pass, against help article 8284208 at or below 55% and 8284197 below 55% (audit question U32; .claude/prop-firms/topstep/consistency.md)',
                'U33: the Pro Account payout cap says up to 50% of the account and up to $5,000, and no page gives the base of the 50%, so only the dollar cap is modeled (audit question U33; .claude/prop-firms/topstep/pro-account.md)',
            ],
            source: '.claude/prop-firms/topstep/README.md',
            verifiedOn: '2026-10-02',
        },
        [FirmId.Tpt]: {
            openItems: [
                'takeprofittrader.com/pricing answers HTTP 403, so the modeled $170 monthly Test price at 50K is derived from promo FAQs, not a price page (.claude/prop-firms/REMAINING.md section 5; .claude/prop-firms/tpt/README.md)',
            ],
            source: '.claude/prop-firms/tpt/README.md',
            verifiedOn: '2026-09-20',
        },
        [FirmId.Tradeify]: {
            openItems: [
                'U12: the Tradeify Select reset fee is unconfirmed at a real cart; the homepage and pricing reference say $109 at 50K while /select-plan says $99, and the model uses $109 (audit question U12; .claude/prop-firms/tradeify/select-daily.md)',
                'U27: the Tradeify Lightning payout basis is unresolved; the payout policy article says no minimum trading day count while the homepage says Payout Frequency 5 Days, and the model keeps 0 minimum days (audit question U27; .claude/prop-firms/tradeify/lightning.md)',
                'The Tradeify Lightning consistency ladder (20/25/30% by payout) is stated by the payout policy article and the homepage tooltip, but the Essential Trading Rules Overview states a single 20% limit, so the modeled ladder may be wrong for Lightning payouts (.claude/prop-firms/tradeify/lightning.md, Not Confirmed)',
            ],
            source: '.claude/prop-firms/tradeify/README.md',
            verifiedOn: '2026-09-26',
        },
    };

export function firmDataProvenance(firmId: FirmId): FirmDataProvenanceEntry {
    return FIRM_DATA_PROVENANCE[firmId];
}
