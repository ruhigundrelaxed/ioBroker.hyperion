import { EventEmitter } from 'events';
import type { TcpClient } from './tcp-client';
import type {
    HyperionProtocol,
    ServerInfo,
    HyperionResponse,
    EffectInfo,
    AdjustmentInfo,
} from '../types/hyperion';

/**
 * Classic Hyperion protocol handler.
 * Uses simple FIFO request/response matching (no tan).
 * Periodically polls serverinfo.
 */
export class HyperionClassic extends EventEmitter implements HyperionProtocol {
    readonly type = 'classic' as const;

    private client: TcpClient;
    private priority: number;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private pollInterval: number;
    private responseQueue: Array<{
        resolve: (data: HyperionResponse) => void;
        reject: (err: Error) => void;
        timeout: ReturnType<typeof setTimeout>;
    }> = [];

    constructor(client: TcpClient, priority: number, pollInterval: number) {
        super();
        this.client = client;
        this.priority = priority;
        this.pollInterval = pollInterval * 1000;
        this.onData = this.onData.bind(this);
        this.client.on('data', this.onData);
    }

    private onData(data: Record<string, unknown>): void {
        const pending = this.responseQueue.shift();
        if (pending) {
            clearTimeout(pending.timeout);
            pending.resolve(data as unknown as HyperionResponse);
        }
    }

    private sendCommand(cmd: Record<string, unknown>): Promise<HyperionResponse> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                const idx = this.responseQueue.findIndex((e) => e.resolve === resolve);
                if (idx >= 0) this.responseQueue.splice(idx, 1);
                reject(new Error('Command timeout'));
            }, 10000);
            this.responseQueue.push({ resolve, reject, timeout });
            try {
                this.client.send(cmd);
            } catch (err) {
                clearTimeout(timeout);
                this.responseQueue.pop();
                reject(err);
            }
        });
    }

    async getServerInfo(): Promise<ServerInfo> {
        const resp = await this.sendCommand({ command: 'serverinfo' });
        const info = resp.info as Record<string, unknown> | undefined;
        if (!info) {
            throw new Error('No info in serverinfo response');
        }

        const effects = (info.effects as EffectInfo[]) || [];
        const adjustment = (info.adjustment as AdjustmentInfo[]) || [];

        return {
            serverType: 'classic',
            effects,
            adjustment,
        };
    }

    async setColor(color: [number, number, number], priority: number, duration?: number): Promise<void> {
        const cmd: Record<string, unknown> = {
            command: 'color',
            color,
            priority,
        };
        if (duration !== undefined) {
            cmd.duration = duration;
        }
        const resp = await this.sendCommand(cmd);
        if (!resp.success) {
            throw new Error(resp.error || 'setColor failed');
        }
    }

    async setEffect(name: string, priority: number, args?: Record<string, unknown>, duration?: number): Promise<void> {
        const cmd: Record<string, unknown> = {
            command: 'effect',
            effect: { name, args: args || {} },
            priority,
        };
        if (duration !== undefined) {
            cmd.duration = duration;
        }
        const resp = await this.sendCommand(cmd);
        if (!resp.success) {
            throw new Error(resp.error || 'setEffect failed');
        }
    }

    async clear(priority: number): Promise<void> {
        const resp = await this.sendCommand({
            command: 'clear',
            priority,
        });
        if (!resp.success) {
            throw new Error(resp.error || 'clear failed');
        }
    }

    async clearAll(): Promise<void> {
        const resp = await this.sendCommand({ command: 'clearall' });
        if (!resp.success) {
            throw new Error(resp.error || 'clearAll failed');
        }
    }

    startPolling(): void {
        this.stopPolling();
        this.pollTimer = setInterval(async () => {
            try {
                const info = await this.getServerInfo();
                this.emit('update', 'serverinfo', info);
            } catch {
                // polling error — will be handled by reconnect
            }
        }, this.pollInterval);
    }

    stopPolling(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    destroy(): void {
        this.stopPolling();
        this.client.off('data', this.onData);
        for (const pending of this.responseQueue) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Protocol destroyed'));
        }
        this.responseQueue = [];
        this.removeAllListeners();
    }
}
