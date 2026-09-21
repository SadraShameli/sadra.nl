import type { FirmId } from './FirmId';

export enum AlphaFuturesVariant {
    Advanced = 'advanced',
    Standard = 'standard',
    Zero = 'zero',
}

export enum ApexVariant {
    Eod = 'eod',
    Intraday = 'intraday',
}

export enum E8FuturesVariant {
    Signature = 'signature',
    ZeroMax80 = 'zero-max-80',
    ZeroMax100 = 'zero-max-100',
    ZeroStarter80 = 'zero-starter-80',
    ZeroStarter100 = 'zero-starter-100',
}

export enum FtmoFuturesVariant {
    Growth = 'growth',
    Pro = 'pro',
}

export enum FundedNextVariant {
    Flex = 'flex',
    Fnl003 = 'fnl-003',
    Legacy = 'legacy',
    RapidDaily = 'rapid-daily',
    RapidPro = 'rapid-pro',
    RapidProDllAddOn = 'rapid-pro-dll-add-on',
}

export enum LucidVariant {
    DailyEod = 'daily-eod',
    DailyEodDll = 'daily-eod-dll',
    DailyIntraday = 'daily-intraday',
    DailyIntradayDll = 'daily-intraday-dll',
    Direct = 'direct',
    Flex = 'flex',
    FlexDll = 'flex-dll',
    Maxx = 'maxx',
    Pro = 'pro',
    ProNoDll = 'pro-no-dll',
}

export enum MffuVariant {
    Builder = 'builder',
    Pro = 'pro',
    Rapid = 'rapid',
    RapidEod = 'rapid-eod',
}

export enum TopStepVariant {
    NoFeeConsistency = 'no-fee-consistency',
    NoFeeConsistencyDll = 'no-fee-consistency-dll',
    NoFeeStandard = 'no-fee-standard',
    NoFeeStandardDll = 'no-fee-standard-dll',
    ProAccount = 'pro-account',
    StandardConsistency = 'standard-consistency',
    StandardConsistencyDll = 'standard-consistency-dll',
    StandardStandard = 'standard-standard',
    StandardStandardDll = 'standard-standard-dll',
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
          readonly accountSize: E8FuturesAccountSize;
          readonly firm: FirmId.E8Futures;
          readonly variant: E8FuturesVariant;
      }
    | {
          readonly accountSize: FtmoFuturesAccountSize;
          readonly firm: FirmId.FtmoFutures;
          readonly variant: FtmoFuturesVariant;
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
type E8FuturesAccountSize = 50_000;
type FtmoFuturesAccountSize = 50_000;
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
