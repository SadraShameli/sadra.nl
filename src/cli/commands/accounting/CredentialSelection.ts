import { ui } from '~/cli/ui';

interface NamedCredential {
    readonly id: string;
    readonly label: string;
}

export function selectCredentialRow<T extends NamedCredential>(
    rows: readonly T[],
    credentialArgument: string | undefined,
    kindLabel: string,
): null | T {
    if (rows.length === 0) {
        ui.fail(`No ${kindLabel} credential found in the database.`);
        return null;
    }
    if (credentialArgument !== undefined) {
        const wanted = credentialArgument.toLowerCase();
        const match = rows.find(
            (row) =>
                row.id === credentialArgument ||
                row.label.toLowerCase() === wanted,
        );
        if (match === undefined) {
            ui.fail(
                `No ${kindLabel} credential matches "${credentialArgument}":`,
            );
            listCredentials(rows);
        }
        return match ?? null;
    }
    const [onlyRow, ...others] = rows;
    if (onlyRow === undefined || others.length > 0) {
        ui.fail(
            `Multiple ${kindLabel} credentials found; pass --credential <id|label>:`,
        );
        listCredentials(rows);
        return null;
    }
    return onlyRow;
}

function listCredentials(rows: readonly NamedCredential[]): void {
    for (const row of rows) ui.note(`${row.label}  (${row.id})`);
}
