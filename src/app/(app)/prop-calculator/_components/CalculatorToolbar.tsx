'use client';

import {
    useCalculatorActions,
    useCalculatorInputs,
} from './CalculatorProvider';
import SavedScenarios from './SavedScenarios';
import { buildShareLink, shareLinkForQuery } from './shareLink';
import ShareLinkButton from './ShareLinkButton';

interface CalculatorToolbarProperties {
    ownQuery?: string;
}

export function CalculatorToolbar({ ownQuery }: CalculatorToolbarProperties) {
    return ownQuery === undefined ? (
        <CalculatorStateToolbar />
    ) : (
        <div className="flex items-center justify-end gap-2">
            <ShareLinkButton
                buildLink={(origin, pathname) =>
                    shareLinkForQuery(origin, pathname, ownQuery)
                }
            />
        </div>
    );
}

function CalculatorStateToolbar() {
    const { firms, state } = useCalculatorInputs();
    const { applyState } = useCalculatorActions();
    return (
        <div className="flex items-center justify-end gap-2">
            <ShareLinkButton
                buildLink={(origin, pathname) =>
                    buildShareLink(origin, pathname, state)
                }
            />
            <SavedScenarios firms={firms} onLoad={applyState} state={state} />
        </div>
    );
}
