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
type AlphaFuturesAccountSize = 50_000;
type AlphaFuturesVariant = 'advanced' | 'express' | 'premium' | 'zero';
type ApexAccountSize = 50_000;
type ApexVariant = 'eod' | 'intraday';
type FundedNextAccountSize = 50_000;
type FundedNextVariant = 'bolt' | 'legacy' | 'rapid';
type LucidAccountSize = 50_000;

type LucidVariant = 'direct' | 'flex' | 'pro';
type MffuAccountSize = 50_000;
type MffuVariant = 'builder' | 'flex' | 'pro' | 'rapid' | 'rapid-eod';
type TopStepAccountSize = 50_000;
type TopStepVariant = 'express' | 'standard';
type TptAccountSize = 50_000;
type TradeifyAccountSize = 50_000;

type TradeifyVariant = 'growth' | 'lightning' | 'select';

export function arePlanIdsEqual(a: PlanId, b: PlanId): boolean {
    return serializePlanId(a) === serializePlanId(b);
}

export function serializePlanId(id: PlanId): string {
    const base = `${id.firm}-${id.accountSize}`;
    return 'variant' in id ? `${base}-${id.variant}` : base;
}
