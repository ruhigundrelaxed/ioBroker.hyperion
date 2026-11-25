/**
 * Migration of instance settings from adapter version 0.0.x.
 *
 * 0.0.x stored the port as `json_port` and the priority as `prio`. On upgrade
 * js-controller adds `port`/`priority` with their defaults, so a present legacy
 * key has to win once. The legacy keys are removed so the migration runs only
 * on the first start after the upgrade.
 */

/**
 * Moves legacy keys of `native` to their new names, in place.
 *
 * @returns one description per migrated key; empty if there was nothing to migrate
 */
export function migrateLegacyNative(native: Record<string, unknown>): string[] {
    const migrated: string[] = [];

    if (native.json_port !== undefined) {
        const port = Number(native.json_port);
        if (port > 0) native.port = port;
        migrated.push(`json_port=${native.json_port} -> port`);
        delete native.json_port;
    }
    if (native.prio !== undefined) {
        const priority = Number(native.prio);
        if (priority > 0) native.priority = priority;
        migrated.push(`prio=${native.prio} -> priority`);
        delete native.prio;
    }

    return migrated;
}
