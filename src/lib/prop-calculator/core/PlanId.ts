import type { FirmId } from './FirmId';

type AlphaFuturesAccountSize = 25_000 | 50_000 | 100_000 | 150_000;
type ApexAccountSize = 25_000 | 50_000 | 100_000 | 150_000;
type FundedNextAccountSize = 25_000 | 50_000 | 100_000;
type LucidAccountSize = 25_000 | 50_000 | 100_000 | 150_000;
type MffuAccountSize = 25_000 | 50_000 | 100_000 | 150_000;
type TopStepAccountSize = 50_000 | 100_000 | 150_000;
type TptAccountSize = 25_000 | 50_000 | 75_000 | 100_000 | 150_000;
type TradeifyAccountSize = 25_000 | 50_000 | 100_000 | 150_000;

type AlphaFuturesVariant = 'zero' | 'advanced' | 'premium' | 'express';
type ApexVariant = 'eod' | 'intraday';
type FundedNextVariant = 'legacy' | 'rapid' | 'bolt';
type LucidVariant = 'flex' | 'pro' | 'direct';
type MffuVariant = 'rapid' | 'flex' | 'pro' | 'builder';
type TopStepVariant = 'standard' | 'express';
type TradeifyVariant = 'growth' | 'select' | 'lightning';

export type PlanId =
    | {
          readonly firm: FirmId.Apex;
          readonly accountSize: ApexAccountSize;
          readonly variant: ApexVariant;
      }
    | {
          readonly firm: FirmId.TopStep;
          readonly accountSize: TopStepAccountSize;
          readonly variant: TopStepVariant;
      }
    | {
          readonly firm: FirmId.Tradeify;
          readonly accountSize: TradeifyAccountSize;
          readonly variant: TradeifyVariant;
      }
    | {
          readonly firm: FirmId.Lucid;
          readonly accountSize: LucidAccountSize;
          readonly variant: LucidVariant;
      }
    | { readonly firm: FirmId.Tpt; readonly accountSize: TptAccountSize }
    | {
          readonly firm: FirmId.FundedNext;
          readonly accountSize: FundedNextAccountSize;
          readonly variant: FundedNextVariant;
      }
    | {
          readonly firm: FirmId.AlphaFutures;
          readonly accountSize: AlphaFuturesAccountSize;
          readonly variant: AlphaFuturesVariant;
      }
    | {
          readonly firm: FirmId.Mffu;
          readonly accountSize: MffuAccountSize;
          readonly variant: MffuVariant;
      };

export function serializePlanId(id: PlanId): string {
    const base = `${id.firm}-${id.accountSize}`;
    return 'variant' in id ? `${base}-${id.variant}` : base;
}

export function planIdEquals(a: PlanId, b: PlanId): boolean {
    if (a.firm !== b.firm || a.accountSize !== b.accountSize) return false;
    const av = 'variant' in a ? a.variant : undefined;
    const bv = 'variant' in b ? b.variant : undefined;
    return av === bv;
}
