import * as utils from '@iobroker/adapter-core';
import { TcpClient } from './lib/tcp-client';
import { HyperionNg } from './lib/hyperion-ng';
import { HyperionClassic } from './lib/hyperion-classic';
import { StateManager } from './lib/state-manager';
import { hexToRgb, hslToRgb } from './lib/color-utils';
import type { HyperionProtocol, HyperionConfig, ServerInfo } from './types/hyperion';

class HyperionAdapter extends utils.Adapter {
    private tcpClient!: TcpClient;
    private protocol: HyperionProtocol | null = null;
    private stateManager!: StateManager;
    private hyperionConfig!: HyperionConfig;
    private currentPriority = 50;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({ ...options, name: 'hyperion' });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * 0.0.x stored the port as `json_port` and the priority as `prio`. On upgrade
     * js-controller adds `port`/`priority` with their defaults, so a present legacy
     * key has to win once. The values are moved into the instance configuration and
     * the legacy keys removed, so this runs only on the first start after the upgrade.
     */
    private async migrateLegacyConfig(nativeConfig: Record<string, unknown>): Promise<void> {
        if (nativeConfig.json_port === undefined && nativeConfig.prio === undefined) {
            return;
        }
        const migrated: string[] = [];
        if (nativeConfig.json_port !== undefined) {
            const port = Number(nativeConfig.json_port);
            if (port > 0) nativeConfig.port = port;
            migrated.push(`json_port=${nativeConfig.json_port} -> port`);
        }
        if (nativeConfig.prio !== undefined) {
            const priority = Number(nativeConfig.prio);
            if (priority > 0) nativeConfig.priority = priority;
            migrated.push(`prio=${nativeConfig.prio} -> priority`);
        }
        this.log.info(`Migrating configuration from 0.0.x: ${migrated.join(', ')}`);

        try {
            const objId = `system.adapter.${this.namespace}`;
            const obj = await this.getForeignObjectAsync(objId);
            if (obj) {
                const native = obj.native as Record<string, unknown>;
                native.port = nativeConfig.port;
                native.priority = nativeConfig.priority;
                delete native.json_port;
                delete native.prio;
                // Changing the instance object restarts the adapter with the new configuration.
                await this.setForeignObjectAsync(objId, obj);
            }
        } catch (err) {
            // Not persisted: this start still uses the migrated values, the next one migrates again.
            this.log.warn(`Could not save migrated configuration: ${(err as Error).message}`);
        }
    }

    private async onReady(): Promise<void> {
        const nativeConfig = this.config as Record<string, unknown>;
        await this.migrateLegacyConfig(nativeConfig);
        this.hyperionConfig = {
            address: (nativeConfig.address as string) || '127.0.0.1',
            port: (nativeConfig.port as number) || 19444,
            priority: (nativeConfig.priority as number) || 50,
            origin: (nativeConfig.origin as string) || 'ioBroker',
            reconnectInterval: (nativeConfig.reconnectInterval as number) || 5,
            token: (nativeConfig.token as string) || '',
            pollInterval: (nativeConfig.pollInterval as number) || 30,
            instance: Number(nativeConfig.instance) || 0,
        };

        this.currentPriority = this.hyperionConfig.priority;
        this.stateManager = new StateManager(this);

        await this.setStateAsync('info.connection', false, true);

        this.tcpClient = new TcpClient({
            host: this.hyperionConfig.address,
            port: this.hyperionConfig.port,
            reconnect: true,
            reconnectBaseDelay: this.hyperionConfig.reconnectInterval * 1000,
            reconnectMaxDelay: 30000,
        });

        this.tcpClient.on('connect', () => this.onTcpConnect());
        this.tcpClient.on('disconnect', () => this.onTcpDisconnect());
        this.tcpClient.on('error', (err: Error) => this.log.debug(`TCP error: ${err.message}`));

        this.log.info(`Connecting to Hyperion at ${this.hyperionConfig.address}:${this.hyperionConfig.port}`);
        this.tcpClient.connect();

        this.subscribeStates('*');
    }

    private async onTcpConnect(): Promise<void> {
        this.log.info('Connected to Hyperion');

        try {
            // Auto-detect protocol by sending serverinfo
            const detected = await this.detectProtocol();
            this.protocol = detected.protocol;
            const serverInfo = detected.serverInfo;

            this.log.info(`Detected Hyperion ${serverInfo.serverType}`);
            await this.setStateAsync('info.connection', true, true);

            // Initialize state tree from server info
            await this.stateManager.initFromServerInfo(serverInfo);

            // Protocol-specific setup
            if (this.protocol.type === 'ng') {
                const ng = this.protocol as HyperionNg;

                // Auth if token configured
                if (this.hyperionConfig.token) {
                    try {
                        await ng.authorize(this.hyperionConfig.token);
                        this.log.info('Authenticated with token');
                    } catch (err) {
                        this.log.warn(`Authentication failed: ${(err as Error).message}`);
                    }
                }

                // Instance selection is per connection, so it has to be repeated after every reconnect
                if (this.hyperionConfig.instance !== 0) {
                    await this.selectInstance(ng, this.hyperionConfig.instance);
                }

                // Get system info for version
                try {
                    const sysInfo = await ng.getSysInfo();
                    await this.setStateAsync('info.serverVersion', sysInfo.hyperion.version, true);
                } catch {
                    this.log.debug('Could not get sysinfo');
                }

                // Subscribe to updates
                ng.on('update', async (type: string, data: unknown) => {
                    try {
                        await this.stateManager.handleUpdate(type, data);
                    } catch (err) {
                        this.log.debug(`Error handling update ${type}: ${(err as Error).message}`);
                    }
                });
            } else {
                // Classic: start polling
                const classic = this.protocol as HyperionClassic;
                classic.on('update', async (type: string, data: unknown) => {
                    try {
                        await this.stateManager.handleUpdate(type, data);
                    } catch (err) {
                        this.log.debug(`Error handling poll update: ${(err as Error).message}`);
                    }
                });
                classic.startPolling();
            }
        } catch (err) {
            this.log.error(`Setup failed: ${(err as Error).message}`);
            await this.setStateAsync('info.connection', false, true);
        }
    }

    /**
     * Switch the connection to another Hyperion.ng instance and reload its state
     * (effects, priorities, adjustments differ per instance).
     */
    private async selectInstance(ng: HyperionNg, instance: number): Promise<void> {
        try {
            await ng.switchInstance(instance);
            this.stateManager.activeInstance = instance;
            this.log.info(`Switched to Hyperion instance ${instance}`);
            await this.stateManager.initFromServerInfo(await ng.getServerInfo());
            await this.setStateAsync('instances.active', instance, true);
        } catch (err) {
            this.log.warn(`Switching to instance ${instance} failed: ${(err as Error).message}`);
        }
    }

    private async onTcpDisconnect(): Promise<void> {
        this.log.warn('Disconnected from Hyperion');
        await this.setStateAsync('info.connection', false, true);

        if (this.protocol) {
            this.protocol.destroy();
            this.protocol = null;
        }
    }

    /**
     * Auto-detect whether we're talking to Classic or Hyperion.ng.
     * Sends a raw serverinfo command and inspects the response.
     */
    private detectProtocol(): Promise<{ protocol: HyperionProtocol; serverInfo: ServerInfo }> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.tcpClient.off('data', handler);
                reject(new Error('Protocol detection timeout'));
            }, 10000);

            const handler = (data: Record<string, unknown>): void => {
                clearTimeout(timeout);
                this.tcpClient.off('data', handler);

                try {
                    const info = data.info as Record<string, unknown> | undefined;
                    if (!info) {
                        reject(new Error('No info in serverinfo response'));
                        return;
                    }

                    const isNg = !!(info.components || info.instance);

                    if (isNg) {
                        const protocol = new HyperionNg(
                            this.tcpClient,
                            this.hyperionConfig.priority,
                            this.hyperionConfig.origin,
                        );
                        // Parse server info
                        const serverInfo: ServerInfo = {
                            serverType: 'ng',
                            effects: (info.effects as ServerInfo['effects']) || [],
                            adjustment: (info.adjustment as ServerInfo['adjustment']) || [],
                            components: (info.components as ServerInfo['components']) || [],
                            priorities: (info.priorities as ServerInfo['priorities']) || [],
                            instances: (info.instance as ServerInfo['instances']) || [],
                            videomode: (info.videomode as string) || '2D',
                            activeLedColor: info.activeLedColor as ServerInfo['activeLedColor'],
                        };
                        resolve({ protocol, serverInfo });
                    } else {
                        const protocol = new HyperionClassic(
                            this.tcpClient,
                            this.hyperionConfig.priority,
                            this.hyperionConfig.pollInterval,
                        );
                        const serverInfo: ServerInfo = {
                            serverType: 'classic',
                            effects: (info.effects as ServerInfo['effects']) || [],
                            adjustment: (info.adjustment as ServerInfo['adjustment']) || [],
                        };
                        resolve({ protocol, serverInfo });
                    }
                } catch (err) {
                    reject(err);
                }
            };

            this.tcpClient.on('data', handler);
            this.tcpClient.send({ command: 'serverinfo' });
        });
    }

    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (!state || state.ack) return;
        if (!this.protocol) {
            this.log.debug('State change ignored — not connected');
            return;
        }

        const parts = id.split('.');
        // Remove adapter namespace prefix (e.g. "hyperion.0.")
        const localId = parts.slice(2).join('.');

        try {
            await this.handleStateChange(localId, state);
        } catch (err) {
            this.log.error(`Error handling state change ${localId}: ${(err as Error).message}`);
        }
    }

    private async handleStateChange(id: string, state: ioBroker.State): Promise<void> {
        if (!this.protocol) return;

        // control.on
        if (id === 'control.on') {
            if (this.protocol.type === 'ng') {
                const ng = this.protocol as HyperionNg;
                await ng.setComponentState('ALL', !!state.val);
            } else {
                if (state.val) {
                    // Turn on: set to last known color
                    const colorState = await this.getStateAsync('control.color');
                    const hex = colorState?.val as string || '#FFFFFF';
                    const [r, g, b] = hexToRgb(hex);
                    await this.protocol.setColor([r, g, b], this.currentPriority);
                } else {
                    await this.protocol.clearAll();
                }
            }
            return;
        }

        // control.color
        if (id === 'control.color') {
            const hex = String(state.val).replace(/^#/, '');
            if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
                this.log.warn(`Invalid color value: ${state.val}`);
                return;
            }
            const [r, g, b] = hexToRgb(hex);
            await this.protocol.setColor([r, g, b], this.currentPriority);
            await this.stateManager.syncColorFromRgb(r, g, b);
            return;
        }

        // control.red / green / blue
        if (id === 'control.red' || id === 'control.green' || id === 'control.blue') {
            const rState = await this.getStateAsync('control.red');
            const gState = await this.getStateAsync('control.green');
            const bState = await this.getStateAsync('control.blue');
            const r = id === 'control.red' ? Number(state.val) : Number(rState?.val ?? 0);
            const g = id === 'control.green' ? Number(state.val) : Number(gState?.val ?? 0);
            const b = id === 'control.blue' ? Number(state.val) : Number(bState?.val ?? 0);
            await this.protocol.setColor([r, g, b], this.currentPriority);
            await this.stateManager.syncColorFromRgb(r, g, b);
            return;
        }

        // control.hue / saturation / brightness
        if (id === 'control.hue' || id === 'control.saturation' || id === 'control.brightness') {
            const hState = await this.getStateAsync('control.hue');
            const sState = await this.getStateAsync('control.saturation');
            const lState = await this.getStateAsync('control.brightness');
            const h = id === 'control.hue' ? Number(state.val) : Number(hState?.val ?? 0);
            const s = id === 'control.saturation' ? Number(state.val) : Number(sState?.val ?? 0);
            const l = id === 'control.brightness' ? Number(state.val) : Number(lState?.val ?? 0);
            const [r, g, b] = hslToRgb(h, s, l);
            await this.protocol.setColor([r, g, b], this.currentPriority);
            await this.stateManager.syncColorFromHsl(h, s, l);
            return;
        }

        // control.selectEffect
        if (id === 'control.selectEffect') {
            const effectName = String(state.val);
            if (effectName) {
                await this.protocol.setEffect(effectName, this.currentPriority);
                await this.setStateAsync('control.activeEffect', effectName, true);
            }
            return;
        }

        // control.clear
        if (id === 'control.clear') {
            await this.protocol.clear(this.currentPriority);
            return;
        }

        // control.clearall
        if (id === 'control.clearall') {
            await this.protocol.clearAll();
            return;
        }

        // control.priority
        if (id === 'control.priority') {
            this.currentPriority = Number(state.val) || 50;
            await this.setStateAsync('control.priority', this.currentPriority, true);
            return;
        }

        // effects.*.activate
        if (id.startsWith('effects.') && id.endsWith('.activate')) {
            const effectPath = id.replace('.activate', '');
            // Read effect arguments from sibling states
            const objs = await this.getObjectListAsync({
                startkey: `${this.namespace}.${effectPath}.`,
                endkey: `${this.namespace}.${effectPath}.\u9999`,
            });

            const args: Record<string, unknown> = {};
            let effectName = '';

            // We need to figure out the real effect name from the effect list
            const listState = await this.getStateAsync('effects.list');
            if (listState?.val) {
                const effectList: string[] = JSON.parse(String(listState.val));
                const pathParts = effectPath.split('.');
                const safeName = pathParts[pathParts.length - 1];
                // Find matching effect by comparing sanitized names
                effectName = effectList.find((n) =>
                    n.replace(/[.\s]/g, '_').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() === safeName,
                ) || safeName;
            }

            for (const obj of objs.rows) {
                const objId = obj.id.split('.').pop()!;
                if (objId === 'activate') continue;
                const argState = await this.getStateAsync(obj.id.replace(`${this.namespace}.`, ''));
                if (argState?.val !== undefined && argState.val !== null) {
                    args[objId] = argState.val;
                }
            }

            if (effectName) {
                await this.protocol.setEffect(effectName, this.currentPriority, Object.keys(args).length > 0 ? args : undefined);
                await this.setStateAsync('control.activeEffect', effectName, true);
            }
            return;
        }

        // components.* (ng only)
        if (id.startsWith('components.') && this.protocol.type === 'ng') {
            const ng = this.protocol as HyperionNg;
            const component = id.replace('components.', '');
            await ng.setComponentState(component, !!state.val);
            return;
        }

        // adjustment.*
        if (id.startsWith('adjustment.')) {
            const field = id.replace('adjustment.', '');
            if (this.protocol.type === 'ng') {
                const ng = this.protocol as HyperionNg;
                await ng.setAdjustment({ [field]: state.val });
            }
            return;
        }

        // instances.active (ng only)
        if (id === 'instances.active' && this.protocol.type === 'ng') {
            await this.selectInstance(this.protocol as HyperionNg, Number(state.val));
            return;
        }

        // videomode (ng only)
        if (id === 'videomode' && this.protocol.type === 'ng') {
            const ng = this.protocol as HyperionNg;
            await ng.setVideoMode(String(state.val));
            return;
        }
    }

    private async onUnload(callback: () => void): Promise<void> {
        try {
            if (this.protocol) {
                this.protocol.destroy();
                this.protocol = null;
            }
            if (this.tcpClient) {
                this.tcpClient.disconnect();
            }
            await this.setStateAsync('info.connection', false, true);
        } catch {
            // ignore errors during cleanup
        }
        callback();
    }
}

if (require.main !== module) {
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new HyperionAdapter(options);
} else {
    (() => new HyperionAdapter())();
}
