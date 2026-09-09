import type { FirmId } from './FirmId';

export enum AlphaFuturesVariant {
    Advanced = 'advanced',
    Express = 'express',
    Premium = 'premium',
    Zero = 'zero',
}

export enum ApexVariant {
    Eod = 'eod',
    Intraday = 'intraday',
}

export enum FundedNextVariant {
    Bolt = 'bolt',
    Legacy = 'legacy',
    Rapid = 'rapid',
}

export enum LucidVariant {
    Direct = 'direct',
    Flex = 'flex',
    Pro = 'pro',
}

export enum MffuVariant {
    Builder = 'builder',
    Flex = 'flex',
    Pro = 'pro',
    Rapid = 'rapid',
    RapidEod = 'rapid-eod',
}

export enum TopStepVariant {
    NoFeeConsistency = 'no-fee-consistency',
    NoFeeStandard = 'no-fee-standard',
    StandardConsistency = 'standard-consistency',
    StandardStandard = 'standard-standard',
}

export enum TradeifyVariant {
    Growth = 'growth',
    Lightning = 'lightning',
    SelectDaily = 'select-daily',
    SelectFlex = 'select-flex',
}

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
type ApexAccountSize = 50_000;
type FundedNextAccountSize = 50_000;
type LucidAccountSize = 50_000;
type MffuAccountSize = 50_000;
type TopStepAccountSize = 50_000;
type TptAccountSize = 50_000;
type TradeifyAccountSize = 50_000;

export function arePlanIdsEqual(a: PlanId, b: PlanId): boolean {
    return serializePlanId(a) === serializePlanId(b);
}

export function serializePlanId(id: PlanId): string {
    const base = `${id.firm}-${id.accountSize}`;
    return 'variant' in id ? `${base}-${id.variant}` : base;
}
