import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type EvSourcesCardModel } from './overviewModel';

export function EvSourcesCard({
    model,
}: {
    readonly model: EvSourcesCardModel;
}) {
    return (
        <div className="flex flex-col gap-4">
            {model.plans.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No plan you hold yet.
                </p>
            ) : (
                <Table aria-label="Conversion EV per attempt by plan">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Plan</TableHead>
                            <TableHead className="text-right">
                                Attempt cost
                            </TableHead>
                            <TableHead className="text-right">
                                Pass rate
                            </TableHead>
                            <TableHead className="text-right">
                                Value of a fresh funded account
                            </TableHead>
                            <TableHead className="text-right">
                                Conversion EV per attempt (modeled)
                            </TableHead>
                            <TableHead className="text-right">
                                Conversion EV per attempt (realized)
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {model.plans.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell>{row.plan}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.attemptCost}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.passRate}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.freshFundedValue}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.modeledConversionEv}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.realizedConversionEv}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            {model.accounts.length > 0 && (
                <Table aria-label="Value held in funded progress by account">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Funded account</TableHead>
                            <TableHead>Plan</TableHead>
                            <TableHead className="text-right">
                                Value from its own state
                            </TableHead>
                            <TableHead className="text-right">
                                Value of a fresh funded account
                            </TableHead>
                            <TableHead className="text-right">
                                Held in funded progress ({model.heldLabel})
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {model.accounts.map((row) => (
                            <TableRow key={row.key}>
                                <TableCell>{row.account}</TableCell>
                                <TableCell>{row.plan}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.valueNow}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.freshFundedValue}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row.heldInFundedProgress}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground">
                {model.disclosures.map((disclosure) => (
                    <li key={disclosure}>{disclosure}</li>
                ))}
            </ul>
        </div>
    );
}
