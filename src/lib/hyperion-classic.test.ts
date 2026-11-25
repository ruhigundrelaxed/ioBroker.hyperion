import { expect } from 'chai';
import { TcpClient } from './tcp-client';
import { HyperionClassic } from './hyperion-classic';
import { FakeHyperion, waitFor, type Command } from '../test/fake-hyperion';

const SERVERINFO = {
    effects: [{ name: 'Knight rider', script: 'knight-rider.py', args: { speed: 1 } }],
    adjustment: [{ id: 'default' }],
};

/** Classic answers without tan, strictly in order. */
function classicAnswer(cmd: Command): Record<string, unknown> {
    return cmd.command === 'serverinfo' ? { success: true, info: SERVERINFO } : { success: true };
}

describe('HyperionClassic', () => {
    let server: FakeHyperion;
    let client: TcpClient;
    let classic: HyperionClassic;

    beforeEach(async () => {
        server = new FakeHyperion(classicAnswer);
        const port = await server.listen();
        client = new TcpClient({ host: '127.0.0.1', port, reconnect: false });
        const connected = new Promise<void>((resolve) => client.once('connect', () => resolve()));
        client.connect();
        await connected;
        await waitFor(() => server.clientCount === 1);
        classic = new HyperionClassic(client, 50, 1);
    });

    afterEach(async () => {
        classic.destroy();
        client.disconnect();
        await server.close();
    });

    it('maps serverinfo', async () => {
        const info = await classic.getServerInfo();
        expect(info.serverType).to.equal('classic');
        expect(info.effects.map((e) => e.name)).to.deep.equal(['Knight rider']);
        expect(info.components).to.equal(undefined);
    });

    it('sends color, effect and clear commands without tan or origin', async () => {
        await classic.setColor([0, 128, 255], 50);
        await classic.setEffect('Knight rider', 60);
        await classic.clear(50);
        await classic.clearAll();

        expect(server.received.map((c) => c.command)).to.deep.equal(['color', 'effect', 'clear', 'clearall']);
        for (const cmd of server.received) {
            expect(cmd).to.not.have.property('tan');
            expect(cmd).to.not.have.property('origin');
        }
        expect(server.received[1].effect).to.deep.equal({ name: 'Knight rider', args: {} });
    });

    it('resolves concurrent commands in the order they were sent', async () => {
        const results = await Promise.all([classic.getServerInfo(), classic.setColor([1, 1, 1], 50)]);
        expect(results[0].serverType).to.equal('classic');
        expect(server.received.map((c) => c.command)).to.deep.equal(['serverinfo', 'color']);
    });

    it('rejects with the error Hyperion reports', async () => {
        server.responder = () => ({ success: false, error: 'Effect not found' });
        let error: Error | undefined;
        await classic.setEffect('nope', 50).catch((e: Error) => (error = e));
        expect(error?.message).to.equal('Effect not found');
    });

    it('polls serverinfo and emits it as update', async () => {
        const updates: string[] = [];
        classic.on('update', (type: string) => updates.push(type));
        classic.startPolling();

        await waitFor(() => updates.length >= 1, 3000);
        classic.stopPolling();
        expect(updates[0]).to.equal('serverinfo');
    });
});
