const UNSELECTED_ID_KEY = '';

export function idSelectKey(id: number): string {
    return id > 0 ? String(id) : UNSELECTED_ID_KEY;
}
