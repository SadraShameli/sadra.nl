export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function localStorageOrNull(): null | Storage {
    return storageOrNull(() => window.localStorage);
}

export function sessionStorageOrNull(): null | Storage {
    return storageOrNull(() => window.sessionStorage);
}

function storageOrNull(read: () => Storage): null | Storage {
    try {
        return typeof window === 'undefined' ? null : read();
    } catch {
        return null;
    }
}
