import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '~/components/ui/Table';

import { type ReplacementCardModel } from './overviewModel';
import { SampleBadge } from './SampleBadge';

export function ReplacementCard({
    model,
}: {
    readonly model: ReplacementCardModel;
}) {
    return model.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
            No account with a modeled plan yet.
        </p>
    ) : (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Attempts</TableHead>
                    <TableHead className="text-right">
                        Attempts per funded
                    </TableHead>
                    <TableHead className="text-right">Rebuy lag</TableHead>
                    <TableHead className="text-right">
                        Rebuy lag used by default
                    </TableHead>
                    <TableHead className="text-right">
                        Replacements not measured
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {model.rows.map((row) => (
                    <TableRow key={row.key}>
                        <TableCell>{row.plan}</TableCell>
                        <TableCell className="text-right tabular-nums">
                            <span className="inline-flex items-center gap-1.5">
                                {row.attempts}
                                <SampleBadge level={row.attemptsSampleLevel} />
                            </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.attemptsPerFunded}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.lag}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.rebuyLag}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.unmeasured}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
