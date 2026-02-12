// ===== Server Info Types =====

export interface ServerInfo {
    serverType: 'classic' | 'ng';
    effects: EffectInfo[];
    adjustment: AdjustmentInfo[];
    // ng-only fields
    components?: ComponentInfo[];
    priorities?: PriorityInfo[];
    instances?: InstanceInfo[];
    videomode?: string;
    ledMappingType?: string;
    activeLedColor?: Array<{ RGB: number[] }>;
}

export interface EffectInfo {
    name: string;
    file: string;
    args: Record<string, unknown>;
}

export interface AdjustmentInfo {
    id: string;
    brightness?: number;
    brightnessCompensation?: number;
    gammaRed?: number;
    gammaGreen?: number;
    gammaBlue?: number;
    backlightThreshold?: number;
    saturationGain?: number;
    // Classic fields
    redAdjust?: number[];
    greenAdjust?: number[];
    blueAdjust?: number[];
}

export interface ComponentInfo {
    name: string;
    enabled: boolean;
}

export interface PriorityInfo {
    priority: number;
    duration_ms?: number;
    owner?: string;
    componentId?: string;
    origin?: string;
    active: boolean;
    visible: boolean;
    value?: {
        RGB?: number[];
        HSL?: number[];
    };
}

export interface InstanceInfo {
    instance: number;
    friendly_name: string;
    running: boolean;
}

export interface SysInfo {
    hyperion: {
        version: string;
        build: string;
        time: string;
        id: string;
    };
    system: {
        prettyName: string;
        hostName: string;
        domainName: string;
    };
}

// ===== Protocol Request/Response =====

export interface HyperionRequest {
    command: string;
    tan?: number;
    origin?: string;
    [key: string]: unknown;
}

export interface HyperionResponse {
    command: string;
    success: boolean;
    tan?: number;
    info?: Record<string, unknown>;
    error?: string;
    // Subscription data
    data?: Record<string, unknown>;
}

// ===== Config Types =====

export interface HyperionConfig {
    address: string;
    port: number;
    priority: number;
    origin: string;
    reconnectInterval: number;
    token: string;
    pollInterval: number;
}

// ===== Protocol Interface =====

export interface HyperionProtocol {
    readonly type: 'classic' | 'ng';

    getServerInfo(): Promise<ServerInfo>;
    setColor(color: [number, number, number], priority: number, duration?: number): Promise<void>;
    setEffect(name: string, priority: number, args?: Record<string, unknown>, duration?: number): Promise<void>;
    clear(priority: number): Promise<void>;
    clearAll(): Promise<void>;

    // ng-only
    setComponentState?(component: string, state: boolean): Promise<void>;
    setAdjustment?(adjustment: Partial<AdjustmentInfo>): Promise<void>;
    switchInstance?(instance: number): Promise<void>;
    authorize?(token: string): Promise<void>;
    getSysInfo?(): Promise<SysInfo>;
    setVideoMode?(mode: string): Promise<void>;
    subscribe?(events: string[]): void;

    on(event: 'update', handler: (type: string, data: unknown) => void): void;
    off(event: 'update', handler: (type: string, data: unknown) => void): void;
    destroy(): void;
}

// ===== TCP Client Events =====

export interface TcpClientEvents {
    connect: () => void;
    disconnect: () => void;
    data: (data: Record<string, unknown>) => void;
    error: (err: Error) => void;
}
