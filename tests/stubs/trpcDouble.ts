type Callable = (...args: unknown[]) => unknown;

type DoubleOperation =
    | {
          readonly input: unknown;
          readonly kind: 'filter' | 'key';
          readonly path: readonly string[];
      }
    | {
          readonly input: unknown;
          readonly kind: 'query';
          readonly options: unknown;
          readonly path: readonly string[];
      }
    | {
          readonly kind: 'mutation';
          readonly options: unknown;
          readonly path: readonly string[];
      };

const UTILS_METHOD_BY_CLIENT_METHOD = new Map<string, string>([
    ['cancelQueries', 'cancel'],
    ['ensureQueryData', 'ensureData'],
    ['fetchQuery', 'fetch'],
    ['getQueryData', 'getData'],
    ['invalidateQueries', 'invalidate'],
    ['prefetchQuery', 'prefetch'],
    ['query', 'fetch'],
    ['refetchQueries', 'refetch'],
    ['resetQueries', 'reset'],
    ['setQueryData', 'setData'],
]);

const FILTER_OPTION_METHODS = new Set([
    'infiniteQueryFilter',
    'pathFilter',
    'queryFilter',
]);

const QUERY_OPTION_METHODS = new Set(['infiniteQueryOptions', 'queryOptions']);

const KEY_METHODS = new Set(['pathKey', 'queryKey']);

const operationsByTarget = new WeakMap<object, DoubleOperation>();

const installed: { api: unknown } = { api: null };

export function trpcDoubleQuery<TModule extends object>(
    actual: TModule,
): TModule {
    return new Proxy(actual, {
        get: (target, key, receiver) => {
            const original: unknown = Reflect.get(target, key, receiver);
            if (key === 'useQuery' && isCallable(original)) {
                return (...args: unknown[]) => {
                    const operation = operationOf(args[0]);
                    return operation?.kind === 'query'
                        ? callMethod(
                              installed.api,
                              operation.path,
                              'query',
                              operation.input,
                              operation.options,
                          )
                        : original(...args);
                };
            }
            if (key === 'useMutation' && isCallable(original)) {
                return (...args: unknown[]) => {
                    const operation = operationOf(args[0]);
                    return operation?.kind === 'mutation'
                        ? callMethod(
                              installed.api,
                              operation.path,
                              'mutation',
                              operation.options,
                          )
                        : original(...args);
                };
            }
            if (key === 'useQueryClient' && isCallable(original)) {
                return (...args: unknown[]) =>
                    doubleQueryClient(realQueryClient(original, args));
            }
            return original;
        },
    });
}

export function trpcDoubleReact<TModule extends object>(
    module: TModule,
): TModule & { useTRPC: () => unknown } {
    installed.api = Reflect.get(module, 'api');
    return { ...module, useTRPC: () => operationProxy([]) };
}

function callMethod(
    root: unknown,
    path: readonly string[],
    method: string,
    ...args: unknown[]
): unknown {
    const leaf = descend(root, path);
    if (!isRecord(leaf)) return undefined;
    const target = leaf[method];
    return isCallable(target) ? target.call(leaf, ...args) : undefined;
}

function descend(root: unknown, path: readonly string[]): unknown {
    let node = root;
    for (const segment of path) {
        if (!isRecord(node)) return undefined;
        node = node[segment];
    }
    return node;
}

function doubleQueryClient(real: unknown): unknown {
    return new Proxy(
        {},
        {
            get: (_target, key) => {
                if (typeof key !== 'string' || key === 'then') {
                    return;
                }
                const utilsMethod = UTILS_METHOD_BY_CLIENT_METHOD.get(key);
                const delegate = isRecord(real) ? real[key] : undefined;
                if (utilsMethod === undefined) {
                    return isCallable(delegate)
                        ? delegate.bind(real)
                        : delegate;
                }
                return (...args: unknown[]) => {
                    const operation = operationOf(args[0]);
                    if (operation === undefined) {
                        return isCallable(delegate)
                            ? delegate.call(real, ...args)
                            : undefined;
                    }
                    const utils = callMethod(installed.api, [], 'queryClient');
                    const input =
                        operation.kind === 'mutation'
                            ? undefined
                            : operation.input;
                    const rest =
                        operation.kind === 'query'
                            ? [operation.options]
                            : args.slice(1);
                    return callMethod(
                        utils,
                        operation.path,
                        utilsMethod,
                        input,
                        ...rest,
                    );
                };
            },
        },
    );
}

function isCallable(value: unknown): value is Callable {
    return typeof value === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return (
        (typeof value === 'object' && value !== null) ||
        typeof value === 'function'
    );
}

function operationOf(value: unknown): DoubleOperation | undefined {
    return typeof value === 'object' && value !== null
        ? operationsByTarget.get(value)
        : undefined;
}

function operationProxy(path: readonly string[]): unknown {
    return new Proxy(proxyTarget, {
        get: (_target, key) => {
            if (typeof key !== 'string' || key === 'then') return;
            if (QUERY_OPTION_METHODS.has(key)) {
                return (input?: unknown, options?: unknown) =>
                    tag(
                        { queryKey: [path, input] },
                        { input, kind: 'query', options, path },
                    );
            }
            if (key === 'mutationOptions') {
                return (options?: unknown) =>
                    tag(
                        { mutationKey: [path] },
                        { kind: 'mutation', options, path },
                    );
            }
            if (KEY_METHODS.has(key)) {
                return (input?: unknown) =>
                    tag([path, input], {
                        input: key === 'pathKey' ? undefined : input,
                        kind: 'key',
                        path,
                    });
            }
            if (FILTER_OPTION_METHODS.has(key)) {
                return (input?: unknown) =>
                    tag(
                        { queryKey: [path, input] },
                        {
                            input: key === 'pathFilter' ? undefined : input,
                            kind: 'filter',
                            path,
                        },
                    );
            }
            return operationProxy([...path, key]);
        },
    });
}

function proxyTarget(): void {
    return;
}

function realQueryClient(readClient: Callable, args: unknown[]): unknown {
    try {
        return readClient(...args);
    } catch {
        return undefined;
    }
}

function tag<TTarget extends object>(
    target: TTarget,
    operation: DoubleOperation,
): TTarget {
    operationsByTarget.set(target, operation);
    return target;
}
