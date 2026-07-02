import type { z } from 'zod';

export const CREDENTIAL_ROLES = ['accounting', 'transactions'] as const;
export type CredentialRole = (typeof CREDENTIAL_ROLES)[number];

export const CREDENTIAL_TONES = [
    'amber',
    'emerald',
    'rose',
    'sky',
    'violet',
] as const;
export type CredentialTone = (typeof CREDENTIAL_TONES)[number];

export const META_FIELD_TYPES = [
    'boolean',
    'number',
    'select',
    'text',
] as const;

export const CREDENTIAL_KIND_VALUES = ['eboekhouden', 'plane', 'wise'] as const;
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

export type CredentialKind = (typeof CREDENTIAL_KIND_VALUES)[number];

export interface CredentialMetaField {
    defaultValue?: boolean | number | string;
    description?: string;
    key: string;
    label: string;
    placeholder?: string;
    required?: boolean;
    type: MetaFieldType;
}

export type MetaFieldType = (typeof META_FIELD_TYPES)[number];

export class CredentialRegistry {
    private static instanceValue: CredentialRegistry | null = null;

    private readonly descriptors: Map<CredentialKind, CredentialDescriptor>;

    private constructor() {
        this.descriptors = new Map<CredentialKind, CredentialDescriptor>();
    }

    static instance(): CredentialRegistry {
        CredentialRegistry.instanceValue ??= new CredentialRegistry();
        return CredentialRegistry.instanceValue;
    }

    get(id: string): CredentialDescriptor | undefined {
        return this.descriptors.get(id as CredentialKind);
    }

    list(): CredentialDescriptor[] {
        return [...this.descriptors.values()];
    }

    listByRole(role: CredentialRole): CredentialDescriptor[] {
        return [...this.descriptors.values()].filter((d) => d.role === role);
    }

    register(d: CredentialDescriptor): void {
        this.descriptors.set(d.id, d);
    }
}

const TONE_CLASS: Record<CredentialTone, string> = {
    amber: 'bg-amber-500/10 text-amber-200',
    emerald: 'bg-emerald-500/10 text-emerald-200',
    rose: 'bg-rose-500/10 text-rose-200',
    sky: 'bg-sky-500/10 text-sky-200',
    violet: 'bg-violet-500/10 text-violet-200',
};

export function toneClass(tone: CredentialTone): string {
    return TONE_CLASS[tone];
}

const TONE_ACCENT: Record<CredentialTone, string> = {
    amber: 'text-amber-300',
    emerald: 'text-emerald-300',
    rose: 'text-rose-300',
    sky: 'text-sky-300',
    violet: 'text-violet-300',
};

export function toneAccent(tone: CredentialTone): string {
    return TONE_ACCENT[tone];
}
