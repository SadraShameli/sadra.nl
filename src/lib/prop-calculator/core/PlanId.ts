import type { FirmId } from './FirmId';

export type PlanId =
    | {
          readonly accountSize: AlphaFuturesAccountSize;
          readonly firm: FirmId.AlphaFutures;
          readonly variant: AlphaFuturesVariant;
      }
    | {
          readonly accountSize: ApexAccountSize;
          readonly firm: FirmId.Apex;
          readonly variant: ApexVariant;
      }
    | {
          readonly accountSize: FundedNextAccountSize;
          readonly firm: FirmId.FundedNext;
          readonly variant: FundedNextVariant;
      }
    | {
          readonly accountSize: LucidAccountSize;
          readonly firm: FirmId.Lucid;
          readonly variant: LucidVariant;
      }
    | {
          readonly accountSize: MffuAccountSize;
          readonly firm: FirmId.Mffu;
          readonly variant: MffuVariant;
      }
    | {
          readonly accountSize: TopStepAccountSize;
          readonly firm: FirmId.TopStep;
          readonly variant: TopStepVariant;
      }
    | { readonly accountSize: TptAccountSize; readonly firm: FirmId.Tpt }
    | {
          readonly accountSize: TradeifyAccountSize;
          readonly firm: FirmId.Tradeify;
          readonly variant: TradeifyVariant;
      };
type AlphaFuturesAccountSize = 25_000 | 50_000 | 100_000 | 150_000;
type AlphaFuturesVariant = 'advanced' | 'express' | 'premium' | 'zero';
type ApexAccountSize = 25_000 | 50_000 | 100_000 | 150_000;
type ApexVariant = 'eod' | 'intraday';
type FundedNextAccountSize = 25_000 | 50_000 | 100_000;
type FundedNextVariant = 'bolt' | 'legacy' | 'rapid';
type LucidAccountSize = 25_000 | 50_000 | 100_000 | 150_000;

type LucidVariant = 'direct' | 'flex' | 'pro';
type MffuAccountSize = 25_000 | 50_000 | 100_000 | 150_000;
type MffuVariant = 'builder' | 'flex' | 'pro' | 'rapid';
type TopStepAccountSize = 50_000 | 100_000 | 150_000;
type TopStepVariant = 'express' | 'standard';
type TptAccountSize = 25_000 | 50_000 | 75_000 | 100_000 | 150_000;
type TradeifyAccountSize = 25_000 | 50_000 | 100_000 | 150_000;

type TradeifyVariant = 'growth' | 'lightning' | 'select';

export function arePlanIdsEqual(a: PlanId, b: PlanId): boolean {
    if (a.firm !== b.firm || a.accountSize !== b.accountSize) return false;
    const av = 'variant' in a ? a.variant : undefined;
    const bv = 'variant' in b ? b.variant : undefined;
    return av === bv;
}

export function serializePlanId(id: PlanId): string {
    const base = `${id.firm}-${id.accountSize}`;
    return 'variant' in id ? `${base}-${id.variant}` : base;
}
