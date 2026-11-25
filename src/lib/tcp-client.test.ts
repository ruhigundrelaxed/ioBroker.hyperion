import { expect } from 'chai';
import { TcpClient } from './tcp-client';
import { FakeHyperion, waitFor } from '../test/fake-hyperion';

describe('TcpClient', () => {
    let server: FakeHyperion;
    let port: number;
    let client: TcpClient;

    beforeEach(async () => {
        server = new FakeHyperion(() => undefined);
        port = await server.listen();
    });

    afterEach(async () => {
        client?.disconnect();
        await server.close();
    });

    async function connect(options: Partial<ConstructorParameters<typeof TcpClient>[0]> = {}): Promise<void> {
        client = new TcpClient({ host: '127.0.0.1', port, reconnectBaseDelay: 20, ...options });
        const connected = new Promise<void>((resolve) => client.once('connect', () => resolve()));
        client.connect();
        await connected;
        // The client may see 'connect' before the server has registered the socket;
        // data pushed in between would go nowhere.
        await waitFor(() => server.clientCount === 1);
    }

    it('connects and sends newline-delimited JSON', async () => {
        await connect();
        expect(client.isConnected()).to.equal(true);
        client.send({ command: 'serverinfo', tan: 1 });
        await waitFor(() => server.received.length === 1);
        expect(server.received[0]).to.deep.equal({ command: 'serverinfo', tan: 1 });
    });

    it('reassembles messages split across chunks and splits several per chunk', async () => {
        await connect();
        const messages: unknown[] = [];
        client.on('data', (d) => messages.push(d));

        server.pushRaw('{"a":1}\n{"b":');
        await new Promise((r) => setTimeout(r, 30));
        server.pushRaw('2}\n\n{"c":3}\n');

        await waitFor(() => messages.length === 3);
        expect(messages).to.deep.equal([{ a: 1 }, { b: 2 }, { c: 3 }]);
    });

    it('reports invalid JSON as error and keeps going', async () => {
        await connect();
        const messages: unknown[] = [];
        const errors: Error[] = [];
        client.on('data', (d) => messages.push(d));
        client.on('error', (e: Error) => errors.push(e));

        server.pushRaw('not json\n{"ok":true}\n');

        await waitFor(() => messages.length === 1);
        expect(errors).to.have.length(1);
        expect(errors[0].message).to.contain('Failed to parse JSON');
        expect(messages).to.deep.equal([{ ok: true }]);
    });

    it('throws when sending while not connected', () => {
        client = new TcpClient({ host: '127.0.0.1', port, reconnect: false });
        expect(() => client.send({ command: 'x' })).to.throw('Not connected');
    });

    it('emits disconnect and reconnects after the server drops the connection', async () => {
        await connect();
        let disconnects = 0;
        client.on('disconnect', () => disconnects++);
        const reconnected = new Promise<void>((resolve) => client.once('connect', () => resolve()));

        server.dropClients();

        await reconnected;
        expect(disconnects).to.equal(1);
        expect(client.isConnected()).to.equal(true);
    });

    it('does not reconnect after disconnect()', async () => {
        await connect();
        let connects = 0;
        client.on('connect', () => connects++);
        client.disconnect();
        await new Promise((r) => setTimeout(r, 150));
        expect(connects).to.equal(0);
        expect(client.isConnected()).to.equal(false);
    });

    it('keeps retrying while the server is unreachable', async () => {
        await server.close();
        const errors: Error[] = [];
        client = new TcpClient({ host: '127.0.0.1', port, reconnectBaseDelay: 10, reconnectMaxDelay: 20 });
        client.on('error', (e: Error) => errors.push(e));
        client.connect();
        await waitFor(() => errors.length >= 3);

        // The server comes back on the same port: the client must find it.
        server = new FakeHyperion(() => undefined);
        await server.listen(port);
        await waitFor(() => client.isConnected(), 3000);
    });
});
