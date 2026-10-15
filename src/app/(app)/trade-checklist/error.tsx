'use client';

import {
    SectionError,
    type SectionErrorProperties,
} from '~/components/SectionError';

export default function TradeChecklistError(properties: SectionErrorProperties) {
    return <SectionError {...properties} section="The trade checklist" />;
}
