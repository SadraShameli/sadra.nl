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
        <p
            className="text-xs text-amber-400"
            role={notice.isFailure ? 'alert' : 'status'}
        >
            {notice.text}
        </p>
    );
}
