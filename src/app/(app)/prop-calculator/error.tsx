'use client';

import {
    SectionError,
    type SectionErrorProperties,
} from '~/components/SectionError';

export default function PropCalculatorError(properties: SectionErrorProperties) {
    return <SectionError {...properties} section="The prop calculator" />;
}
