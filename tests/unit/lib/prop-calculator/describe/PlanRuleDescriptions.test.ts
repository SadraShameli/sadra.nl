import { describe, expect, it } from 'vitest';

import { formatCurrency } from '~/lib/format';
import {
    ALL_FIRMS,
    AlphaFuturesVariant,
    ApexVariant,
    dollars,
    FirmId,
    LifetimeCapScope,
    MffuVariant,
    type Plan,
    type PlanId,
    RetryKind,
    TradeifyVariant,
} from '~/lib/prop-calculator';
import {
    describePlanRules,
    formatPlanRuleLine,
    PLAN_RULE_SEGMENT_LABEL,
    planConsistencyLabels,
    type PlanRuleSegment,
    PlanRuleSegmentKind,
} from '~/lib/prop-calculator/describe';
import { findFirm } from '~/lib/prop-calculator/firms';

const CLOSED_SLOT = 'account closed; the next purchase refills the slot';

const NO_FUNDED_RESET = `no funded reset modeled: ${CLOSED_SLOT}`;

const NO_LIFETIME_LIMIT = 'no lifetime payout limit modeled';

const PINNED_RULE_LINES: Readonly<Record<string, readonly string[]>> = {
    'alphafutures/advanced': [
        'target $4,000 | eval drawdown $1,750 eod-trailing, locks at +$1,750 to breakeven | min days 3',
        'funded drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven',
        'eval DLL none | funded DLL none | consistency eval 40% | funded none',
        'contracts 5 mini / 50 micro | funded 5 mini / 50 micro',
        'fees eval $0 | activation $0 | monthly $209 | reset $189',
        'payout split 70% (payouts 1-2), 80% (payouts 3-4), 90% (payout 5+) | first $0 | min request $1,000 | day gate 5 qualifying days | winning day >= $200',
        'payout cap 50% of total profit, max $15,000 per request',
    ],
    'alphafutures/standard': [
        'target $3,000 | drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven | min days 2',
        'eval DLL none | funded DLL $1000 | consistency eval 50% | funded 40% (inclusive, fails on a net-losing cycle)',
        'contracts 5 mini / 50 micro | funded up to 5 mini (tiered) / up to 50 micro (tiered)',
        'fees eval $0 | activation $0 | monthly $129 | reset $109',
        'payout split 70% (payouts 1-2), 80% (payouts 3-4), 90% (payout 5+) | first $0 | min request $500 | day gate 5 qualifying days | winning day >= $200',
        'payout cap 50% of total profit, max $3,000 per request',
    ],
    'alphafutures/zero': [
        'target $3,000 | drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven | min days 1',
        'eval DLL $1000 | funded DLL $1000 | consistency eval none | funded 40% (inclusive, fails on a net-losing cycle)',
        'contracts 3 mini / 30 micro | funded up to 3 mini (tiered) / up to 30 micro (tiered)',
        'fees eval $0 | activation $0 | monthly $139 | reset $119',
        'payout split 70% (payouts 1-2), 80% (payouts 3-4), 90% (payout 5+) | first $0 | min request $200 | day gate 5 qualifying days | winning day >= $200',
        'payout cap 50% of total profit, max $1,500 per request',
    ],
    'apex/eod': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$5,000 to +$3,000 | min days 0',
        'funded drawdown $2,000 eod-trailing, locks at +$2,100 to +$100',
        'eval DLL $1000 | funded DLL $1000-$3000 | consistency eval none | funded 50%',
        'contracts 6 mini / 60 micro | funded up to 4 mini (tiered) / up to 40 micro (tiered)',
        'fees eval $590 | activation $90 | monthly $0 | reset $590',
        'payout split 100% | first $2,600 | min request $500 | day gate 5 qualifying days | winning day >= $250',
        'payout buffer: EOD balance must clear $52,100',
        'payout ladder [1500, 1500, 2000, 2500, 2500, 3000] min request $500',
    ],
    'apex/intraday': [
        'target $3,000 | eval drawdown $2,000 intraday-trailing, locks at +$5,000 to +$3,000 | min days 0',
        'funded drawdown $2,000 intraday-trailing, locks at +$2,100 to +$100',
        'eval DLL none | funded DLL $1000-$3000 | consistency eval none | funded 50%',
        'contracts 6 mini / 60 micro | funded up to 4 mini (tiered) / up to 40 micro (tiered)',
        'fees eval $249 | activation $59 | monthly $0 | reset $249',
        'payout split 100% | first $2,600 | min request $500 | day gate 5 qualifying days | winning day >= $200',
        'payout buffer: EOD balance must clear $52,100',
        'payout ladder [1500, 2000, 2500, 2500, 3000, 3000] min request $500',
    ],
    'e8futures/signature': [
        'target $3,000 | drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven | min days 0',
        'eval DLL none | funded DLL $1000 | consistency eval none | funded 35%',
        'contracts 4 mini / 40 micro | funded 4 mini / 40 micro',
        'fees eval $160 | activation $0 | monthly $0 | reset $160',
        'payout split 80% | first $2,000 | min request $125 | day gate 0 qualifying days, then 5 per payout cycle | winning day >= $150',
        'payout buffer: EOD balance must clear $52,000',
        'payout cap by payout: #1+ max $1,250 per request | #3+ max $2,250 per request | #5+ max $3,250 per request',
    ],
    'e8futures/zero-max-80': [
        'target $3,000 | eval drawdown $1,500 eod-trailing, no lock | min days 0',
        'funded drawdown $1,500 eod-trailing, locks at +$1,500 to breakeven or on 1st payout',
        'eval DLL none | funded DLL none | consistency eval 40% | funded none',
        'contracts 4 mini / 40 micro | funded up to 5 mini (tiered) / up to 50 micro (tiered)',
        'fees eval $328 | activation $0 | monthly $0 | reset $328',
        'payout split 80% | first $100 | per cycle $100 | min request $100 | day gate 0 qualifying days | any day counts',
        'payout cap max $3,000 per request',
    ],
    'e8futures/zero-max-100': [
        'target $3,000 | eval drawdown $1,500 eod-trailing, no lock | min days 0',
        'funded drawdown $1,500 eod-trailing, locks at +$1,500 to breakeven or on 1st payout',
        'eval DLL none | funded DLL none | consistency eval 40% | funded none',
        'contracts 4 mini / 40 micro | funded up to 5 mini (tiered) / up to 50 micro (tiered)',
        'fees eval $428 | activation $0 | monthly $0 | reset $428',
        'payout split 100% | first $100 | per cycle $100 | min request $100 | day gate 0 qualifying days | any day counts',
        'payout cap max $3,000 per request',
    ],
    'e8futures/zero-starter-80': [
        'target $3,000 | eval drawdown $1,500 eod-trailing, no lock | min days 0',
        'funded drawdown $1,500 eod-trailing, locks at +$1,500 to breakeven or on 1st payout',
        'eval DLL none | funded DLL none | consistency eval 40% | funded none',
        'contracts 4 mini / 40 micro | funded up to 5 mini (tiered) / up to 50 micro (tiered)',
        'fees eval $178 | activation $0 | monthly $0 | reset $178',
        'payout split 80% | first $100 | per cycle $100 | min request $100 | day gate 0 qualifying days | any day counts',
        'payout cap max $1,000 per request',
    ],
    'e8futures/zero-starter-100': [
        'target $3,000 | eval drawdown $1,500 eod-trailing, no lock | min days 0',
        'funded drawdown $1,500 eod-trailing, locks at +$1,500 to breakeven or on 1st payout',
        'eval DLL none | funded DLL none | consistency eval 40% | funded none',
        'contracts 4 mini / 40 micro | funded up to 5 mini (tiered) / up to 50 micro (tiered)',
        'fees eval $228 | activation $0 | monthly $0 | reset $228',
        'payout split 100% | first $100 | per cycle $100 | min request $100 | day gate 0 qualifying days | any day counts',
        'payout cap max $1,000 per request',
    ],
    'ftmo-futures/growth': [
        'target $3,000 | drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven | min days 0',
        'eval DLL none | funded DLL $1000 | consistency eval 40% | funded none',
        'contracts 5 mini / 50 micro | funded up to 5 mini (tiered) / up to 50 micro (tiered)',
        'fees eval $0 | activation $0 | monthly $119 | reset $109',
        'payout split 90% | first $0 | min request $20 | day gate 4 qualifying days | winning day >= $150',
        'payout cap 50% of total profit, max $2,500 per request',
        'per-request cap 200% of cycle profit',
    ],
    'ftmo-futures/pro': [
        'target $3,000 | drawdown $3,000 eod-trailing, locks at +$3,000 to breakeven | min days 0',
        'eval DLL $1000 (hard) | funded DLL $1000 (hard) | consistency eval 50% | funded none',
        'contracts 5 mini / 50 micro | funded up to 5 mini (tiered) / up to 50 micro (tiered)',
        'fees eval $0 | activation $0 | monthly $139 | reset $129',
        'payout split 90% | first $0 | min request $20 | day gate 5 qualifying days | winning day >= $200',
        'payout cap 100% of total profit, max $5,000 per request',
        'per-request cap 200% of cycle profit',
    ],
    'fundednext/flex': [
        'target $2,500 | eval drawdown $1,500 eod-trailing, locks at +$1,600 to +$100 | min days 0',
        'funded drawdown $1,500 eod-trailing, locks at +$1,600 to +$100 or on 1st payout',
        'eval DLL none | funded DLL none | consistency eval 40% | funded none',
        'contracts 3 mini / 30 micro | funded 3 mini / 30 micro',
        'fees eval $134 | activation $0 | monthly $0 | reset $78',
        'payout split 95% | first $500 | per cycle $500 | min request $250 | day gate 5 qualifying days | winning day >= $200',
        'payout cap 50% of total profit, max $1,500 per request',
    ],
    'fundednext/fnl-003': [
        'instant-funded, no evaluation phase | drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 | min days 0 (unused)',
        'eval DLL n/a | funded DLL none | consistency eval n/a | funded 20%',
        'contracts n/a | funded 3 mini / 30 micro',
        'fees eval $150 | activation $0 | monthly $0 | reset $0',
        'payout split 90% | first $2,900 | per cycle $800 | min request $800 | day gate 0 qualifying days | any day counts',
        'payout buffer: EOD balance must clear $52,100',
        'payout cap max $1,200 per request',
    ],
    'fundednext/legacy': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven | min days 0',
        'funded drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven or on 1st payout',
        'eval DLL none | funded DLL none | consistency eval 40% | funded none',
        'contracts 3 mini / 30 micro | funded 5 mini / 50 micro',
        'fees eval $200 | activation $0 | monthly $0 | reset $184',
        'payout split 80% | first $0 | per cycle $500 | min request $250 | day gate 5 qualifying days | winning day >= $200',
        'payout cap by qualifying days: day 0+ 50% of total profit, max $6,000 per request | day 30+ uncapped',
    ],
    'fundednext/rapid-daily': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 | min days 0',
        'funded drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 or on 1st payout',
        'eval DLL $1000 | funded DLL $1000 | consistency eval none | funded none',
        'contracts 4 mini / 40 micro | funded 4 mini / 40 micro',
        'fees eval $300 | activation $0 | monthly $0 | reset $190',
        'payout split 90% | first $2,600 | per cycle $500 | min request $250 | day gate 0 qualifying days | any day counts',
        'payout buffer: EOD balance must clear $52,100',
        'payout cap max $1,200 per request',
    ],
    'fundednext/rapid-pro': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 | min days 0',
        'funded drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 or on 1st payout',
        'eval DLL none | funded DLL none | consistency eval none | funded 40%',
        'contracts 4 mini / 40 micro | funded 4 mini / 40 micro',
        'fees eval $300 | activation $0 | monthly $0 | reset $175',
        'payout split 90% | first $500 | per cycle $500 | min request $250 | day gate 3 qualifying days | any day counts',
        'payout cap max $1,200 per request',
    ],
    'fundednext/rapid-pro-dll-add-on': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 | min days 0',
        'funded drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 or on 1st payout',
        'eval DLL $1000 | funded DLL $1000 | consistency eval none | funded 40%',
        'contracts 4 mini / 40 micro | funded 4 mini / 40 micro',
        'fees eval $260 | activation $0 | monthly $0 | reset $135',
        'payout split 90% | first $500 | per cycle $500 | min request $250 | day gate 3 qualifying days | any day counts',
        'payout cap max $1,200 per request',
    ],
    'lucid/daily-eod': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 | min days 0',
        'funded drawdown $2,000 intraday-trailing, locks at +$2,100 to +$100',
        'eval DLL none | funded DLL none | consistency eval 50% | funded none',
        'contracts 4 mini / 40 micro | funded 4 mini / 40 micro',
        'fees eval $185 | activation $0 | monthly $0 | reset $135',
        'payout split 90% | first $0 | per cycle $0.01 | min request $500 | day gate 0 qualifying days | any day counts',
        'payout buffer: EOD balance must clear $52,100',
    ],
    'lucid/daily-eod-dll': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 | min days 0',
        'funded drawdown $2,000 intraday-trailing, locks at +$2,100 to +$100',
        'eval DLL $1200 | funded DLL $1200 | consistency eval 50% | funded none',
        'contracts 4 mini / 40 micro | funded 4 mini / 40 micro',
        'fees eval $160 | activation $0 | monthly $0 | reset $110',
        'payout split 90% | first $0 | per cycle $0.01 | min request $500 | day gate 0 qualifying days | any day counts',
        'payout buffer: EOD balance must clear $52,100',
    ],
    'lucid/daily-intraday': [
        'target $3,000 | drawdown $2,000 intraday-trailing, locks at +$2,100 to +$100 | min days 0',
        'eval DLL none | funded DLL none | consistency eval 50% | funded none',
        'contracts 4 mini / 40 micro | funded 4 mini / 40 micro',
        'fees eval $156 | activation $0 | monthly $0 | reset $115',
        'payout split 90% | first $0 | per cycle $0.01 | min request $500 | day gate 0 qualifying days | any day counts',
        'payout buffer: EOD balance must clear $52,100',
    ],
    'lucid/daily-intraday-dll': [
        'target $3,000 | drawdown $2,000 intraday-trailing, locks at +$2,100 to +$100 | min days 0',
        'eval DLL $1200 | funded DLL $1200 | consistency eval 50% | funded none',
        'contracts 4 mini / 40 micro | funded 4 mini / 40 micro',
        'fees eval $131 | activation $0 | monthly $0 | reset $90',
        'payout split 90% | first $0 | per cycle $0.01 | min request $500 | day gate 0 qualifying days | any day counts',
        'payout buffer: EOD balance must clear $52,100',
    ],
    'lucid/direct': [
        'instant-funded, no evaluation phase | drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 | min days 0 (unused)',
        'eval DLL n/a | funded DLL $1200 -> 60% peak | consistency eval n/a | funded 20%',
        'contracts n/a | funded 4 mini / 40 micro',
        'fees eval $515 | activation $0 | monthly $0 | reset $515',
        'payout split 90% | first $3,000 | per cycle $2,500 | min request $500 | day gate 0 qualifying days | any day counts',
        'payout ladder [2000, 2000, 2000, 2500, 2500] min request $500',
    ],
    'lucid/flex': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 | min days 0',
        'funded drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 or on 1st payout',
        'eval DLL none | funded DLL none | consistency eval 50% | funded none',
        'contracts 4 mini / 40 micro | funded up to 4 mini (tiered) / up to 40 micro (tiered)',
        'fees eval $146 | activation $0 | monthly $0 | reset $105',
        'payout split 90% | first $0 | per cycle $0.01 | min request $500 | day gate 5 qualifying days | winning day >= $150',
        'payout cap max $2,000 per request',
        'per-request cap 50% of cycle profit',
    ],
    'lucid/flex-dll': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 | min days 0',
        'funded drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 or on 1st payout',
        'eval DLL $1200 | funded DLL $1200 | consistency eval 50% | funded none',
        'contracts 4 mini / 40 micro | funded up to 4 mini (tiered) / up to 40 micro (tiered)',
        'fees eval $131 | activation $0 | monthly $0 | reset $90',
        'payout split 90% | first $0 | per cycle $0.01 | min request $500 | day gate 5 qualifying days | winning day >= $150',
        'payout cap max $2,000 per request',
        'per-request cap 50% of cycle profit',
    ],
    'lucid/maxx': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, no lock | min days 5',
        'funded drawdown $2,000 eod-trailing, locks at +$2,000 to +$100 or on 1st payout',
        'eval DLL none | funded DLL none | consistency eval 40% | funded none',
        'contracts not recorded | funded unpublished',
        'fees eval $180 | activation $0 | monthly $0 | reset $180',
        'payout split 90% | first $0 | min request $0 | day gate 0 qualifying days | any day counts',
    ],
    'lucid/pro': [
        'target $3,000 | drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 | min days 1',
        'eval DLL $1200 | funded DLL $1200 -> 60% peak | consistency eval none | funded 40%',
        'contracts 4 mini / 40 micro | funded 4 mini / 40 micro',
        'fees eval $167 | activation $0 | monthly $0 | reset $115',
        'payout split 90% | first $500 | per cycle $500 | min request $500 | day gate 0 qualifying days | any day counts',
        'payout buffer: EOD balance must clear $52,100',
        'payout ladder [2000, 2500] min request $500',
    ],
    'lucid/pro-no-dll': [
        'target $3,000 | drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 | min days 1',
        'eval DLL none | funded DLL none | consistency eval none | funded 40%',
        'contracts 4 mini / 40 micro | funded 4 mini / 40 micro',
        'fees eval $192 | activation $0 | monthly $0 | reset $140',
        'payout split 90% | first $500 | per cycle $500 | min request $500 | day gate 0 qualifying days | any day counts',
        'payout buffer: EOD balance must clear $52,100',
        'payout ladder [2000, 2500] min request $500',
    ],
    'mffu/builder': [
        'target $3,000 | drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 | min days 1',
        'eval DLL $1000 | funded DLL $1000 | consistency eval none | funded 50%',
        'contracts 4 mini / 40 micro | funded 4 mini / 40 micro',
        'fees eval $153 | activation $0 | monthly $0 | reset $153',
        'payout split 80% | first $2,600 | per cycle $500 | min request $500 | day gate 2 qualifying days | any day counts',
        'payout ladder [2000, 2000, 2000, 2000, 2000] min request $500',
    ],
    'mffu/pro': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 | min days 2',
        'funded drawdown $2,000 eod-trailing, locks on first payout to +$100',
        'eval DLL none | funded DLL none | consistency eval 50% | funded none',
        'contracts 3 mini / 30 micro | funded 5 mini / 5 micro',
        'fees eval $265 | activation $0 | monthly $0 | reset $265',
        'payout split 80% | first $2,100 | min request $1,000 | day gate 14 calendar days from first trade, restarting at each payout',
    ],
    'mffu/rapid': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 | min days 2',
        'funded drawdown $2,000 intraday-trailing, locks at +$2,100 to +$100',
        'eval DLL none | funded DLL none | consistency eval 50% | funded none',
        'contracts 5 mini / 50 micro | funded 5 mini / 50 micro',
        'fees eval $209 | activation $0 | monthly $0 | reset $209',
        'payout split 90% | first $2,100 | min request $500 | day gate 1 qualifying days | any day counts',
    ],
    'mffu/rapid-eod': [
        'target $3,000 | drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 | min days 4',
        'eval DLL none | funded DLL none | consistency eval 30% | funded none',
        'contracts 3 mini / 30 micro | funded 3 mini / 30 micro',
        'fees eval $209 | activation $0 | monthly $0 | reset $209',
        'payout split 90% | first $2,100 | per cycle $500 | min request $500 | day gate 1 qualifying days | any day counts',
    ],
    'topstep/no-fee-consistency': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven | min days 2',
        'funded drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven, floor reset to breakeven on each payout',
        'eval DLL none | funded DLL none | consistency eval 55% | funded 40%',
        'contracts 5 mini / 50 micro | funded up to 5 mini (tiered) / up to 50 micro (tiered)',
        'fees eval $0 | activation $0 | monthly $95 | reset $95',
        'payout split 90% | first $0 | per cycle $0.01 | min request $125 | day gate 3 qualifying days | any day counts',
        'payout cap 50% of total profit, max $3,000 per request',
    ],
    'topstep/no-fee-consistency-dll': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven | min days 2',
        'funded drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven, floor reset to breakeven on each payout',
        'eval DLL $1000 | funded DLL $1000 | consistency eval 55% | funded 40%',
        'contracts 5 mini / 50 micro | funded up to 5 mini (tiered) / up to 50 micro (tiered)',
        'fees eval $0 | activation $0 | monthly $85 | reset $95',
        'payout split 90% | first $0 | per cycle $0.01 | min request $125 | day gate 3 qualifying days | any day counts',
        'payout cap 50% of total profit, max $6,000 per request',
    ],
    'topstep/no-fee-standard': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven | min days 2',
        'funded drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven, floor reset to breakeven on each payout',
        'eval DLL none | funded DLL none | consistency eval 55% | funded none',
        'contracts 5 mini / 50 micro | funded up to 5 mini (tiered) / up to 50 micro (tiered)',
        'fees eval $0 | activation $0 | monthly $95 | reset $95',
        'payout split 90% | first $0 | per cycle $0.01 | min request $125 | day gate 5 qualifying days | winning day >= $150',
        'payout cap 50% of total profit, max $2,000 per request',
    ],
    'topstep/no-fee-standard-dll': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven | min days 2',
        'funded drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven, floor reset to breakeven on each payout',
        'eval DLL $1000 | funded DLL $1000 | consistency eval 55% | funded none',
        'contracts 5 mini / 50 micro | funded up to 5 mini (tiered) / up to 50 micro (tiered)',
        'fees eval $0 | activation $0 | monthly $85 | reset $95',
        'payout split 90% | first $0 | per cycle $0.01 | min request $125 | day gate 5 qualifying days | winning day >= $150',
        'payout cap 50% of total profit, max $4,000 per request',
    ],
    'topstep/pro-account': [
        'instant-funded, no evaluation phase | drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven | min days 0 (unused)',
        'eval DLL n/a | funded DLL $1000 | consistency eval n/a | funded none',
        'contracts n/a | funded up to 5 mini (tiered) / up to 50 micro (tiered)',
        'fees eval $0 | activation $0 | monthly $0 | reset $0',
        'payout split 90% | first $0 | per cycle $0.01 | min request $0 | day gate 5 qualifying days | winning day >= $150',
        'payout cap max $2,000 per request',
    ],
    'topstep/standard-consistency': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven | min days 2',
        'funded drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven, floor reset to breakeven on each payout',
        'eval DLL none | funded DLL none | consistency eval 55% | funded 40%',
        'contracts 5 mini / 50 micro | funded up to 5 mini (tiered) / up to 50 micro (tiered)',
        'fees eval $0 | activation $149 | monthly $49 | reset $49',
        'payout split 90% | first $0 | per cycle $0.01 | min request $125 | day gate 3 qualifying days | any day counts',
        'payout cap 50% of total profit, max $3,000 per request',
    ],
    'topstep/standard-consistency-dll': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven | min days 2',
        'funded drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven, floor reset to breakeven on each payout',
        'eval DLL $1000 | funded DLL $1000 | consistency eval 55% | funded 40%',
        'contracts 5 mini / 50 micro | funded up to 5 mini (tiered) / up to 50 micro (tiered)',
        'fees eval $0 | activation $149 | monthly $49 | reset $49',
        'payout split 90% | first $0 | per cycle $0.01 | min request $125 | day gate 3 qualifying days | any day counts',
        'payout cap 50% of total profit, max $6,000 per request',
    ],
    'topstep/standard-standard': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven | min days 2',
        'funded drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven, floor reset to breakeven on each payout',
        'eval DLL none | funded DLL none | consistency eval 55% | funded none',
        'contracts 5 mini / 50 micro | funded up to 5 mini (tiered) / up to 50 micro (tiered)',
        'fees eval $0 | activation $149 | monthly $49 | reset $49',
        'payout split 90% | first $0 | per cycle $0.01 | min request $125 | day gate 5 qualifying days | winning day >= $150',
        'payout cap 50% of total profit, max $2,000 per request',
    ],
    'topstep/standard-standard-dll': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven | min days 2',
        'funded drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven, floor reset to breakeven on each payout',
        'eval DLL $1000 | funded DLL $1000 | consistency eval 55% | funded none',
        'contracts 5 mini / 50 micro | funded up to 5 mini (tiered) / up to 50 micro (tiered)',
        'fees eval $0 | activation $149 | monthly $49 | reset $49',
        'payout split 90% | first $0 | per cycle $0.01 | min request $125 | day gate 5 qualifying days | winning day >= $150',
        'payout cap 50% of total profit, max $4,000 per request',
    ],
    'tpt/': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, locks at +$2,000 to breakeven | min days 3',
        'funded drawdown $2,000 intraday-trailing, locks at +$2,000 to breakeven',
        'eval DLL none | funded DLL none | consistency eval 50% (inclusive, raises the goal above 2x the best day on violation) | funded none',
        'contracts 6 mini / 60 micro | funded 6 mini / 60 micro',
        'fees eval $0 | activation $130 | monthly $170 | reset $99',
        'payout split 80% | first $2,000 | min request $0 | day gate 0 qualifying days | any day counts',
    ],
    'tradeify/growth': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, no lock | min days 1',
        'funded drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 or on 1st payout',
        'eval DLL $1250 | funded DLL $1250-$2000 | consistency eval none | funded 35%',
        'contracts 4 mini / 40 micro | funded 4 mini / 40 micro',
        'fees eval $145 | activation $0 | monthly $0 | reset $95',
        'payout split 90% | first $3,000 | per cycle $0.01 | min request $500 | day gate 5 qualifying days | winning day >= $150',
        'payout ladder [1500, 2000, 2500, 3000] min request $500',
    ],
    'tradeify/lightning': [
        'instant-funded, no evaluation phase | drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 or on 1st payout | min days 0 (unused)',
        'eval DLL n/a | funded DLL $1250-$2000 | consistency eval n/a | funded 20%',
        'contracts n/a | funded 4 mini / 40 micro',
        'fees eval $492 | activation $0 | monthly $0 | reset $492',
        'payout split 90% | first $3,000 | per cycle $2,000 | min request $1,000 | day gate 0 qualifying days | any day counts',
        'payout ladder [2000, 2000, 2000, 2500] min request $1,000',
    ],
    'tradeify/select-daily': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, no lock | min days 3',
        'funded drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 or on 1st payout',
        'eval DLL none | funded DLL $1000 | consistency eval 40% | funded none',
        'contracts 4 mini / 40 micro | funded up to 4 mini (tiered) / up to 40 micro (tiered)',
        'fees eval $165 | activation $0 | monthly $0 | reset $109',
        'payout split 90% | first $0 | per cycle $0.01 | min request $250 | day gate 0 qualifying days | any day counts',
        'payout buffer: EOD balance must clear $52,100',
        'payout cap max $1,250 per request',
        'per-request cap 200% of cycle profit',
    ],
    'tradeify/select-flex': [
        'target $3,000 | eval drawdown $2,000 eod-trailing, no lock | min days 3',
        'funded drawdown $2,000 eod-trailing, locks at +$2,100 to +$100 or on 1st payout',
        'eval DLL none | funded DLL none | consistency eval 40% | funded none',
        'contracts 4 mini / 40 micro | funded up to 4 mini (tiered) / up to 40 micro (tiered)',
        'fees eval $165 | activation $0 | monthly $0 | reset $109',
        'payout split 90% | first $0 | per cycle $0.01 | min request $250 | day gate 5 qualifying days | winning day >= $150',
        'payout cap 50% of total profit, max $2,500 per request',
    ],
};

const PINNED_ON_BREACH_LINES: Readonly<Record<string, string>> = {
    'alphafutures/advanced': `on breach: eval reset $189 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'alphafutures/standard': `on breach: eval reset $109 | funded Qualified Reset: $599 each, up to 2 per account, only while the account never requested a payout, within 7 calendar days of a breach; otherwise ${CLOSED_SLOT} | ${NO_LIFETIME_LIMIT}`,
    'alphafutures/zero': `on breach: eval reset $119 | funded Qualified Reset: $499 each, up to 2 per account, only while the account never requested a payout, within 7 calendar days of a breach; otherwise ${CLOSED_SLOT} | ${NO_LIFETIME_LIMIT}`,
    'apex/eod': `on breach: eval rebuy $590 | funded ${NO_FUNDED_RESET} | account concludes after 6 payouts`,
    'apex/intraday': `on breach: eval rebuy $249 | funded ${NO_FUNDED_RESET} | account concludes after 6 payouts`,
    'e8futures/signature': `on breach: eval reset $160 | funded ${NO_FUNDED_RESET} | account concludes after 5 payouts`,
    'e8futures/zero-max-80': `on breach: eval reset $328 | funded ${NO_FUNDED_RESET} | account concludes after 5 payouts`,
    'e8futures/zero-max-100': `on breach: eval reset $428 | funded ${NO_FUNDED_RESET} | account concludes after 5 payouts`,
    'e8futures/zero-starter-80': `on breach: eval reset $178 | funded ${NO_FUNDED_RESET} | account concludes after 5 payouts`,
    'e8futures/zero-starter-100': `on breach: eval reset $228 | funded ${NO_FUNDED_RESET} | account concludes after 5 payouts`,
    'ftmo-futures/growth': `on breach: eval reset $109 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'ftmo-futures/pro': `on breach: eval reset $129 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'fundednext/flex': `on breach: eval reset $78 | funded ${NO_FUNDED_RESET} | account concludes after 5 payouts`,
    'fundednext/fnl-003': `on breach: eval n/a | funded ${NO_FUNDED_RESET} | account concludes after 5 payouts`,
    'fundednext/legacy': `on breach: eval reset $184 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'fundednext/rapid-daily': `on breach: eval reset $190 | funded ${NO_FUNDED_RESET} | account concludes after 5 payouts`,
    'fundednext/rapid-pro': `on breach: eval reset $175 | funded ${NO_FUNDED_RESET} | account concludes after 5 payouts`,
    'fundednext/rapid-pro-dll-add-on': `on breach: eval reset $135 | funded ${NO_FUNDED_RESET} | account concludes after 5 payouts`,
    'lucid/daily-eod': `on breach: eval reset $135 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'lucid/daily-eod-dll': `on breach: eval reset $110 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'lucid/daily-intraday': `on breach: eval reset $115 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'lucid/daily-intraday-dll': `on breach: eval reset $90 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'lucid/direct': `on breach: eval n/a | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'lucid/flex': `on breach: eval reset $105 | funded ${NO_FUNDED_RESET} | account concludes after 5 payouts`,
    'lucid/flex-dll': `on breach: eval reset $90 | funded ${NO_FUNDED_RESET} | account concludes after 5 payouts`,
    'lucid/maxx': `on breach: eval reset $180 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'lucid/pro': `on breach: eval reset $115 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'lucid/pro-no-dll': `on breach: eval reset $140 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'mffu/builder': `on breach: eval rebuy $153 | funded ${NO_FUNDED_RESET} | account concludes after 5 payouts`,
    'mffu/pro': `on breach: eval reset $265 | funded ${NO_FUNDED_RESET} | account concludes at $100,000 in lifetime payouts (per user across all Pro accounts)`,
    'mffu/rapid': `on breach: eval rebuy $209 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'mffu/rapid-eod': `on breach: eval reset $209 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'topstep/no-fee-consistency': `on breach: eval reset $95 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'topstep/no-fee-consistency-dll': `on breach: eval rebuy $85 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'topstep/no-fee-standard': `on breach: eval reset $95 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'topstep/no-fee-standard-dll': `on breach: eval rebuy $85 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'topstep/pro-account': `on breach: eval n/a | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'topstep/standard-consistency': `on breach: eval reset $49 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'topstep/standard-consistency-dll': `on breach: eval reset $49 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'topstep/standard-standard': `on breach: eval reset $49 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'topstep/standard-standard-dll': `on breach: eval reset $49 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'tpt/': `on breach: eval reset $99 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'tradeify/growth': `on breach: eval reset $95 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'tradeify/lightning': `on breach: eval n/a | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'tradeify/select-daily': `on breach: eval reset $109 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
    'tradeify/select-flex': `on breach: eval reset $109 | funded ${NO_FUNDED_RESET} | ${NO_LIFETIME_LIMIT}`,
};

function byText(a: string, b: string): number {
    return a.localeCompare(b);
}

function planFor(planId: PlanId): Plan {
    const plan = findFirm(planId.firm)?.findPlan(planId);
    if (!plan) throw new Error(`plan not found: ${JSON.stringify(planId)}`);
    return plan;
}

function planKey(plan: Plan): string {
    return `${plan.id.firm}/${'variant' in plan.id ? plan.id.variant : ''}`;
}

function registryPlans(): Plan[] {
    return ALL_FIRMS.flatMap((firm) => [...firm.plans]);
}

function renderedLines(plan: Plan): string[] {
    return describePlanRules(plan).map((line) => formatPlanRuleLine(line));
}

function segmentOf(plan: Plan, kind: PlanRuleSegmentKind): PlanRuleSegment {
    const segment = describePlanRules(plan)
        .flat()
        .find((candidate) => candidate.kind === kind);
    if (segment === undefined) throw new Error(`no ${kind} segment`);
    return segment;
}

const apexEod = planFor({
    accountSize: 50_000,
    firm: FirmId.Apex,
    variant: ApexVariant.Eod,
});
const mffPro = planFor({
    accountSize: 50_000,
    firm: FirmId.Mffu,
    variant: MffuVariant.Pro,
});
const tpt = planFor({ accountSize: 50_000, firm: FirmId.Tpt });

describe('describePlanRules renders the pinned `prop plans` rule lines (PD-31)', () => {
    it('pins every registry plan and nothing else', () => {
        const keys = registryPlans().map(planKey).toSorted(byText);
        expect(keys).toEqual(Object.keys(PINNED_RULE_LINES).toSorted(byText));
        expect(keys).toEqual(
            Object.keys(PINNED_ON_BREACH_LINES).toSorted(byText),
        );
    });

    it.each(Object.keys(PINNED_RULE_LINES))(
        'renders %s line for line, the on-breach line last',
        (key) => {
            const plan = registryPlans().find(
                (candidate) => planKey(candidate) === key,
            );
            expect(plan).toBeDefined();
            if (plan === undefined) return;
            expect(renderedLines(plan)).toEqual([
                ...(PINNED_RULE_LINES[key] ?? []),
                PINNED_ON_BREACH_LINES[key],
            ]);
        },
    );

    it('gives each segment kind at most once per plan and a web label for every kind', () => {
        for (const plan of registryPlans()) {
            const kinds = describePlanRules(plan)
                .flat()
                .map((segment) => segment.kind);
            expect(new Set(kinds).size, planKey(plan)).toBe(kinds.length);
        }
        for (const kind of Object.values(PlanRuleSegmentKind)) {
            expect(PLAN_RULE_SEGMENT_LABEL[kind].length, kind).toBeGreaterThan(
                0,
            );
        }
    });

    it('joins a segment term and value with a space and segments with a bar', () => {
        expect(
            formatPlanRuleLine([
                {
                    kind: PlanRuleSegmentKind.ProfitTarget,
                    term: 'target',
                    value: '$3,000',
                },
                {
                    kind: PlanRuleSegmentKind.QualifyingDay,
                    term: null,
                    value: 'any day counts',
                },
            ]),
        ).toBe('target $3,000 | any day counts');
    });
});

describe('describePlanRules: on breach (F-V30)', () => {
    it('names the eval retry the engine charges, the funded outcome and the conclusion rule on Apex EOD', () => {
        expect(renderedLines(apexEod).at(-1)).toBe(
            PINNED_ON_BREACH_LINES['apex/eod'],
        );
    });

    it('prints the MFF Pro lifetime dollar cap and the TPT open-ended account', () => {
        expect(renderedLines(mffPro).at(-1)).toBe(
            PINNED_ON_BREACH_LINES['mffu/pro'],
        );
        expect(renderedLines(tpt).at(-1)).toBe(PINNED_ON_BREACH_LINES['tpt/']);
    });

    it('states the cap scope on a per-user cap (PT-12h, F-110 REV-10)', () => {
        expect(segmentOf(mffPro, PlanRuleSegmentKind.Conclusion).value).toBe(
            'account concludes at $100,000 in lifetime payouts (per user across all Pro accounts)',
        );
    });

    it('states the cap scope on a per-account cap', () => {
        const plan = mffPro.withOverrides({
            lifetimeDollarCapScope: LifetimeCapScope.PerAccount,
        });
        expect(segmentOf(plan, PlanRuleSegmentKind.Conclusion).value).toBe(
            'account concludes at $100,000 in lifetime payouts (per account)',
        );
    });

    it('states the cap scope as not stated by the firm when unconfirmed', () => {
        const plan = mffPro.withOverrides({
            lifetimeDollarCapScope: LifetimeCapScope.Unconfirmed,
        });
        expect(segmentOf(plan, PlanRuleSegmentKind.Conclusion).value).toBe(
            'account concludes at $100,000 in lifetime payouts (scope not stated by the firm)',
        );
    });

    it('defaults a dollar cap with no declared scope to not stated by the firm', () => {
        const plan = apexEod.withOverrides({
            maxLifetimePayoutDollars: dollars(100_000),
            maxLifetimePayouts: undefined,
            payoutLadder: undefined,
        });
        expect(segmentOf(plan, PlanRuleSegmentKind.Conclusion).value).toBe(
            'account concludes at $100,000 in lifetime payouts (scope not stated by the firm)',
        );
    });

    it('title-cases a multi-word kebab variant using the firm’s own acronym (PT-12h review)', () => {
        const plan = mffPro.withOverrides({
            id: {
                accountSize: 50_000,
                firm: FirmId.Mffu,
                variant: MffuVariant.RapidEod,
            },
        });
        expect(segmentOf(plan, PlanRuleSegmentKind.Conclusion).value).toBe(
            'account concludes at $100,000 in lifetime payouts (per user across all Rapid EOD accounts)',
        );
    });

    it('prints the Alpha Futures Standard Qualified Reset terms before the closed-account fallback', () => {
        const plan = planFor({
            accountSize: 50_000,
            firm: FirmId.AlphaFutures,
            variant: AlphaFuturesVariant.Standard,
        });
        expect(segmentOf(plan, PlanRuleSegmentKind.FundedBreach).value).toBe(
            `Qualified Reset: $599 each, up to 2 per account, only while the account never requested a payout, within 7 calendar days of a breach; otherwise ${CLOSED_SLOT}`,
        );
    });

    it('prints no eval retry on an instant-funded plan', () => {
        const plan = planFor({
            accountSize: 50_000,
            firm: FirmId.Tradeify,
            variant: TradeifyVariant.Lightning,
        });
        expect(segmentOf(plan, PlanRuleSegmentKind.EvalBreach)).toEqual({
            kind: PlanRuleSegmentKind.EvalBreach,
            term: 'on breach: eval',
            value: 'n/a',
        });
    });

    it('prices a forced rebuy with its first month, as the engine charges it', () => {
        const rebuy = tpt.withOverrides({
            fees: { ...tpt.fees, retry: RetryKind.Rebuy },
        });
        expect(segmentOf(rebuy, PlanRuleSegmentKind.EvalBreach).value).toBe(
            'rebuy $170',
        );
    });

    it('concludes after an uncapped payout ladder and not after a capped one', () => {
        const ladder = {
            minRequestAmount: dollars(500),
            steps: [1000, 1500, 2000],
        };
        expect(
            segmentOf(
                apexEod.withOverrides({
                    maxLifetimePayouts: undefined,
                    payoutLadder: ladder,
                }),
                PlanRuleSegmentKind.Conclusion,
            ).value,
        ).toBe('account concludes after the 3-step payout ladder');
        expect(
            segmentOf(
                apexEod.withOverrides({
                    maxLifetimePayouts: undefined,
                    payoutLadder: { ...ladder, capsAtLastStep: true },
                }),
                PlanRuleSegmentKind.Conclusion,
            ).value,
        ).toBe(NO_LIFETIME_LIMIT);
    });

    it('prints both a payout count and a dollar cap when a plan has both', () => {
        expect(
            segmentOf(
                mffPro.withOverrides({ maxLifetimePayouts: 5 }),
                PlanRuleSegmentKind.Conclusion,
            ).value,
        ).toBe(
            'account concludes after 5 payouts or at $100,000 in lifetime payouts (per user across all Pro accounts)',
        );
    });

    it('prints the uncapped ladder beside a dollar cap, as the engine ends the account at either', () => {
        const plan = mffPro.withOverrides({
            payoutLadder: {
                minRequestAmount: dollars(500),
                steps: [1000, 1500, 2000],
            },
        });
        expect(plan.isAccountConcluded(3, 0)).toBe(true);
        expect(plan.isAccountConcluded(0, 100_000)).toBe(true);
        expect(plan.isAccountConcluded(2, 99_999)).toBe(false);
        expect(segmentOf(plan, PlanRuleSegmentKind.Conclusion).value).toBe(
            'account concludes after the 3-step payout ladder or at $100,000 in lifetime payouts (per user across all Pro accounts)',
        );
    });

    it.each([
        {
            expected:
                'account concludes at $100,000 in lifetime payouts (per user across all Pro accounts)',
            name: 'a dollar cap alone',
            plan: mffPro,
        },
        {
            expected: 'account concludes after 6 payouts',
            name: 'a payout count alone',
            plan: apexEod,
        },
        {
            expected:
                'account concludes after the 2-step payout ladder or at $100,000 in lifetime payouts (per user across all Pro accounts)',
            name: 'a payout count beyond the end of an uncapped ladder, with a dollar cap',
            plan: mffPro.withOverrides({
                maxLifetimePayouts: 4,
                payoutLadder: {
                    minRequestAmount: dollars(500),
                    steps: [1000, 1500],
                },
            }),
        },
        {
            expected: 'account concludes after 2 payouts',
            name: 'a payout count that ends an uncapped ladder early',
            plan: apexEod.withOverrides({
                maxLifetimePayouts: 2,
                payoutLadder: {
                    minRequestAmount: dollars(500),
                    steps: [1000, 1500, 2000],
                },
            }),
        },
        {
            expected: 'account concludes after the 2-step payout ladder',
            name: 'an uncapped ladder alone',
            plan: apexEod.withOverrides({
                maxLifetimePayouts: undefined,
                payoutLadder: {
                    minRequestAmount: dollars(500),
                    steps: [1000, 1500],
                },
            }),
        },
        {
            expected: NO_LIFETIME_LIMIT,
            name: 'no cap and a capped ladder',
            plan: apexEod.withOverrides({
                maxLifetimePayouts: undefined,
                payoutLadder: {
                    capsAtLastStep: true,
                    minRequestAmount: dollars(500),
                    steps: [1000, 1500],
                },
            }),
        },
    ])(
        'names exactly the limits isAccountConcluded enforces: $name',
        ({ expected, plan }) => {
            const ladder = plan.payoutLadder;
            const ladderLimit =
                ladder === null || ladder.capsAtLastStep === true
                    ? null
                    : ladder.steps.length;
            const countLimit =
                ladderLimit === null || plan.maxLifetimePayouts === null
                    ? (plan.maxLifetimePayouts ?? ladderLimit)
                    : Math.min(plan.maxLifetimePayouts, ladderLimit);
            const dollarLimit = plan.maxLifetimePayoutDollars;
            const text = segmentOf(plan, PlanRuleSegmentKind.Conclusion).value;
            expect(text).toBe(expected);
            expect(plan.isAccountConcluded(1000, 0)).toBe(countLimit !== null);
            expect(plan.isAccountConcluded(0, 1e9)).toBe(dollarLimit !== null);
            if (countLimit !== null) {
                expect(plan.isAccountConcluded(countLimit, 0)).toBe(true);
                expect(plan.isAccountConcluded(countLimit - 1, 0)).toBe(false);
                expect(text).toContain(String(countLimit));
            }
            if (dollarLimit === null) return;
            expect(plan.isAccountConcluded(0, dollarLimit)).toBe(true);
            expect(plan.isAccountConcluded(0, dollarLimit - 1)).toBe(false);
            expect(text).toContain(formatCurrency(dollarLimit));
        },
    );
});

describe('planConsistencyLabels (shared by the CLI and the web badge)', () => {
    it('reads the eval and funded rules from the phase accessors', () => {
        expect(
            planConsistencyLabels(
                planFor({
                    accountSize: 50_000,
                    firm: FirmId.AlphaFutures,
                    variant: AlphaFuturesVariant.Standard,
                }),
            ),
        ).toEqual({
            eval: '50%',
            funded: '40% (inclusive, fails on a net-losing cycle)',
        });
    });

    it('has no eval label on an instant-funded plan or a plan without a rule', () => {
        expect(
            planConsistencyLabels(
                planFor({
                    accountSize: 50_000,
                    firm: FirmId.Tradeify,
                    variant: TradeifyVariant.Lightning,
                }),
            ),
        ).toEqual({ eval: null, funded: '20%' });
        expect(planConsistencyLabels(apexEod)).toEqual({
            eval: null,
            funded: '50%',
        });
    });
});
