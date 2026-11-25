const path = require('path');
const { expect } = require('chai');
const { tests } = require('@iobroker/testing');

require('./mocha.setup.js');
const { FakeHyperion, ngAnswer } = require('../src/test/fake-hyperion');

const SERVERINFO = {
    effects: [{ name: 'Rainbow swirl', file: 'rainbow.json', args: { speed: 2 } }],
    adjustment: [{ brightness: 80 }],
    components: [{ name: 'LEDDEVICE', enabled: true }],
    priorities: [],
    instance: [{ instance: 0, running: true, friendly_name: 'Test' }],
    videomode: '2D',
};

function hyperionNg(cmd) {
    switch (cmd.command) {
        case 'serverinfo':
            return ngAnswer(cmd, { info: SERVERINFO });
        case 'sysinfo':
            return ngAnswer(cmd, { info: { hyperion: { version: '2.0.16' }, system: {} } });
        default:
            return ngAnswer(cmd);
    }
}

async function waitForState(harness, id, predicate, timeoutMs = 20000) {
    const start = Date.now();
    for (;;) {
        const state = await harness.states.getStateAsync(id);
        if (state && predicate(state.val)) return state;
        if (Date.now() - start > timeoutMs) {
            throw new Error(`${id} did not reach the expected value, last: ${JSON.stringify(state && state.val)}`);
        }
        await new Promise((r) => setTimeout(r, 200));
    }
}

// Starts the adapter in a real js-controller environment.
// Without additional tests this only checks that the adapter starts and keeps running,
// which here also covers the case "no Hyperion reachable" (default 127.0.0.1:19444).
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('against a Hyperion.ng server', (getHarness) => {
            let harness;
            let server;

            before(async function () {
                this.timeout(60000);
                harness = getHarness();
                server = new FakeHyperion(hyperionNg);
                const port = await server.listen();
                await harness.changeAdapterConfig('hyperion', { native: { address: '127.0.0.1', port } });
                await harness.startAdapterAndWait();
            });

            after(async () => {
                await harness.stopAdapter();
                await server.close();
            });

            it('detects Hyperion.ng and creates the state tree', async function () {
                this.timeout(30000);
                await waitForState(harness, 'hyperion.0.info.connection', (v) => v === true);
                expect((await harness.states.getStateAsync('hyperion.0.info.serverType')).val).to.equal('ng');
                await waitForState(harness, 'hyperion.0.info.serverVersion', (v) => v === '2.0.16');
                const effects = await harness.states.getStateAsync('hyperion.0.effects.list');
                expect(JSON.parse(effects.val)).to.deep.equal(['Rainbow swirl']);
                expect(await harness.objects.getObjectAsync('hyperion.0.control.color')).to.be.ok;
                expect(await harness.objects.getObjectAsync('hyperion.0.components.LEDDEVICE')).to.be.ok;
            });

            it('sends a color written to control.color to Hyperion', async function () {
                this.timeout(30000);
                await harness.states.setStateAsync('hyperion.0.control.color', { val: '#FF8000', ack: false });

                const start = Date.now();
                let color;
                while (!(color = server.received.find((c) => c.command === 'color'))) {
                    if (Date.now() - start > 10000) throw new Error('no color command received');
                    await new Promise((r) => setTimeout(r, 100));
                }
                expect(color.color).to.deep.equal([255, 128, 0]);
                expect(color.priority).to.equal(50);
                expect(color.origin).to.equal('ioBroker');
            });
        });

        suite('upgrade from 0.0.x', (getHarness) => {
            let harness;
            let server;
            let legacyPort;

            before(async function () {
                this.timeout(60000);
                harness = getHarness();
                server = new FakeHyperion(hyperionNg);
                legacyPort = await server.listen();
                // As after an upgrade: old keys present, new keys filled with defaults by js-controller.
                await harness.changeAdapterConfig('hyperion', {
                    native: { address: '127.0.0.1', json_port: legacyPort, prio: 100, port: 19444, priority: 50 },
                });
                await harness.startAdapterAndWait();
            });

            after(async () => {
                await harness.stopAdapter();
                await server.close();
            });

            it('connects with the 0.0.x port and stores the migrated settings', async function () {
                this.timeout(30000);
                await waitForState(harness, 'hyperion.0.info.connection', (v) => v === true);

                const obj = await harness.objects.getObjectAsync('system.adapter.hyperion.0');
                expect(obj.native.port).to.equal(legacyPort);
                expect(obj.native.priority).to.equal(100);
                expect(obj.native).to.not.have.property('json_port');
                expect(obj.native).to.not.have.property('prio');
            });
        });
    },
});
