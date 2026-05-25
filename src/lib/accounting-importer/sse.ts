import 'server-only';

export function asSseResponse<T>(source: AsyncIterable<T>): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            try {
                for await (const event of source) {
                    const payload = `data: ${JSON.stringify(event)}\n\n`;
                    controller.enqueue(encoder.encode(payload));
                }
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                const payload = `event: error\ndata: ${JSON.stringify({
                    message,
                })}\n\n`;
                controller.enqueue(encoder.encode(payload));
            } finally {
                controller.close();
            }
        },
    });
    return new Response(stream, {
        headers: {
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'Content-Type': 'text/event-stream; charset=utf-8',
            'X-Accel-Buffering': 'no',
        },
    });
}
