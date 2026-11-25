import { expect } from 'chai';
import { migrateLegacyNative } from './config-migration';

describe('migrateLegacyNative', () => {
    it('lets the 0.0.x values win over the defaults js-controller added on upgrade', () => {
        const native: Record<string, unknown> = {
            address: '10.0.0.5',
            json_port: 19445,
            prio: 100,
            port: 19444,
            priority: 50,
        };
        const migrated = migrateLegacyNative(native);

        expect(native).to.deep.equal({ address: '10.0.0.5', port: 19445, priority: 100 });
        expect(migrated).to.have.length(2);
    });

    it('accepts legacy values stored as strings', () => {
        const native: Record<string, unknown> = { json_port: '19400', prio: '75', port: 19444, priority: 50 };
        migrateLegacyNative(native);
        expect(native).to.deep.equal({ port: 19400, priority: 75 });
    });

    it('does nothing for a 1.0 configuration', () => {
        const native: Record<string, unknown> = { address: '127.0.0.1', port: 19444, priority: 50 };
        expect(migrateLegacyNative(native)).to.deep.equal([]);
        expect(native).to.deep.equal({ address: '127.0.0.1', port: 19444, priority: 50 });
    });

    it('keeps the default for an unusable legacy value but still removes the key', () => {
        const native: Record<string, unknown> = { json_port: '', prio: 0, port: 19444, priority: 50 };
        const migrated = migrateLegacyNative(native);
        expect(native).to.deep.equal({ port: 19444, priority: 50 });
        expect(migrated).to.have.length(2);
    });

    it('is idempotent', () => {
        const native: Record<string, unknown> = { json_port: 19445, port: 19444 };
        migrateLegacyNative(native);
        expect(migrateLegacyNative(native)).to.deep.equal([]);
        expect(native).to.deep.equal({ port: 19445 });
    });
});
