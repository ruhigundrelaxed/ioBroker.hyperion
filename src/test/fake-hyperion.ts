import * as net from 'net';

export type Command = Record<string, unknown>;
/** Returns the response for a command, or undefined to stay silent. */
export type Responder = (cmd: Command) => Record<string, unknown> | undefined;

/**
 * A minimal stand-in for a Hyperion JSON server: newline-delimited JSON over TCP.
 * Records every command it receives and answers through a replaceable responder.
 */
export class FakeHyperion {
    readonly received: Command[] = [];
    private server = net.createServer((socket) => this.onConnection(socket));
    private sockets = new Set<net.Socket>();
    responder: Responder;

    constructor(responder: Responder) {
        this.responder = responder;
    }

    /** Starts listening on localhost (on a free port unless one is given) and returns the port. */
    listen(port = 0): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(port, '127.0.0.1', () => {
                resolve((this.server.address() as net.AddressInfo).port);
            });
        });
    }

    /** Sends an unsolicited message to all clients (e.g. a subscription update). */
    push(message: Record<string, unknown>): void {
        for (const socket of this.sockets) socket.write(JSON.stringify(message) + '\n');
    }

    /** Sends raw bytes to all clients, to test framing. */
    pushRaw(data: string): void {
        for (const socket of this.sockets) socket.write(data);
    }

    /** Drops all client connections but keeps listening. */
    dropClients(): void {
        for (const socket of this.sockets) socket.destroy();
        this.sockets.clear();
    }

    get clientCount(): number {
        return this.sockets.size;
    }

    close(): Promise<void> {
        this.dropClients();
        return new Promise((resolve) => this.server.close(() => resolve()));
    }

    private onConnection(socket: net.Socket): void {
        this.sockets.add(socket);
        socket.on('close', () => this.sockets.delete(socket));
        socket.on('error', () => undefined);
        let buffer = '';
        socket.on('data', (chunk) => {
            buffer += chunk.toString('utf-8');
            let nl: number;
            while ((nl = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, nl).trim();
                buffer = buffer.slice(nl + 1);
                if (!line) continue;
                const cmd = JSON.parse(line) as Command;
                this.received.push(cmd);
                const answer = this.responder(cmd);
                if (answer) socket.write(JSON.stringify(answer) + '\n');
            }
        });
    }
}

/** Waits until `predicate` is true, polling every 10 ms. */
export async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) throw new Error('waitFor: timed out');
        await new Promise((r) => setTimeout(r, 10));
    }
}

/** Typical Hyperion.ng answer: echoes command and tan, success unless told otherwise. */
export function ngAnswer(cmd: Command, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { command: cmd.command, tan: cmd.tan, success: true, ...extra };
}
