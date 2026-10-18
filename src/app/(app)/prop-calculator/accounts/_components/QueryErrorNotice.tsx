import { TriangleAlert } from 'lucide-react';
import { type ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { type TitleTag } from '~/components/ui/title-tag';

import { messageWithConsequence } from './sentenceText';

export enum ErrorNoticeTitle {
    Account = 'The account could not be loaded',
    Accounts = 'The accounts could not be loaded',
    FirmPayoutCount = 'The firm payout count could not be loaded',
    Firms = 'Your firms could not be loaded',
    RebuyLag = 'The rebuy lag could not be measured',
    Rulebook = 'Your rulebook could not be loaded',
    Values = 'Values could not be computed',
}

interface ErrorListBody {
    readonly consequence?: never;
    readonly items: readonly ErrorNoticeItem[];
    readonly message?: never;
}

interface ErrorMessageBody {
    readonly consequence?: string;
    readonly items?: never;
    readonly message: string;
}

interface ErrorNoticeFrame {
    readonly actions?: ReactNode;
    readonly className?: string;
    readonly title?: string;
    readonly titleAs?: TitleTag;
}

interface ErrorNoticeItem {
    readonly key: string;
    readonly text: string;
}

type QueryErrorNoticeProperties = (ErrorListBody | ErrorMessageBody) &
    ErrorNoticeFrame;

export function EngagementsErrorNotice({
    message,
}: {
    readonly message: string;
}) {
    return (
        <QueryErrorNotice
            consequence="Every firm counts as active until they load."
            message={message}
            title="Your firm statuses could not be loaded"
        />
    );
}

export function JournalErrorNotice({ message }: { readonly message: string }) {
    return (
        <QueryErrorNotice
            consequence="The scale gate treats your trade count as zero until it loads."
            message={message}
            title="Your journal could not be loaded"
        />
    );
}

export function QueryErrorNotice(properties: QueryErrorNoticeProperties) {
    const { actions, className, title, titleAs } = properties;
    return (
        <Alert className={className} variant="destructive">
            <TriangleAlert />
            {title !== undefined && (
                <AlertTitle as={titleAs}>{title}</AlertTitle>
            )}
            <AlertDescription>
                <ErrorNoticeBody body={properties} label={title} />
                {actions}
            </AlertDescription>
        </Alert>
    );
}

export function RulebookErrorNotice({ message }: { readonly message: string }) {
    return (
        <QueryErrorNotice
            consequence="This page uses the default thresholds instead of yours until it loads."
            message={message}
            title={ErrorNoticeTitle.Rulebook}
        />
    );
}

export function UnlistedFirmsErrorNotice({
    message,
}: {
    readonly message: string;
}) {
    return (
        <QueryErrorNotice
            consequence="External firms show as an unlisted firm until they load."
            message={message}
            title={ErrorNoticeTitle.Firms}
        />
    );
}

function ErrorNoticeBody({
    body,
    label,
}: {
    readonly body: ErrorListBody | ErrorMessageBody;
    readonly label: string | undefined;
}) {
    if (body.items !== undefined) {
        return (
            <ul
                aria-label={label}
                className="flex list-disc flex-col gap-1 pl-5"
            >
                {body.items.map((item) => (
                    <li key={item.key}>{item.text}</li>
                ))}
            </ul>
        );
    }
    return body.consequence === undefined
        ? body.message
        : messageWithConsequence(body.message, body.consequence);
}
