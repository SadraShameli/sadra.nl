export function memoise<T>(build: () => T): () => T {
    let isBuilt = false;
    let value: T;
    return () => {
        if (!isBuilt) {
            value = build();
            isBuilt = true;
        }
        return value;
    };
}
