/**
 * Effective-client-address resolution for deployments that sit behind a
 * reverse proxy.
 *
 * ## Why this module has to exist before anything else opens up
 *
 * Every transport gate in this server asks `isLoopbackAddress(
 * req.socket.remoteAddress)`. That question is only meaningful while the
 * server owns its listening socket. Put a TLS-terminating reverse proxy in
 * front (Caddy, nginx, Cloudflare Tunnel) and the socket peer becomes the
 * proxy — which is on loopback. Every loopback gate then answers "yes" for
 * every request on Earth, and a deployment that looks hardened is wide open.
 *
 * So the rule is inverted here: `X-Forwarded-For` is consulted ONLY when the
 * operator has declared how many proxies are in front. With no declaration
 * (`hops: 0`) the header is ignored entirely, because a directly-exposed
 * server cannot distinguish an operator's proxy from an attacker typing the
 * header by hand.
 *
 * ## Counting from the right
 *
 * `X-Forwarded-For` grows left-to-right: each proxy appends the address it
 * received the connection from.
 *
 *     X-Forwarded-For: <client>, <proxy-1>, <proxy-2>
 *                          ▲          ▲
 *                          │          └── appended by proxy-2
 *                          └── appended by proxy-1 (the real client)
 *
 * A client can put anything in the header before it ever reaches the first
 * proxy, so every entry left of the trusted segment is attacker-controlled.
 * Counting `hops` entries from the RIGHT lands on the address written by the
 * outermost proxy the operator actually controls, and forged left-hand entries
 * are structurally unreachable. This is the same model as Express's numeric
 * `trust proxy` setting and nginx's `real_ip_recursive off`.
 *
 * A header with fewer entries than `hops` means the request did not traverse
 * the declared chain. Resolution fails rather than falling back to the socket
 * peer: a fallback would silently restore the "proxy looks like loopback"
 * hole this module exists to close.
 */

/**
 * Operator declaration of how many reverse proxies sit in front of the
 * server.
 */
export interface TrustedProxyPolicy {
  /**
   * Count of trusted proxies between the public internet and this process.
   *
   * - `0` — the server owns its public socket. Forwarded headers are ignored
   *   and the socket peer is the client.
   * - `1` — the common single-proxy deployment (Caddy/nginx on the same host,
   *   or one Cloudflare Tunnel connector).
   * - `n` — one entry per additional hop the operator controls.
   *
   * Never infer this from request data. An attacker who can add a hop can
   * otherwise add an address.
   */
  readonly hops: number;
}

/** Direct-exposure policy: forwarded headers carry no authority. */
export const NO_TRUSTED_PROXY: TrustedProxyPolicy = { hops: 0 };

export type ClientAddressFailure =
  /** `hops > 0` but the request carried no `X-Forwarded-For`. */
  | 'forwarded-header-absent'
  /** `X-Forwarded-For` held fewer entries than the declared hop count. */
  | 'forwarded-chain-too-short'
  /** The selected entry was empty or not a plausible address token. */
  | 'forwarded-address-malformed'
  /** `hops === 0` and the socket had no peer address. */
  | 'socket-peer-absent';

export type ClientAddressResolution =
  | { readonly ok: true; readonly address: string }
  | { readonly ok: false; readonly reason: ClientAddressFailure };

/** The request facts this module reads. Kept structural so tests need no socket. */
export interface ClientAddressInput {
  /** `req.socket.remoteAddress`. */
  readonly socketAddress: string | undefined;
  /** Raw `X-Forwarded-For` header, in Node's `string | string[] | undefined` shape. */
  readonly forwardedFor: string | string[] | undefined;
}

/**
 * Address tokens are compared and logged, never parsed into numbers here, so
 * the check only has to exclude shapes that would corrupt a log line or slip
 * a second value through a later comma split. Hex, dots, colons, and the
 * IPv6 zone separator `%` cover every v4/v6/IPv4-mapped form Node emits.
 */
const ADDRESS_TOKEN_RE = /^[0-9a-fA-F.:%]{1,64}$/;

/**
 * Flatten Node's header union into a single comma-joined string.
 *
 * Node exposes a repeated header as an array. RFC 7239 §7.1 says repeated
 * forwarding headers are equivalent to one comma-joined header, so joining
 * before the split keeps the hop arithmetic correct when a proxy chain sends
 * the header more than once instead of appending.
 */
function joinForwardedHeader(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(',') : value;
}

/**
 * Resolve the address to treat as the client for gate and log purposes.
 *
 * @param policy - Operator's trusted-proxy declaration.
 * @param input - Socket peer plus the raw forwarded header.
 */
export function resolveClientAddress(
  policy: TrustedProxyPolicy,
  input: ClientAddressInput,
): ClientAddressResolution {
  if (policy.hops <= 0) {
    // Direct exposure. The socket peer is the only address with any
    // provenance, and `X-Forwarded-For` is ignored even when present —
    // a directly-reachable server cannot tell an operator's proxy from a
    // client that typed the header.
    if (input.socketAddress === undefined) return { ok: false, reason: 'socket-peer-absent' };
    return { ok: true, address: input.socketAddress };
  }

  const raw = joinForwardedHeader(input.forwardedFor);
  if (raw === undefined) return { ok: false, reason: 'forwarded-header-absent' };

  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  // Fewer entries than declared hops means the request did not come through
  // the operator's chain. Refuse rather than fall back to the socket peer:
  // the socket peer is the proxy, and treating it as the client is exactly
  // the "everything looks like loopback" failure this module prevents.
  if (entries.length < policy.hops) return { ok: false, reason: 'forwarded-chain-too-short' };

  const candidate = entries[entries.length - policy.hops];
  if (candidate === undefined || !ADDRESS_TOKEN_RE.test(candidate)) {
    return { ok: false, reason: 'forwarded-address-malformed' };
  }
  return { ok: true, address: candidate };
}

/**
 * Whether the original client request reached the proxy over TLS.
 *
 * Read from `X-Forwarded-Proto` under the same authority rule as the address:
 * consulted only when a proxy is declared. With no proxy, the answer comes
 * from whether this process itself terminated TLS, which the caller supplies
 * as `socketEncrypted` (`req.socket instanceof TLSSocket` at the call site).
 *
 * The `Secure` cookie attribute depends on this answer, so a wrong `true`
 * would mint cookies a plaintext client silently drops, and a wrong `false`
 * would mint cookies that travel in the clear.
 */
export function resolveClientProtocolIsSecure(
  policy: TrustedProxyPolicy,
  input: {
    readonly socketEncrypted: boolean;
    readonly forwardedProto: string | string[] | undefined;
  },
): boolean {
  if (policy.hops <= 0) return input.socketEncrypted;
  const raw = joinForwardedHeader(input.forwardedProto);
  if (raw === undefined) return false;
  const entries = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (entries.length < policy.hops) return false;
  // Same hops-from-the-right arithmetic as the address: each proxy appends the
  // protocol of the request IT received, so with two hops and a chain of
  // `https, http` the client spoke https to the outermost proxy and that
  // outermost value sits at `length - hops`. Taking the rightmost entry
  // instead would report the last internal hop — plaintext on most setups —
  // and downgrade every cookie the session layer mints.
  const clientFacing = entries[entries.length - policy.hops];
  return clientFacing === 'https';
}
