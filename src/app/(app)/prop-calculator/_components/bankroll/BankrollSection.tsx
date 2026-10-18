import { type ReactNode } from 'react';

import { InputsBesideResults } from '~/components/InputsBesideResults';
import { ToolPanel } from '~/components/ToolPanel';
import { FieldGroup } from '~/components/ui/field';

interface BankrollSectionProperties {
    readonly headingId: string;
    readonly info: ReactNode;
    readonly inputs: ReactNode;
    readonly isComputing?: boolean;
    readonly results: ReactNode;
    readonly title: string;
}

export function BankrollSection({
    headingId,
    info,
    inputs,
    isComputing = false,
    results,
    title,
}: BankrollSectionProperties) {
    return (
        <section aria-labelledby={headingId}>
            <ToolPanel
                info={info}
                isComputing={isComputing}
                title={title}
                titleId={headingId}
            >
                <InputsBesideResults
                    inputs={<FieldGroup className="gap-4">{inputs}</FieldGroup>}
                    results={results}
                />
            </ToolPanel>
        </section>
    );
}
