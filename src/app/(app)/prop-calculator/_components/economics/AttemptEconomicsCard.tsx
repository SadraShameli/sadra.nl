import { Card, CardContent } from '~/components/ui/Card';
import { NOT_APPLICABLE } from '~/lib/format';

import { type AttemptEconomicsCardModel } from './attemptEconomicsModel';

interface AttemptEconomicsCardProperties {
    model: AttemptEconomicsCardModel;
}

export default function AttemptEconomicsCard({
    model,
}: AttemptEconomicsCardProperties) {
    return (
        <Card
            className="app-prop-calculator__attempt-economics gap-2 px-5 py-4"
            data-testid="attempt-economics-card"
        >
            <CardContent className="flex flex-col gap-1.5 px-0">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Attempt economics
                </span>
                {model.reason === null ? (
                    <>
                        <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums">
                            {model.decomposition.map((row) => (
                                <div
                                    className="col-span-2 flex items-center justify-between gap-3"
                                    key={row.label}
                                >
                                    <dt className="text-muted-foreground">
                                        {row.label}
                                    </dt>
                                    <dd className="text-foreground">
                                        {row.valueText}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                            {model.formula}
                        </p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                            {model.economics.fundedValueToAttemptCost.value
                                ?.label ?? NOT_APPLICABLE}
                        </p>
                    </>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        {model.reason}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
