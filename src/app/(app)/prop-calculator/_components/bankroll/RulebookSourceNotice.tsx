import { Alert, AlertDescription } from '~/components/ui/Alert';

import { type RulebookSource, rulebookSourceNotice } from './rulebookSource';

interface RulebookSourceNoticeProperties {
    source: RulebookSource;
}

export function RulebookSourceNotice({
    source,
}: RulebookSourceNoticeProperties) {
    const notice = rulebookSourceNotice(source);
    if (notice === null) return null;
    return (
        <Alert role={notice.isFailure ? 'alert' : 'status'} variant="warning">
            <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
    );
}
