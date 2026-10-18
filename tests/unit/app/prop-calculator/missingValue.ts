import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MissingValue } from '~/components/MissingValue';

const MISSING_VALUE_LABEL = 'Not available';

export const MISSING_REASON_BUTTON_SELECTOR = `button[aria-label="About ${MISSING_VALUE_LABEL}"]`;

export function missingValueText(): string {
    const template = document.createElement('template');
    template.innerHTML = renderToStaticMarkup(createElement(MissingValue));
    return template.content.textContent.trim();
}
