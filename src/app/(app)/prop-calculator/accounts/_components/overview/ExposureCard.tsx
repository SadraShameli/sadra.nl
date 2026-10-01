import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type ExposureCardModel } from './overviewModel';

export function ExposureCard({
    model,
}: {
    readonly model: ExposureCardModel;
}) {
    return (
        <div className="flex flex-col gap-3">
            {model.accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No active account has a usable balance snapshot yet.
                </p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Account</TableHead>
                            <TableHead className="text-right">
                                First-trade risk
                            </TableHead>
                            <TableHead className="text-right">
                                Maximum daily loss
                            </TableHead>
                            <TableHead className="text-right">
                                Cushion
                            </TableHead>
                            <TableHead className="text-right">
                                Share of cushion at risk
                            </TableHead>
                            <TableHead>Basis</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {model.accounts.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell>{row.account}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.firstTradeRisk}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.maxDailyLoss}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.cushion}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.shareOfCushionAtRisk}
                                </TableCell>
                                <TableCell>{row.basis}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            {model.groups.length > 0 && (
                <Table aria-label="Exposure per copy group">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Copy group</TableHead>
                            <TableHead>Accounts</TableHead>
                            <TableHead className="text-right">
                                Maximum daily loss
                            </TableHead>
                            <TableHead className="text-right">
                                Combined cushion
                            </TableHead>
                            <TableHead className="text-right">
                                Share of cushion at risk
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {model.groups.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell>
                                    {row.group}
                                    <span className="block text-xs text-muted-foreground">
                                        {row.note}
                                    </span>
                                </TableCell>
                                <TableCell>{row.accounts}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.maxDailyLoss}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.totalCushion}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.shareOfCushionAtRisk}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {model.disclosures.map((disclosure) => (
                    <li key={disclosure}>{disclosure}</li>
                ))}
            </ul>
            {model.unavailable.length > 0 && (
                <ul
                    aria-label="Accounts without an exposure"
                    className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground"
                >
                    {model.unavailable.map((row) => (
                        <li key={row.key}>
                            {row.account}: {row.reason}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
