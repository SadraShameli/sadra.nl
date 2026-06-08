import type {
    BankAccount,
    Booking,
    BookingRule,
    ConversionResult,
    ISODate,
    RawTransaction,
} from './core/types';

export const STAGES = ['sources', 'fetch-fx', 'build', 'post'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_STATUSES = ['idle', 'started', 'finished'] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const LOG_LEVELS = ['error', 'info', 'warn'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const IMPORT_EVENT_KINDS = [
    'done',
    'failed',
    'log',
    'posted',
    'preview',
    'progress',
    'stage',
] as const;
export interface DecryptedCredential {
    id: string;
    kind: string;
    meta: Record<string, unknown>;
    secret: string;
}

export type ImportEvent =
    | {
          current: number;
          kind: 'progress';
          message?: string;
          stage: Stage;
          total: number;
      }
    | {
          durationMs?: number;
          kind: 'stage';
          message?: string;
          stage: Stage;
          status: Exclude<StageStatus, 'idle'>;
      }
    | { error: string; kind: 'failed'; txnId: string }
    | { externalId: number; kind: 'posted'; txnId: string }
    | { kind: 'done' }
    | { kind: 'log'; level: LogLevel; message: string }
    | { kind: 'preview'; result: ConversionResult };

export type ImportEventKind = (typeof IMPORT_EVENT_KINDS)[number];

export interface PlanInput {
    apiCredentials: DecryptedCredential[];
    bankAccounts: BankAccount[];
    fetchImpl?: typeof fetch;
    rules: BookingRule[];
    startDate: ISODate;
    uploadedTransactions: RawTransaction[];
}

export interface PushInput {
    accountingCredential: DecryptedCredential;
    bookings: Booking[];
    fetchImpl?: typeof fetch;
}
