import type {
    ServerInfo,
    EffectInfo,
    ComponentInfo,
    AdjustmentInfo,
    PriorityInfo,
    InstanceInfo,
} from '../types/hyperion';
import { rgbToHex, rgbToHsl, hexToRgb, hslToRgb } from './color-utils';

/**
 * Manages dynamic state creation and synchronization for the Hyperion adapter.
 */
export class StateManager {
    private adapter: ioBroker.Adapter;
    private knownEffects = new Set<string>();
    private knownComponents = new Set<string>();
    private serverType: 'classic' | 'ng' = 'classic';
    private colorSyncLock = false;

    /** Hyperion.ng instance currently selected on this connection */
    activeInstance = 0;

    constructor(adapter: ioBroker.Adapter) {
        this.adapter = adapter;
    }

    /**
     * Initialize all states from serverinfo response.
     */
    async initFromServerInfo(info: ServerInfo): Promise<void> {
        this.serverType = info.serverType;

        // info states
        await this.ensureState('info.serverType', info.serverType, {
            name: 'Server type',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        });
        await this.ensureState('info.serverVersion', '', {
            name: 'Server version',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        });

        // control states
        await this.createControlStates();

        // effects
        await this.syncEffects(info.effects);

        // adjustment
        await this.syncAdjustments(info.adjustment);

        // ng-specific states
        if (info.serverType === 'ng') {
            if (info.components) {
                await this.syncComponents(info.components);
            }
            if (info.priorities) {
                await this.updatePriorities(info.priorities);
            }
            if (info.instances) {
                await this.syncInstances(info.instances);
            }
            await this.ensureState('videomode', info.videomode || '2D', {
                name: 'Video mode',
                type: 'string',
                role: 'text',
                read: true,
                write: true,
                states: { '2D': '2D', '3DSBS': '3DSBS', '3DTAB': '3DTAB' },
            });
        }

        // Extract active color from priorities or activeLedColor
        await this.updateActiveColor(info);
    }

    /**
     * Create all control states.
     */
    private async createControlStates(): Promise<void> {
        await this.ensureChannel('control', 'Control');

        await this.ensureState('control.on', false, {
            name: 'On/Off',
            type: 'boolean',
            role: 'switch',
            read: true,
            write: true,
        });
        await this.ensureState('control.color', '#000000', {
            name: 'Color (HEX)',
            type: 'string',
            role: 'level.color.rgb',
            read: true,
            write: true,
        });
        await this.ensureState('control.red', 0, {
            name: 'Red',
            type: 'number',
            role: 'level.color.red',
            read: true,
            write: true,
            min: 0,
            max: 255,
        });
        await this.ensureState('control.green', 0, {
            name: 'Green',
            type: 'number',
            role: 'level.color.green',
            read: true,
            write: true,
            min: 0,
            max: 255,
        });
        await this.ensureState('control.blue', 0, {
            name: 'Blue',
            type: 'number',
            role: 'level.color.blue',
            read: true,
            write: true,
            min: 0,
            max: 255,
        });
        await this.ensureState('control.hue', 0, {
            name: 'Hue',
            type: 'number',
            role: 'level.color.hue',
            read: true,
            write: true,
            min: 0,
            max: 360,
        });
        await this.ensureState('control.saturation', 0, {
            name: 'Saturation',
            type: 'number',
            role: 'level.color.saturation',
            read: true,
            write: true,
            min: 0,
            max: 100,
            unit: '%',
        });
        await this.ensureState('control.brightness', 0, {
            name: 'Brightness',
            type: 'number',
            role: 'level.dimmer',
            read: true,
            write: true,
            min: 0,
            max: 100,
            unit: '%',
        });
        await this.ensureState('control.activeEffect', '', {
            name: 'Active effect',
            type: 'string',
            role: 'text',
            read: true,
            write: false,
        });
        await this.ensureState('control.selectEffect', '', {
            name: 'Select effect',
            type: 'string',
            role: 'text',
            read: true,
            write: true,
        });
        await this.ensureState('control.clear', false, {
            name: 'Clear priority',
            type: 'boolean',
            role: 'button',
            read: false,
            write: true,
        });
        await this.ensureState('control.clearall', false, {
            name: 'Clear all priorities',
            type: 'boolean',
            role: 'button',
            read: false,
            write: true,
        });
        await this.ensureState('control.priority', 50, {
            name: 'Priority',
            type: 'number',
            role: 'level',
            read: true,
            write: true,
            min: 1,
            max: 999,
        });
    }

    /**
     * Synchronize color states from RGB values. Updates all representations atomically.
     */
    async syncColorFromRgb(r: number, g: number, b: number): Promise<void> {
        if (this.colorSyncLock) return;
        this.colorSyncLock = true;
        try {
            const hex = rgbToHex(r, g, b);
            const [h, s, l] = rgbToHsl(r, g, b);
            await this.adapter.setStateAsync('control.color', hex, true);
            await this.adapter.setStateAsync('control.red', r, true);
            await this.adapter.setStateAsync('control.green', g, true);
            await this.adapter.setStateAsync('control.blue', b, true);
            await this.adapter.setStateAsync('control.hue', h, true);
            await this.adapter.setStateAsync('control.saturation', s, true);
            await this.adapter.setStateAsync('control.brightness', l, true);
        } finally {
            this.colorSyncLock = false;
        }
    }

    /**
     * Synchronize color states from HEX value.
     */
    async syncColorFromHex(hex: string): Promise<void> {
        const [r, g, b] = hexToRgb(hex);
        await this.syncColorFromRgb(r, g, b);
    }

    /**
     * Synchronize color states from HSL values.
     */
    async syncColorFromHsl(h: number, s: number, l: number): Promise<void> {
        const [r, g, b] = hslToRgb(h, s, l);
        await this.syncColorFromRgb(r, g, b);
    }

    /**
     * Update active color from server info.
     */
    private async updateActiveColor(info: ServerInfo): Promise<void> {
        let rgb: number[] | undefined;

        if (info.activeLedColor && info.activeLedColor.length > 0) {
            rgb = info.activeLedColor[0].RGB;
        } else if (info.priorities) {
            const visible = info.priorities.find((p) => p.visible && p.value?.RGB);
            if (visible?.value?.RGB) {
                rgb = visible.value.RGB;
            }
        }

        if (rgb && rgb.length >= 3) {
            await this.syncColorFromRgb(rgb[0], rgb[1], rgb[2]);
        }
    }

    /**
     * Sync effects from server info. Creates/removes effect states as needed.
     */
    async syncEffects(effects: EffectInfo[]): Promise<void> {
        await this.ensureChannel('effects', 'Effects');

        // Build effect name list
        const effectNames = effects.map((e) => e.name);
        await this.ensureState('effects.list', JSON.stringify(effectNames), {
            name: 'Effect list',
            type: 'string',
            role: 'json',
            read: true,
            write: false,
        });

        const currentEffects = new Set<string>();

        for (const effect of effects) {
            const safeName = this.sanitizeName(effect.name);
            currentEffects.add(safeName);

            await this.ensureChannel(`effects.${safeName}`, effect.name);
            await this.ensureState(`effects.${safeName}.activate`, false, {
                name: 'Activate effect',
                type: 'boolean',
                role: 'button',
                read: false,
                write: true,
            });

            // Create states for effect arguments
            if (effect.args) {
                for (const [argName, argValue] of Object.entries(effect.args)) {
                    const safeArg = this.sanitizeName(argName);
                    const common = this.inferCommon(argName, argValue);
                    await this.ensureState(`effects.${safeName}.${safeArg}`, argValue, common);
                }
            }
        }

        // Cleanup removed effects
        for (const old of this.knownEffects) {
            if (!currentEffects.has(old)) {
                await this.adapter.deleteChannelAsync('effects', old);
            }
        }
        this.knownEffects = currentEffects;
    }

    /**
     * Sync components (ng only).
     */
    async syncComponents(components: ComponentInfo[]): Promise<void> {
        await this.ensureChannel('components', 'Components');

        const currentComponents = new Set<string>();
        for (const comp of components) {
            currentComponents.add(comp.name);
            await this.ensureState(`components.${comp.name}`, comp.enabled, {
                name: comp.name,
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
            });
        }

        // Determine master on/off from ALL component
        const allComp = components.find((c) => c.name === 'ALL');
        if (allComp) {
            await this.adapter.setStateAsync('control.on', allComp.enabled, true);
        }

        // Cleanup removed components
        for (const old of this.knownComponents) {
            if (!currentComponents.has(old)) {
                await this.adapter.delObjectAsync(`components.${old}`);
            }
        }
        this.knownComponents = currentComponents;
    }

    /**
     * Update priorities list (ng only).
     */
    async updatePriorities(priorities: PriorityInfo[]): Promise<void> {
        await this.ensureChannel('priorities', 'Priorities');
        await this.ensureState('priorities.list', JSON.stringify(priorities), {
            name: 'Priority list',
            type: 'string',
            role: 'json',
            read: true,
            write: false,
        });

        // Determine active effect from visible priority
        const visible = priorities.find((p) => p.visible);
        if (visible && visible.componentId === 'EFFECT') {
            await this.adapter.setStateAsync('control.activeEffect', visible.owner || '', true);
        } else {
            await this.adapter.setStateAsync('control.activeEffect', '', true);
        }

        // Update active color from visible priority
        if (visible?.value?.RGB) {
            const rgb = visible.value.RGB;
            if (rgb.length >= 3) {
                await this.syncColorFromRgb(rgb[0], rgb[1], rgb[2]);
            }
        }
    }

    /**
     * Sync adjustments.
     */
    async syncAdjustments(adjustments: AdjustmentInfo[]): Promise<void> {
        if (!adjustments || adjustments.length === 0) return;

        await this.ensureChannel('adjustment', 'Adjustment');
        const adj = adjustments[0];

        if (adj.brightness !== undefined) {
            await this.ensureState('adjustment.brightness', adj.brightness, {
                name: 'Brightness',
                type: 'number',
                role: 'level.dimmer',
                read: true,
                write: true,
                min: 0,
                max: 100,
            });
        }

        if (this.serverType === 'ng') {
            const ngFields: Array<{
                key: keyof AdjustmentInfo;
                name: string;
                min: number;
                max: number;
                step?: number;
            }> = [
                { key: 'brightnessCompensation', name: 'Brightness compensation', min: 0, max: 100 },
                { key: 'gammaRed', name: 'Gamma Red', min: 0, max: 5 },
                { key: 'gammaGreen', name: 'Gamma Green', min: 0, max: 5 },
                { key: 'gammaBlue', name: 'Gamma Blue', min: 0, max: 5 },
                { key: 'backlightThreshold', name: 'Backlight threshold', min: 0, max: 100 },
                { key: 'saturationGain', name: 'Saturation gain', min: 0, max: 5 },
            ];

            for (const field of ngFields) {
                const value = adj[field.key];
                if (value !== undefined) {
                    await this.ensureState(`adjustment.${field.key}`, value as number, {
                        name: field.name,
                        type: 'number',
                        role: 'level',
                        read: true,
                        write: true,
                        min: field.min,
                        max: field.max,
                    });
                }
            }
        }
    }

    /**
     * Sync instances (ng only).
     */
    async syncInstances(instances: InstanceInfo[]): Promise<void> {
        await this.ensureChannel('instances', 'Instances');

        // Report the instance this adapter actually controls, not just the first running one
        await this.ensureState('instances.active', this.activeInstance, {
            name: 'Active instance',
            type: 'number',
            role: 'level',
            read: true,
            write: true,
        });

        const list = instances.map((i) => ({
            id: i.instance,
            name: i.friendly_name,
            running: i.running,
        }));
        await this.ensureState('instances.list', JSON.stringify(list), {
            name: 'Instance list',
            type: 'string',
            role: 'json',
            read: true,
            write: false,
        });
    }

    /**
     * Handle subscription update events from Hyperion.ng.
     */
    async handleUpdate(type: string, data: unknown): Promise<void> {
        const d = data as Record<string, unknown>;
        switch (type) {
            case 'components':
                if (Array.isArray(d)) {
                    await this.syncComponents(d as ComponentInfo[]);
                }
                break;
            case 'priorities':
                if (Array.isArray(d)) {
                    await this.updatePriorities(d as PriorityInfo[]);
                }
                break;
            case 'effects':
                if (Array.isArray(d)) {
                    await this.syncEffects(d as EffectInfo[]);
                }
                break;
            case 'adjustment':
                if (Array.isArray(d)) {
                    await this.syncAdjustments(d as AdjustmentInfo[]);
                }
                break;
            case 'instance':
                if (Array.isArray(d)) {
                    await this.syncInstances(d as InstanceInfo[]);
                }
                break;
            case 'videomode':
                if (typeof d === 'string') {
                    await this.adapter.setStateAsync('videomode', d, true);
                } else if (d && typeof d.videomode === 'string') {
                    await this.adapter.setStateAsync('videomode', d.videomode, true);
                }
                break;
            case 'leds':
            case 'led-mapping':
                // LED mapping updates — currently not mapped to states
                break;
            case 'serverinfo':
                // Full serverinfo update from classic polling
                if (d && typeof d === 'object' && 'effects' in d) {
                    await this.initFromServerInfo(d as unknown as ServerInfo);
                }
                break;
        }
    }

    // ===== Helpers =====

    private async ensureChannel(id: string, name: string): Promise<void> {
        await this.adapter.setObjectNotExistsAsync(id, {
            type: 'channel',
            common: { name },
            native: {},
        });
    }

    private async ensureState(id: string, value: unknown, common: Partial<ioBroker.StateCommon>): Promise<void> {
        const fullCommon: ioBroker.StateCommon = {
            name: common.name || id,
            type: (common.type as ioBroker.CommonType) || 'mixed',
            role: common.role || 'state',
            read: common.read !== false,
            write: common.write === true,
            ...common,
        } as ioBroker.StateCommon;

        await this.adapter.setObjectNotExistsAsync(id, {
            type: 'state',
            common: fullCommon,
            native: {},
        });

        // Set the value with ack
        const serialized = typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
        await this.adapter.setStateAsync(id, serialized as ioBroker.StateValue, true);
    }

    private sanitizeName(name: string): string {
        return name.replace(/[.\s]/g, '_').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    }

    private inferCommon(name: string, value: unknown): Partial<ioBroker.StateCommon> {
        if (typeof value === 'number') {
            return { name, type: 'number', role: 'level', read: true, write: true };
        }
        if (typeof value === 'boolean') {
            return { name, type: 'boolean', role: 'switch', read: true, write: true };
        }
        if (typeof value === 'string') {
            return { name, type: 'string', role: 'text', read: true, write: true };
        }
        if (Array.isArray(value)) {
            return { name, type: 'string', role: 'json', read: true, write: true };
        }
        return { name, type: 'string', role: 'text', read: true, write: true };
    }
}
