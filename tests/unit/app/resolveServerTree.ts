import { cloneElement, isValidElement, type ReactNode } from 'react';

type AsyncServerComponent = (properties: object) => Promise<ReactNode>;

interface ElementProperties {
    readonly children?: ReactNode;
}

export async function resolveServerTree(node: ReactNode): Promise<ReactNode> {
    const rendered = await renderAsyncComponents(node);
    if (isNodeList(rendered)) {
        return Promise.all(rendered.map((child) => resolveServerTree(child)));
    }
    return !isValidElement<ElementProperties>(rendered) ||
        rendered.props.children === undefined
        ? rendered
        : cloneElement(
              rendered,
              undefined,
              await resolveServerTree(rendered.props.children),
          );
}

function isAsyncServerComponent(type: unknown): type is AsyncServerComponent {
    return (
        typeof type === 'function' && type.constructor.name === 'AsyncFunction'
    );
}

function isNodeList(node: ReactNode): node is readonly ReactNode[] {
    return Array.isArray(node);
}

async function renderAsyncComponents(node: ReactNode): Promise<ReactNode> {
    let current = node;
    while (
        isValidElement<ElementProperties>(current) &&
        isAsyncServerComponent(current.type)
    ) {
        current = await current.type(current.props);
    }
    return current;
}
