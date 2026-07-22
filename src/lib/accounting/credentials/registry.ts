import type { z } from 'zod';

export enum CredentialKind {
    EBoekhouden = 'eboekhouden',
    Moneybird = 'moneybird',
    Plane = 'plane',
    Wise = 'wise',
}

export enum CredentialRole {
    Accounting = 'accounting',
    Transactions = 'transactions',
}

export enum CredentialTone {
    Amber = 'amber',
    Emerald = 'emerald',
    Rose = 'rose',
    Sky = 'sky',
    Violet = 'violet',
}

export enum MetaFieldType {
    Boolean = 'boolean',
    Number = 'number',
    Select = 'select',
    Text = 'text',
}

export interface CredentialDescriptor {
    readonly accountingProviderId?: string;
    readonly description?: string;
    readonly id: CredentialKind;
    readonly label: string;
    readonly metaFields: readonly CredentialMetaField[];
    readonly metaSchema: z.ZodType<Record<string, unknown>>;
    readonly requiresSecret?: boolean;
    readonly role: CredentialRole;
    readonly secret?: {
        label: string;
        minLength: number;
        placeholder?: string;
    };
    readonly tone: CredentialTone;
    readonly transactionSourceId?: string;
    readonly transactionSourceKind?: 'api' | 'file';
}

export interface CredentialMetaField {
    defaultValue?: boolean | number | string;
    description?: string;
    key: string;
    label: string;
    placeholder?: string;
    required?: boolean;
    type: MetaFieldType;
}

export class CredentialRegistry {
    private static instanceValue: CredentialRegistry | null = null;

    static get instance(): CredentialRegistry {
        this.instanceValue ??= new CredentialRegistry();
        return this.instanceValue;
    }

    private readonly descriptors: Map<CredentialKind, CredentialDescriptor>;

    private constructor() {
        this.descriptors = new Map<CredentialKind, CredentialDescriptor>();
    }

    get(id: string): CredentialDescriptor | undefined {
        return this.descriptors.get(id as CredentialKind);
    }

    list(): CredentialDescriptor[] {
        return this.descriptors.values().toArray();
    }

    listByRole(role: CredentialRole): CredentialDescriptor[] {
        return this.descriptors
            .values()
            .filter((d) => d.role === role)
            .toArray();
    }

    register(d: CredentialDescriptor): void {
        this.descriptors.set(d.id, d);
    }
}

const TONE_CLASS: Record<CredentialTone, string> = {
    [CredentialTone.Amber]: 'bg-amber-500/10 text-amber-200',
    [CredentialTone.Emerald]: 'bg-emerald-500/10 text-emerald-200',
    [CredentialTone.Rose]: 'bg-rose-500/10 text-rose-200',
    [CredentialTone.Sky]: 'bg-sky-500/10 text-sky-200',
    [CredentialTone.Violet]: 'bg-violet-500/10 text-violet-200',
};

export function toneClass(tone: CredentialTone): string {
    return TONE_CLASS[tone];
}

const TONE_ACCENT: Record<CredentialTone, string> = {
    [CredentialTone.Amber]: 'text-amber-300',
    [CredentialTone.Emerald]: 'text-emerald-300',
    [CredentialTone.Rose]: 'text-rose-300',
    [CredentialTone.Sky]: 'text-sky-300',
    [CredentialTone.Violet]: 'text-violet-300',
};

export function toneAccent(tone: CredentialTone): string {
    return TONE_ACCENT[tone];
}
