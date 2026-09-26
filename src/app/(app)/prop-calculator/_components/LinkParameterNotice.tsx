'use client';

import { Alert, AlertDescription } from '~/components/ui/Alert';

import { useCalculatorInputs } from './CalculatorProvider';
import { LabLinkStatus, LinkParameter } from './types';
import { LINK_PARAMETER_LABELS } from './urlState';

const LINK_PARAMETERS: readonly LinkParameter[] = Object.values(LinkParameter);

export function LinkParameterNotice() {
    const { linkParameters } = useCalculatorInputs().state;
    return LINK_PARAMETERS.map((parameter) => {
        const outcome = linkParameters[parameter];
        if (outcome.status !== LabLinkStatus.Rejected) return null;
        const label = LINK_PARAMETER_LABELS[parameter];
        return (
            <Alert className="mb-4" key={parameter} variant="warning">
                <AlertDescription className="text-xs">
                    {`The ${label} in this link or saved scenario was refused (${outcome.issue}), so the ${label} shown did not come from it.`}
                </AlertDescription>
            </Alert>
        );
    });
}
