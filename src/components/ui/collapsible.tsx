'use client';

import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import * as React from 'react';

function Collapsible({
    ...properties
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
    return (
        <CollapsiblePrimitive.Root data-slot="collapsible" {...properties} />
    );
}

function CollapsibleContent({
    ...properties
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
    return (
        <CollapsiblePrimitive.CollapsibleContent
            data-slot="collapsible-content"
            {...properties}
        />
    );
}

function CollapsibleTrigger({
    ...properties
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
    return (
        <CollapsiblePrimitive.CollapsibleTrigger
            data-slot="collapsible-trigger"
            {...properties}
        />
    );
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
