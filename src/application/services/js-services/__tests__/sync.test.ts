import { handleMessage, initSync, SyncContext } from '@/application/services/js-services/sync-protocol';
import { Types } from '@/application/types';
import { messages } from '@/proto/messages';
import { expect } from '@jest/globals';
import * as random from 'lib0/random';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';

/**
 * Default tracer function for logging messages sent by clients.
 * This function can be replaced with a custom tracer used to assertions etc.
 */
const defaultTracer = (message: messages.IMessage, i: number) => {
  console.debug(`Client ${i} sending message:`, message);
};

const mockSync = (clientCount: number, tracer = defaultTracer): SyncContext[] => {
  const clients: SyncContext[] = [];
  const guid = random.uuidv4();
  for (let i = 0; i < clientCount; i++) {
    const doc = new Y.Doc({ guid });
    const awareness = new awarenessProtocol.Awareness(doc);
    clients.push({
      doc,
      awareness,
      emit: jest.fn(),
      collabType: Types.Document,
    });
  }
  for (let i = 0; i < clientCount; i++) {
    const client = clients[i];
    client.emit = (message: messages.IMessage) => {
      tracer(message, i);
      clients.forEach((otherClient, index) => {
        if (index !== i) {
          handleMessage(otherClient, message.collabMessage!);
        }
      });
    };
  }
  return clients;
};

describe('sync protocol', () => {
  it('should exchange updates between client and server', () => {
    const [local, remote] = mockSync(2);

    initSync(local);
    initSync(remote);

    const txt1 = local.doc.getText('test');
    const txt2 = remote.doc.getText('test');

    // local -> remote
    txt1.insert(0, 'Hello');
    expect(txt2.toString()).toEqual('Hello');

    // remote -> local
    txt2.insert(5, ' World');
    expect(txt1.toString()).toEqual('Hello World');
  });
});
