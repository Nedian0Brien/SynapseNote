import { describe, expect, test } from 'bun:test';
import {
  NO_TRUSTED_PROXY,
  resolveClientAddress,
  resolveClientProtocolIsSecure,
  type TrustedProxyPolicy,
} from './trusted-proxy.ts';

const ONE_HOP: TrustedProxyPolicy = { hops: 1 };
const TWO_HOPS: TrustedProxyPolicy = { hops: 2 };

describe('resolveClientAddress — direct exposure (hops: 0)', () => {
  test('returns the socket peer', () => {
    expect(
      resolveClientAddress(NO_TRUSTED_PROXY, {
        socketAddress: '203.0.113.9',
        forwardedFor: undefined,
      }),
    ).toEqual({ ok: true, address: '203.0.113.9' });
  });

  test('ignores X-Forwarded-For entirely', () => {
    // The load-bearing case: a directly-reachable server cannot tell an
    // operator's proxy from a client that typed the header, so a spoofed
    // loopback address must not become the effective client.
    expect(
      resolveClientAddress(NO_TRUSTED_PROXY, {
        socketAddress: '203.0.113.9',
        forwardedFor: '127.0.0.1',
      }),
    ).toEqual({ ok: true, address: '203.0.113.9' });
  });

  test('fails when the socket has no peer', () => {
    expect(
      resolveClientAddress(NO_TRUSTED_PROXY, {
        socketAddress: undefined,
        forwardedFor: '203.0.113.9',
      }),
    ).toEqual({ ok: false, reason: 'socket-peer-absent' });
  });
});

describe('resolveClientAddress — one proxy in front', () => {
  test('takes the rightmost entry, which the proxy wrote', () => {
    expect(
      resolveClientAddress(ONE_HOP, {
        socketAddress: '127.0.0.1',
        forwardedFor: '203.0.113.9',
      }),
    ).toEqual({ ok: true, address: '203.0.113.9' });
  });

  test('ignores attacker-supplied entries to the left of the trusted hop', () => {
    // The client sent `X-Forwarded-For: 127.0.0.1` hoping to look local; the
    // proxy appended the address it actually saw. Counting from the right
    // makes the forged prefix structurally unreachable.
    expect(
      resolveClientAddress(ONE_HOP, {
        socketAddress: '127.0.0.1',
        forwardedFor: '127.0.0.1, 203.0.113.9',
      }),
    ).toEqual({ ok: true, address: '203.0.113.9' });
  });

  test('treats a repeated header as one comma-joined chain', () => {
    expect(
      resolveClientAddress(ONE_HOP, {
        socketAddress: '127.0.0.1',
        forwardedFor: ['127.0.0.1', '203.0.113.9'],
      }),
    ).toEqual({ ok: true, address: '203.0.113.9' });
  });

  test('tolerates whitespace and empty members', () => {
    expect(
      resolveClientAddress(ONE_HOP, {
        socketAddress: '127.0.0.1',
        forwardedFor: '  ,  203.0.113.9  ,  ',
      }),
    ).toEqual({ ok: true, address: '203.0.113.9' });
  });

  test('resolves IPv6 and IPv4-mapped forms', () => {
    expect(
      resolveClientAddress(ONE_HOP, {
        socketAddress: '::1',
        forwardedFor: '2001:db8::1',
      }),
    ).toEqual({ ok: true, address: '2001:db8::1' });
    expect(
      resolveClientAddress(ONE_HOP, {
        socketAddress: '::1',
        forwardedFor: '::ffff:203.0.113.9',
      }),
    ).toEqual({ ok: true, address: '::ffff:203.0.113.9' });
  });

  test('fails when the header is absent', () => {
    // A declared proxy that sent no header means the request bypassed the
    // chain. Falling back to the socket peer here would hand every direct
    // caller the proxy's loopback address.
    expect(
      resolveClientAddress(ONE_HOP, {
        socketAddress: '127.0.0.1',
        forwardedFor: undefined,
      }),
    ).toEqual({ ok: false, reason: 'forwarded-header-absent' });
  });

  test('fails when the header holds only empty members', () => {
    expect(
      resolveClientAddress(ONE_HOP, {
        socketAddress: '127.0.0.1',
        forwardedFor: ' , , ',
      }),
    ).toEqual({ ok: false, reason: 'forwarded-chain-too-short' });
  });

  test('fails on an address token that could corrupt a log line', () => {
    expect(
      resolveClientAddress(ONE_HOP, {
        socketAddress: '127.0.0.1',
        forwardedFor: 'evil\n203.0.113.9',
      }),
    ).toEqual({ ok: false, reason: 'forwarded-address-malformed' });
  });

  test('fails on a hostname rather than an address', () => {
    expect(
      resolveClientAddress(ONE_HOP, {
        socketAddress: '127.0.0.1',
        forwardedFor: 'attacker.example.com',
      }),
    ).toEqual({ ok: false, reason: 'forwarded-address-malformed' });
  });
});

describe('resolveClientAddress — two proxies in front', () => {
  test('counts two from the right', () => {
    expect(
      resolveClientAddress(TWO_HOPS, {
        socketAddress: '127.0.0.1',
        forwardedFor: '203.0.113.9, 10.0.0.2',
      }),
    ).toEqual({ ok: true, address: '203.0.113.9' });
  });

  test('still ignores a forged prefix', () => {
    expect(
      resolveClientAddress(TWO_HOPS, {
        socketAddress: '127.0.0.1',
        forwardedFor: '127.0.0.1, 203.0.113.9, 10.0.0.2',
      }),
    ).toEqual({ ok: true, address: '203.0.113.9' });
  });

  test('fails when the chain is shorter than the declared hop count', () => {
    // Declaring two hops and receiving one means the request skipped a proxy.
    // Accepting the single entry would let a caller who reaches the inner
    // proxy directly choose their own address.
    expect(
      resolveClientAddress(TWO_HOPS, {
        socketAddress: '127.0.0.1',
        forwardedFor: '203.0.113.9',
      }),
    ).toEqual({ ok: false, reason: 'forwarded-chain-too-short' });
  });
});

describe('resolveClientProtocolIsSecure', () => {
  test('direct exposure reports the socket encryption', () => {
    expect(
      resolveClientProtocolIsSecure(NO_TRUSTED_PROXY, {
        socketEncrypted: true,
        forwardedProto: undefined,
      }),
    ).toBe(true);
    expect(
      resolveClientProtocolIsSecure(NO_TRUSTED_PROXY, {
        socketEncrypted: false,
        forwardedProto: 'https',
      }),
    ).toBe(false);
  });

  test('one proxy reports the protocol the proxy recorded', () => {
    expect(
      resolveClientProtocolIsSecure(ONE_HOP, {
        socketEncrypted: false,
        forwardedProto: 'https',
      }),
    ).toBe(true);
    expect(
      resolveClientProtocolIsSecure(ONE_HOP, {
        socketEncrypted: false,
        forwardedProto: 'http',
      }),
    ).toBe(false);
  });

  test('is case-insensitive and whitespace-tolerant', () => {
    expect(
      resolveClientProtocolIsSecure(ONE_HOP, {
        socketEncrypted: false,
        forwardedProto: '  HTTPS ',
      }),
    ).toBe(true);
  });

  test('two proxies report the client-facing hop, not the last internal one', () => {
    // `https, http` means the client spoke TLS to the outer proxy which then
    // spoke plaintext inward. Reading the rightmost entry would call this
    // connection insecure and downgrade every cookie the session layer mints.
    expect(
      resolveClientProtocolIsSecure(TWO_HOPS, {
        socketEncrypted: false,
        forwardedProto: 'https, http',
      }),
    ).toBe(true);
  });

  test('a chain shorter than the hop count is not secure', () => {
    expect(
      resolveClientProtocolIsSecure(TWO_HOPS, {
        socketEncrypted: false,
        forwardedProto: 'https',
      }),
    ).toBe(false);
  });

  test('an absent header behind a proxy is not secure', () => {
    expect(
      resolveClientProtocolIsSecure(ONE_HOP, {
        socketEncrypted: false,
        forwardedProto: undefined,
      }),
    ).toBe(false);
  });
});
