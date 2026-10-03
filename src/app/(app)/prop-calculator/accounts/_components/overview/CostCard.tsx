import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type CostCardModel } from './overviewModel';
import { SampleBadge } from './SampleBadge';

export function CostCard({ model }: { readonly model: CostCardModel }) {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-white">
                    Net spend by firm
                </h3>
                {model.byFirm.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No fee recorded yet.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Firm</TableHead>
                                <TableHead className="text-right">
                                    Net spend
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {model.byFirm.map((row) => (
                                <TableRow key={row.key}>
                                    <TableCell>{row.firm}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.amount}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </div>
            {model.byKind.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium text-white">
                        Net spend by fee kind
                    </h3>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fee kind</TableHead>
                                <TableHead className="text-right">
                                    Amount
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {model.byKind.map((row) => (
                                <TableRow key={row.key}>
                                    <TableCell>{row.kind}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.amount}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
            <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-white">
                    Cost per funded account
                </h3>
                {model.perPlan.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No account with a modeled plan yet.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Plan</TableHead>
                                <TableHead className="text-right">
                                    Decided spend
                                </TableHead>
                                <TableHead className="text-right">
                                    Attempts
                                </TableHead>
                                <TableHead className="text-right">
                                    Cost per attempt
                                </TableHead>
                                <TableHead className="text-right">
                                    Implied attempts
                                </TableHead>
                                <TableHead className="text-right">
                                    Funded
                                </TableHead>
                                <TableHead className="text-right">
                                    Realized cost per funded
                                </TableHead>
                                <TableHead className="text-right">
                                    Pending spend
                                </TableHead>
                                <TableHead className="text-right">
                                    Open eval attempts
                                </TableHead>
                                <TableHead className="text-right">
                                    Modeled cost per funded
                                </TableHead>
                                <TableHead className="text-right">
                                    Realized minus modeled
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {model.perPlan.map((row) => (
                                <TableRow key={row.key}>
                                    <TableCell>{row.plan}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.acquisitionSpend}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        <span className="inline-flex items-center gap-1.5">
                                            {row.attempts}
                                            <SampleBadge
                                                level={row.attemptsSampleLevel}
                                            />
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.costPerAttempt}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.impliedAttempts}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        <span className="inline-flex items-center gap-1.5">
                                            {row.fundedAccounts}
                                            <SampleBadge
                                                level={row.fundedSampleLevel}
                                            />
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.costPerFunded}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.pendingSpend}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.pendingEvalAccounts}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground tabular-nums">
                                        {row.modeled}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.realizedMinusModeled}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </div>
            {model.byAccountSize.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium text-white">
                        Attempts and cost per attempt by account size
                    </h3>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Account size</TableHead>
                                <TableHead className="text-right">
                                    Attempts
                                </TableHead>
                                <TableHead className="text-right">
                                    Cost per attempt
                                </TableHead>
                                <TableHead className="text-right">
                                    Decided spend
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {model.byAccountSize.map((row) => (
                                <TableRow key={row.key}>
                                    <TableCell className="tabular-nums">
                                        {row.accountSize}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        <span className="inline-flex items-center gap-1.5">
                                            {row.attempts}
                                            <SampleBadge
                                                level={row.attemptsSampleLevel}
                                            />
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.costPerAttempt}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.spend}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
            {model.byFirmAttemptCost.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium text-white">
                        Attempts and cost per attempt by firm
                    </h3>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Firm</TableHead>
                                <TableHead className="text-right">
                                    Attempts
                                </TableHead>
                                <TableHead className="text-right">
                                    Cost per attempt
                                </TableHead>
                                <TableHead className="text-right">
                                    Implied attempts
                                </TableHead>
                                <TableHead className="text-right">
                                    Resets and rebuys
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {model.byFirmAttemptCost.map((row) => (
                                <TableRow key={row.key}>
                                    <TableCell>{row.firm}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        <span className="inline-flex items-center gap-1.5">
                                            {row.attempts}
                                            <SampleBadge
                                                level={row.attemptsSampleLevel}
                                            />
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.costPerAttempt}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.impliedAttempts}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.retryFeeAttempts}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
            {(model.discountsByFirm.length > 0 ||
                model.discountsNote !== null) && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium text-white">
                        Discounts captured by firm
                    </h3>
                    {model.discountsByFirm.length > 0 && (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Firm</TableHead>
                                    <TableHead className="text-right">
                                        Discount vs list price
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Fees checked
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {model.discountsByFirm.map((row) => (
                                    <TableRow key={row.key}>
                                        <TableCell>{row.firm}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.discount}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {row.feesChecked}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                    {model.discountsNote !== null && (
                        <p className="text-xs text-muted-foreground">
                            {model.discountsNote}
                        </p>
                    )}
                </div>
            )}
            <Disclosures items={model.disclosures} />
        </div>
    );
}

function Disclosures({ items }: { readonly items: readonly string[] }) {
    return (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {items.map((item) => (
                <li key={item}>{item}</li>
            ))}
        </ul>
    );
}
