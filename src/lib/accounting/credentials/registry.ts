import { z } from 'zod';

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
        const kind = z.enum(CredentialKind).safeParse(id);
        return kind.success ? this.descriptors.get(kind.data) : undefined;
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
    [CredentialTone.Amber]: 'bg-warning/10 text-warning',
    [CredentialTone.Emerald]: 'bg-success/10 text-success',
    [CredentialTone.Rose]: 'bg-destructive/10 text-destructive',
    [CredentialTone.Sky]: 'bg-info/10 text-info',
    [CredentialTone.Violet]: 'bg-primary/10 text-primary',
};

export function toneClass(tone: CredentialTone): string {
    return TONE_CLASS[tone];
}

const TONE_ACCENT: Record<CredentialTone, string> = {
    [CredentialTone.Amber]: 'text-warning',
    [CredentialTone.Emerald]: 'text-success',
    [CredentialTone.Rose]: 'text-destructive',
    [CredentialTone.Sky]: 'text-info',
    [CredentialTone.Violet]: 'text-primary',
};

export function toneAccent(tone: CredentialTone): string {
    return TONE_ACCENT[tone];
}
