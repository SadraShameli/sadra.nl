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
