'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { BookingDirection, LedgerRef } from '~/lib/accounting/core/types';
import type { VatCode } from '~/lib/accounting/providers/eboekhouden/enums';

import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { EmptyState } from '~/components/ui/EmptyState';
import { Input } from '~/components/ui/Input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '~/components/ui/Select';
import {
    VAT_CODE_LABEL,
    VAT_CODES,
} from '~/lib/accounting/providers/eboekhouden/enums';
import { api } from '~/trpc/react';

import { LedgerCombobox } from './LedgerCombobox';
import { ProviderCredentialPicker } from './ProviderCredentialPicker';

const VAT_NONE = '__none__';
const toastError = (e: { message: string }) => toast.error(e.message);

interface RuleView {
    direction: BookingDirection;
    display: string;
    id: string;
    ledger: LedgerRef;
    match: string;
    vatCode: VatCode;
}

export function RulesManager() {
    const [credentialId, setCredentialId] = useState<string>('');

    const ledgersQ = api.accounting.ledgers.list.useQuery(
        { credentialId },
        { enabled: !!credentialId },
    );
    const ledgerOptions = useMemo<LedgerRef[]>(
        () =>
            (ledgersQ.data ?? []).map((l) => ({
                id: l.externalId,
                label: `${l.code} ${l.description}`,
            })),
        [ledgersQ.data],
    );

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardContent className="pt-6">
                    <ProviderCredentialPicker
                        credentialRole="accounting"
                        onChange={setCredentialId}
                        value={credentialId}
                    />
                </CardContent>
            </Card>

            {credentialId ? (
                <>
                    <BankAccountsCard
                        credentialId={credentialId}
                        ledgerOptions={ledgerOptions}
                    />
                    <RulesCard
                        credentialId={credentialId}
                        ledgerOptions={ledgerOptions}
                    />
                </>
            ) : (
                <Card>
                    <CardContent>
                        <EmptyState
                            description="Pick an accounting credential above to manage its bank accounts and booking rules."
                            title="No credential selected"
                        />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function AddRuleForm({
    credentialId,
    ledgerOptions,
}: {
    credentialId: string;
    ledgerOptions: LedgerRef[];
}) {
    const utils = api.useUtils();
    const create = api.accounting.rules.create.useMutation({
        onError: toastError,
        onSuccess: () =>
            void utils.accounting.rules.list.invalidate({ credentialId }),
    });

    const [match, setMatch] = useState('');
    const [direction, setDirection] = useState<BookingDirection>('OUT');
    const [display, setDisplay] = useState('');
    const [ledger, setLedger] = useState<LedgerRef | null>(null);
    const [vatCode, setVatCode] = useState<string>(VAT_NONE);

    const canAdd =
        match.trim().length > 0 &&
        display.trim().length > 0 &&
        ledger !== null &&
        vatCode !== VAT_NONE;

    return (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
            <Input
                className="h-8 w-40 text-xs"
                onChange={(e) => setMatch(e.target.value)}
                placeholder="merchant contains…"
                value={match}
            />
            <DirectionSelect onChange={setDirection} value={direction} />
            <Input
                className="h-8 w-40 text-xs"
                onChange={(e) => setDisplay(e.target.value)}
                placeholder="counterpart name"
                value={display}
            />
            <LedgerCombobox
                onChange={setLedger}
                options={ledgerOptions}
                value={ledger}
            />
            <VatSelect
                onChange={(v) => setVatCode(v)}
                value={vatCode === VAT_NONE ? '' : vatCode}
            />
            <Button
                disabled={!canAdd}
                onClick={() => {
                    if (!ledger || vatCode === VAT_NONE) return;
                    create.mutate({
                        credentialId,
                        direction,
                        display: display.trim(),
                        ledger,
                        match: match.trim(),
                        vatCode: vatCode as VatCode,
                    });
                    setMatch('');
                    setDisplay('');
                    setLedger(null);
                    setVatCode(VAT_NONE);
                }}
                size="sm"
            >
                <Plus className="size-3.5" /> Add rule
            </Button>
        </div>
    );
}

function BankAccountsCard({
    credentialId,
    ledgerOptions,
}: {
    credentialId: string;
    ledgerOptions: LedgerRef[];
}) {
    const utils = api.useUtils();
    const invalidate = () =>
        void utils.accounting.bankAccounts.list.invalidate({ credentialId });
    const banksQ = api.accounting.bankAccounts.list.useQuery({ credentialId });
    const upsert = api.accounting.bankAccounts.upsert.useMutation({
        onError: toastError,
        onSuccess: invalidate,
    });
    const del = api.accounting.bankAccounts.delete.useMutation({
        onError: toastError,
        onSuccess: invalidate,
    });

    const [currency, setCurrency] = useState('');
    const [ledger, setLedger] = useState<LedgerRef | null>(null);
    const canAdd = currency.trim().length > 0 && ledger !== null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Bank accounts</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                    Map each Wise currency to the ledger its transactions book
                    through. Transactions in an unmapped currency are skipped.
                </p>
                {(banksQ.data ?? []).map((b) => (
                    <div className="flex items-center gap-2" key={b.id}>
                        <span className="w-16 font-mono text-xs">
                            {b.currency}
                        </span>
                        <LedgerCombobox
                            onChange={(l) =>
                                upsert.mutate({
                                    credentialId,
                                    currency: b.currency,
                                    ledger: l,
                                })
                            }
                            options={ledgerOptions}
                            value={b.ledger}
                        />
                        <Button
                            onClick={() => del.mutate({ id: b.id })}
                            size="icon"
                            variant="ghost"
                        >
                            <Trash2 className="size-3.5" />
                        </Button>
                    </div>
                ))}
                <div className="flex items-center gap-2 border-t border-border/40 pt-3">
                    <Input
                        className="h-8 w-16 text-xs"
                        onChange={(e) =>
                            setCurrency(e.target.value.toUpperCase())
                        }
                        placeholder="EUR"
                        value={currency}
                    />
                    <LedgerCombobox
                        onChange={setLedger}
                        options={ledgerOptions}
                        value={ledger}
                    />
                    <Button
                        disabled={!canAdd}
                        onClick={() => {
                            if (!ledger) return;
                            upsert.mutate({
                                credentialId,
                                currency: currency.trim(),
                                ledger,
                            });
                            setCurrency('');
                            setLedger(null);
                        }}
                        size="sm"
                    >
                        <Plus className="size-3.5" /> Add
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function DirectionSelect({
    onChange,
    value,
}: {
    onChange: (v: BookingDirection) => void;
    value: BookingDirection;
}) {
    return (
        <Select
            onValueChange={(v) => onChange(v as BookingDirection)}
            value={value}
        >
            <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="OUT">OUT</SelectItem>
                <SelectItem value="IN">IN</SelectItem>
            </SelectContent>
        </Select>
    );
}

function RuleRow({
    ledgerOptions,
    onDelete,
    onUpdate,
    rule,
}: {
    ledgerOptions: LedgerRef[];
    onDelete: () => void;
    onUpdate: (patch: Partial<Omit<RuleView, 'id'>>) => void;
    rule: RuleView;
}) {
    const [match, setMatch] = useState(rule.match);
    const [display, setDisplay] = useState(rule.display);

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Input
                className="h-8 w-40 text-xs"
                onBlur={() => {
                    const next = match.trim();
                    if (next && next !== rule.match) onUpdate({ match: next });
                }}
                onChange={(e) => setMatch(e.target.value)}
                placeholder="merchant contains…"
                value={match}
            />
            <DirectionSelect
                onChange={(direction) => onUpdate({ direction })}
                value={rule.direction}
            />
            <Input
                className="h-8 w-40 text-xs"
                onBlur={() => {
                    const next = display.trim();
                    if (next && next !== rule.display)
                        onUpdate({ display: next });
                }}
                onChange={(e) => setDisplay(e.target.value)}
                placeholder="counterpart name"
                value={display}
            />
            <LedgerCombobox
                onChange={(ledger) => onUpdate({ ledger })}
                options={ledgerOptions}
                value={rule.ledger}
            />
            <VatSelect
                onChange={(vatCode) => onUpdate({ vatCode })}
                value={rule.vatCode}
            />
            <Button onClick={onDelete} size="icon" variant="ghost">
                <Trash2 className="size-3.5" />
            </Button>
        </div>
    );
}

function RulesCard({
    credentialId,
    ledgerOptions,
}: {
    credentialId: string;
    ledgerOptions: LedgerRef[];
}) {
    const utils = api.useUtils();
    const invalidate = () =>
        void utils.accounting.rules.list.invalidate({ credentialId });
    const rulesQ = api.accounting.rules.list.useQuery({ credentialId });
    const update = api.accounting.rules.update.useMutation({
        onError: toastError,
        onSuccess: invalidate,
    });
    const del = api.accounting.rules.delete.useMutation({
        onError: toastError,
        onSuccess: invalidate,
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Rules</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                    A transaction matches when its direction equals the rule and
                    its merchant contains the match text. First match wins.
                </p>
                {(rulesQ.data ?? []).map((rule) => (
                    <RuleRow
                        key={rule.id}
                        ledgerOptions={ledgerOptions}
                        onDelete={() => del.mutate({ id: rule.id })}
                        onUpdate={(patch) =>
                            update.mutate({ id: rule.id, ...patch })
                        }
                        rule={rule}
                    />
                ))}
                <AddRuleForm
                    credentialId={credentialId}
                    ledgerOptions={ledgerOptions}
                />
            </CardContent>
        </Card>
    );
}

function VatSelect({
    onChange,
    value,
}: {
    onChange: (v: VatCode) => void;
    value: string;
}) {
    return (
        <Select onValueChange={(v) => onChange(v as VatCode)} value={value}>
            <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue placeholder="VAT code" />
            </SelectTrigger>
            <SelectContent>
                {VAT_CODES.map((c) => (
                    <SelectItem key={c} value={c}>
                        {VAT_CODE_LABEL[c]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
