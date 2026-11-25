import { EventEmitter } from 'events';
import type { TcpClient } from './tcp-client';
import type {
    HyperionProtocol,
    ServerInfo,
    SysInfo,
    HyperionResponse,
    AdjustmentInfo,
    EffectInfo,
    ComponentInfo,
    PriorityInfo,
    InstanceInfo,
} from '../types/hyperion';

interface PendingRequest {
    resolve: (data: HyperionResponse) => void;
    reject: (err: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

/**
 * Hyperion.ng protocol handler.
 * Uses transaction numbers (tan) for request/response matching.
 * Supports subscriptions for real-time updates.
 */
export class HyperionNg extends EventEmitter implements HyperionProtocol {
    readonly type = 'ng' as const;

    private client: TcpClient;
    private priority: number;
    private origin: string;
    private tanCounter = 1;
    private pending = new Map<number, PendingRequest>();

    constructor(client: TcpClient, priority: number, origin: string) {
        super();
        this.client = client;
        this.priority = priority;
        this.origin = origin;
        this.onData = this.onData.bind(this);
        this.client.on('data', this.onData);
    }

    private onData(data: Record<string, unknown>): void {
        const resp = data as unknown as HyperionResponse;

        // Check if this is a response to a pending request
        if (resp.tan !== undefined && this.pending.has(resp.tan)) {
            const req = this.pending.get(resp.tan)!;
            this.pending.delete(resp.tan);
            clearTimeout(req.timeout);
            req.resolve(resp);
            return;
        }

        // Subscription update — command contains hyphen like "priorities-update"
        const cmd = resp.command || '';
        if (cmd.includes('-update')) {
            const type = cmd.replace('-update', '');
            this.emit('update', type, resp.data);
            return;
        }

        // Unmatched response — could be an event or auth response without tan
        if (resp.command === 'authorize-tokenRequired') {
            this.emit('update', 'tokenRequired', resp.info);
        }
    }

    private nextTan(): number {
        return this.tanCounter++;
    }

    private sendCommand(cmd: Record<string, unknown>, timeout = 10000): Promise<HyperionResponse> {
        return new Promise((resolve, reject) => {
            const tan = this.nextTan();
            const timer = setTimeout(() => {
                this.pending.delete(tan);
                reject(new Error(`Command timeout: ${cmd.command}`));
            }, timeout);
            this.pending.set(tan, { resolve, reject, timeout: timer });
            // Hyperion.ng validates strictly: "origin" is only part of the color/effect schema,
            // any other command (e.g. authorize) is rejected with "Invalid params" if it is present.
            const withOrigin = cmd.command === 'color' || cmd.command === 'effect';
            try {
                this.client.send(withOrigin ? { ...cmd, tan, origin: this.origin } : { ...cmd, tan });
            } catch (err) {
                clearTimeout(timer);
                this.pending.delete(tan);
                reject(err);
            }
        });
    }

    async getServerInfo(): Promise<ServerInfo> {
        const resp = await this.sendCommand({ command: 'serverinfo', subscribe: ['all'] });
        const info = resp.info as Record<string, unknown> | undefined;
        if (!info) {
            throw new Error('No info in serverinfo response');
        }

        return {
            serverType: 'ng',
            effects: (info.effects as EffectInfo[]) || [],
            adjustment: (info.adjustment as AdjustmentInfo[]) || [],
            components: (info.components as ComponentInfo[]) || [],
            priorities: (info.priorities as PriorityInfo[]) || [],
            instances: (info.instance as InstanceInfo[]) || [],
            videomode: (info.videomode as string) || '2D',
            ledMappingType: (info.ledMappingType as string) || 'multicolor_mean',
            activeLedColor: info.activeLedColor as Array<{ RGB: number[] }> | undefined,
        };
    }

    async setColor(color: [number, number, number], priority: number, duration?: number): Promise<void> {
        const cmd: Record<string, unknown> = {
            command: 'color',
            color,
            priority,
        };
        if (duration !== undefined) cmd.duration = duration;
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
        if (duration !== undefined) cmd.duration = duration;
        const resp = await this.sendCommand(cmd);
        if (!resp.success) {
            throw new Error(resp.error || 'setEffect failed');
        }
    }

    async clear(priority: number): Promise<void> {
        const resp = await this.sendCommand({ command: 'clear', priority });
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

    async setComponentState(component: string, state: boolean): Promise<void> {
        const resp = await this.sendCommand({
            command: 'componentstate',
            componentstate: { component, state },
        });
        if (!resp.success) {
            throw new Error(resp.error || 'setComponentState failed');
        }
    }

    async setAdjustment(adjustment: Partial<AdjustmentInfo>): Promise<void> {
        const resp = await this.sendCommand({
            command: 'adjustment',
            adjustment,
        });
        if (!resp.success) {
            throw new Error(resp.error || 'setAdjustment failed');
        }
    }

    async switchInstance(instance: number): Promise<void> {
        const resp = await this.sendCommand({
            command: 'instance',
            subcommand: 'switchTo',
            instance,
        });
        if (!resp.success) {
            throw new Error(resp.error || 'switchInstance failed');
        }
    }

    async authorize(token: string): Promise<void> {
        const resp = await this.sendCommand({
            command: 'authorize',
            subcommand: 'login',
            token,
        });
        if (!resp.success) {
            throw new Error(resp.error || 'authorize failed');
        }
    }

    async getSysInfo(): Promise<SysInfo> {
        const resp = await this.sendCommand({ command: 'sysinfo' });
        const info = resp.info as unknown as SysInfo;
        if (!info) {
            throw new Error('No info in sysinfo response');
        }
        return info;
    }

    async setVideoMode(mode: string): Promise<void> {
        const resp = await this.sendCommand({
            command: 'videomode',
            videoMode: mode,
        });
        if (!resp.success) {
            throw new Error(resp.error || 'setVideoMode failed');
        }
    }

    subscribe(events: string[]): void {
        // Subscriptions are already included in serverinfo call with subscribe: ['all']
        // This method can be used for additional explicit subscriptions
        try {
            for (const event of events) {
                this.client.send({
                    command: event,
                    subcommand: 'subscribe',
                    tan: this.nextTan(),
                });
            }
        } catch {
            // Connection might not be ready yet
        }
    }

    destroy(): void {
        this.client.off('data', this.onData);
        for (const [, req] of this.pending) {
            clearTimeout(req.timeout);
            req.reject(new Error('Protocol destroyed'));
        }
        this.pending.clear();
        this.removeAllListeners();
    }
}
