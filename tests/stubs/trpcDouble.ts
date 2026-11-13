type Callable = (...args: unknown[]) => unknown;

type DoubleOperation =
    | {
          readonly filters: unknown;
          readonly input: unknown;
          readonly kind: 'filter';
          readonly path: readonly string[];
      }
    | {
          readonly input: unknown;
          readonly kind: 'key';
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

const MISSING_QUERY_CLIENT_MESSAGE = 'No QueryClient set';

const operationsByTarget = new WeakMap<object, DoubleOperation>();

const installed: { procedures: unknown } = { procedures: null };

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
                              installed.procedures,
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
                              installed.procedures,
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
    installed.procedures = Reflect.get(module, 'procedures');
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
                    const utils = callMethod(
                        installed.procedures,
                        [],
                        'queryClient',
                    );
                    const input =
                        operation.kind === 'mutation'
                            ? undefined
                            : operation.input;
                    const rest = restArguments(operation, args);
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
                return (...args: unknown[]) => {
                    const isPathFilter = key === 'pathFilter';
                    const input = isPathFilter ? undefined : args[0];
                    return tag(
                        { queryKey: [path, input] },
                        {
                            filters: isPathFilter ? args[0] : args[1],
                            input,
                            kind: 'filter',
                            path,
                        },
                    );
                };
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
    } catch (error) {
        if (
            error instanceof Error &&
            error.message.startsWith(MISSING_QUERY_CLIENT_MESSAGE)
        ) {
            return undefined;
        }
        throw error;
    }
}

function restArguments(
    operation: DoubleOperation,
    args: readonly unknown[],
): unknown[] {
    switch (operation.kind) {
        case 'filter': {
            return operation.filters === undefined ? [] : [operation.filters];
        }
        case 'key': {
            return args.slice(1);
        }
        case 'mutation': {
            return [];
        }
        case 'query': {
            return [operation.options];
        }
    }
}

function tag<TTarget extends object>(
    target: TTarget,
    operation: DoubleOperation,
): TTarget {
    operationsByTarget.set(target, operation);
    return target;
}
