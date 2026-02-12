import * as net from 'net';
import { EventEmitter } from 'events';

export interface TcpClientOptions {
    host: string;
    port: number;
    reconnect?: boolean;
    reconnectBaseDelay?: number;
    reconnectMaxDelay?: number;
}

/**
 * Reconnecting TCP client for newline-delimited JSON protocols.
 * Emits: 'connect', 'disconnect', 'data' (parsed JSON), 'error'
 */
export class TcpClient extends EventEmitter {
    private socket: net.Socket | null = null;
    private buffer = '';
    private connected = false;
    private destroyed = false;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempts = 0;

    private host: string;
    private port: number;
    private reconnect: boolean;
    private reconnectBaseDelay: number;
    private reconnectMaxDelay: number;

    constructor(options: TcpClientOptions) {
        super();
        this.host = options.host;
        this.port = options.port;
        this.reconnect = options.reconnect !== false;
        this.reconnectBaseDelay = options.reconnectBaseDelay ?? 1000;
        this.reconnectMaxDelay = options.reconnectMaxDelay ?? 30000;
    }

    connect(): void {
        if (this.destroyed) return;
        this.cleanup();

        this.socket = new net.Socket();
        this.buffer = '';

        this.socket.on('connect', () => {
            this.connected = true;
            this.reconnectAttempts = 0;
            this.emit('connect');
        });

        this.socket.on('data', (chunk: Buffer) => {
            this.buffer += chunk.toString('utf-8');
            this.processBuffer();
        });

        this.socket.on('close', () => {
            const wasConnected = this.connected;
            this.connected = false;
            if (wasConnected) {
                this.emit('disconnect');
            }
            this.scheduleReconnect();
        });

        this.socket.on('error', (err: Error) => {
            this.emit('error', err);
        });

        this.socket.connect(this.port, this.host);
    }

    disconnect(): void {
        this.destroyed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.cleanup();
    }

    send(data: Record<string, unknown>): void {
        if (!this.socket || !this.connected) {
            throw new Error('Not connected');
        }
        const json = JSON.stringify(data) + '\n';
        this.socket.write(json);
    }

    isConnected(): boolean {
        return this.connected;
    }

    private processBuffer(): void {
        let newlineIndex: number;
        while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
            const line = this.buffer.slice(0, newlineIndex).trim();
            this.buffer = this.buffer.slice(newlineIndex + 1);
            if (line.length === 0) continue;
            try {
                const parsed = JSON.parse(line);
                this.emit('data', parsed);
            } catch {
                this.emit('error', new Error(`Failed to parse JSON: ${line.slice(0, 200)}`));
            }
        }
    }

    private scheduleReconnect(): void {
        if (this.destroyed || !this.reconnect) return;
        const delay = Math.min(
            this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
            this.reconnectMaxDelay,
        );
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    private cleanup(): void {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
            this.socket = null;
        }
        this.connected = false;
        this.buffer = '';
    }
}
