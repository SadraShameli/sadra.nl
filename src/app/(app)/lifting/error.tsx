'use client';

import {
    SectionError,
    type SectionErrorProperties,
} from '~/components/SectionError';

export default function LiftingError(properties: SectionErrorProperties) {
    return <SectionError {...properties} section="Lifting" />;
}
