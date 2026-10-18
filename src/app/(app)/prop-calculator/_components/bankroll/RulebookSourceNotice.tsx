import { InfoNote } from '~/components/InfoNote';
import { Alert, AlertDescription } from '~/components/ui/alert';

import { type RulebookSource, rulebookSourceNotice } from './rulebookSource';

interface RulebookSourceNoticeProperties {
    source: RulebookSource;
}

export function RulebookSourceNotice({
    source,
}: RulebookSourceNoticeProperties) {
    const notice = rulebookSourceNotice(source);
    if (notice === null) return null;
    return notice.isFailure ? (
        <Alert variant="destructive">
            <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
    ) : (
        <InfoNote role="status">{notice.text}</InfoNote>
    );
}
