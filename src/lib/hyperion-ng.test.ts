import { expect } from 'chai';
import { TcpClient } from './tcp-client';
import { HyperionNg } from './hyperion-ng';
import { FakeHyperion, ngAnswer, waitFor, type Command } from '../test/fake-hyperion';

const SERVERINFO = {
    effects: [{ name: 'Rainbow swirl', file: 'rainbow.json', args: { speed: 2 } }],
    adjustment: [{ brightness: 80 }],
    components: [{ name: 'LEDDEVICE', enabled: true }],
    priorities: [{ priority: 240, active: true, visible: true, componentId: 'COLOR' }],
    instance: [
        { instance: 0, running: true, friendly_name: 'TV' },
        { instance: 1, running: true, friendly_name: 'Desk' },
    ],
    videomode: '3DSBS',
};

describe('HyperionNg', () => {
    let server: FakeHyperion;
    let client: TcpClient;
    let ng: HyperionNg;

    beforeEach(async () => {
        server = new FakeHyperion((cmd) =>
            cmd.command === 'serverinfo' ? ngAnswer(cmd, { info: SERVERINFO }) : ngAnswer(cmd),
        );
        const port = await server.listen();
        client = new TcpClient({ host: '127.0.0.1', port, reconnect: false });
        const connected = new Promise<void>((resolve) => client.once('connect', () => resolve()));
        client.connect();
        await connected;
        await waitFor(() => server.clientCount === 1);
        ng = new HyperionNg(client, 50, 'ioBroker');
    });

    afterEach(async () => {
        ng.destroy();
        client.disconnect();
        await server.close();
    });

    function last(command: string): Command {
        const found = server.received.filter((c) => c.command === command);
        expect(found, `no '${command}' received`).to.not.be.empty;
        return found[found.length - 1];
    }

    it('maps serverinfo and subscribes to all updates', async () => {
        const info = await ng.getServerInfo();

        expect(last('serverinfo').subscribe).to.deep.equal(['all']);
        expect(info.serverType).to.equal('ng');
        expect(info.effects.map((e) => e.name)).to.deep.equal(['Rainbow swirl']);
        expect(info.components).to.have.length(1);
        expect(info.instances?.map((i) => i.instance)).to.deep.equal([0, 1]);
        expect(info.videomode).to.equal('3DSBS');
    });

    it('sends origin with color and effect commands', async () => {
        await ng.setColor([255, 0, 0], 50, 1000);
        await ng.setEffect('Rainbow swirl', 60, { speed: 3 });

        expect(last('color')).to.include({ priority: 50, duration: 1000, origin: 'ioBroker' });
        expect(last('color').color).to.deep.equal([255, 0, 0]);
        expect(last('effect')).to.include({ priority: 60, origin: 'ioBroker' });
        expect(last('effect').effect).to.deep.equal({ name: 'Rainbow swirl', args: { speed: 3 } });
    });

    it('does not send origin with other commands (Hyperion.ng rejects it there)', async () => {
        await ng.authorize('secret');
        await ng.clear(50);
        await ng.clearAll();
        await ng.switchInstance(1);
        await ng.setComponentState('LEDDEVICE', false);
        await ng.getServerInfo();

        for (const cmd of server.received) {
            expect(cmd, `${cmd.command} must not carry origin`).to.not.have.property('origin');
        }
        expect(last('authorize')).to.include({ subcommand: 'login', token: 'secret' });
        expect(last('instance')).to.include({ subcommand: 'switchTo', instance: 1 });
        expect(last('componentstate').componentstate).to.deep.equal({ component: 'LEDDEVICE', state: false });
    });

    it('matches responses by tan, even when they arrive out of order', async () => {
        // Hold back all answers, then send them in reverse order.
        const held: Command[] = [];
        server.responder = (cmd) => {
            held.push(cmd);
            return undefined;
        };

        const first = ng.setColor([1, 2, 3], 50);
        const second = ng.clear(50);
        await waitFor(() => held.length === 2);
        expect(held[0].tan).to.not.equal(held[1].tan);

        server.responder = () => undefined;
        server.push(ngAnswer(held[1]));
        server.push({ ...ngAnswer(held[0]), success: false, error: 'first failed' });

        await second;
        let error: Error | undefined;
        await first.catch((e: Error) => (error = e));
        expect(error?.message).to.equal('first failed');
    });

    it('rejects with the error Hyperion.ng reports', async () => {
        server.responder = (cmd) => ({ ...ngAnswer(cmd), success: false, error: 'Invalid params' });
        let error: Error | undefined;
        await ng.authorize('wrong').catch((e: Error) => (error = e));
        expect(error?.message).to.equal('Invalid params');
    });

    it('emits subscription updates', async () => {
        const updates: Array<[string, unknown]> = [];
        ng.on('update', (type: string, data: unknown) => updates.push([type, data]));

        server.push({ command: 'priorities-update', data: { priorities: [] } });
        server.push({ command: 'components-update', data: { name: 'LEDDEVICE', enabled: false } });

        await waitFor(() => updates.length === 2);
        expect(updates[0]).to.deep.equal(['priorities', { priorities: [] }]);
        expect(updates[1][0]).to.equal('components');
    });

    it('rejects pending commands when destroyed', async () => {
        server.responder = () => undefined;
        const pending = ng.clearAll();
        await waitFor(() => server.received.length === 1);

        ng.destroy();

        let error: Error | undefined;
        await pending.catch((e: Error) => (error = e));
        expect(error?.message).to.equal('Protocol destroyed');
    });
});
