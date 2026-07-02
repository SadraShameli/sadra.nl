import type { RunId } from '~/lib/accounting/core/ids';
import type { RuleSet } from '~/lib/accounting/core/rules/rule-set';
import type {
    BankAccount,
    ConversionResult,
    ISODate,
} from '~/lib/accounting/core/types';

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
    'run',
    'stage',
] as const;
export interface DecryptedCredential {
    id: string;
    kind: string;
    meta: Record<string, unknown>;
    secret: string;
}

export interface FileCredential {
    id: string;
    kind: string;
    meta: Record<string, unknown>;
}

export interface FileInput {
    content: string;
    credential: FileCredential;
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
    | { kind: 'preview'; result: ConversionResult }
    | { kind: 'run'; runId: RunId };

export type ImportEventKind = (typeof IMPORT_EVENT_KINDS)[number];

export interface PlanInput {
    accountingCredentialId?: string;
    apiCredentials: DecryptedCredential[];
    bankAccounts: BankAccount[];
    fetchImpl?: typeof fetch;
    fileInputs: FileInput[];
    ruleSet: RuleSet;
    startDate: ISODate;
    userId: string;
}

export interface PushInput {
    accountingCredential: DecryptedCredential;
    fetchImpl?: typeof fetch;
    runId: RunId;
    userId: string;
}
