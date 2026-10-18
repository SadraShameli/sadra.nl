import { ValueOrMissing } from '~/app/(app)/prop-calculator/_components/ValueOrMissing';
import { DetailList } from '~/components/DetailList';
import { PanelSubheading } from '~/components/PanelSubheading';
import { Card, CardContent } from '~/components/ui/card';

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
                <PanelSubheading as="h4">Attempt economics</PanelSubheading>
                {model.reason === null ? (
                    <>
                        <DetailList
                            className="mt-1 tabular-nums"
                            items={model.decomposition.map((row) => ({
                                id: row.label,
                                info: row.infoText,
                                label: row.label,
                                value: <ValueOrMissing value={row.valueText} />,
                            }))}
                        />
                        <p className="mt-1 text-xs wrap-break-word text-muted-foreground">
                            {model.formula}
                        </p>
                        {model.economics.fundedValueToAttemptCost.value ===
                        null ? null : (
                            <p className="text-xs wrap-break-word text-muted-foreground">
                                {
                                    model.economics.fundedValueToAttemptCost
                                        .value.label
                                }
                            </p>
                        )}
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
