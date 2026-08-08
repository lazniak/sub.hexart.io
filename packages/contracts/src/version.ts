/**
 * Wire protocol version (SemVer).
 *
 * The projector runs inside somebody else's OBS and will not refresh on demand.
 * A breaking bump therefore requires a compatibility window: relay and projector
 * must speak both versions for at least one release. See docs/rfc/0000-template.md.
 */
export const PROTOCOL_VERSION = '1.1.0' as const

/**
 * Versions the relay still accepts during the compatibility window.
 *
 * 1.0.0 is absent because it was never deployed: `RelayReady.projectorToken` was
 * removed before any browser source in the wild spoke it (RFC 0002). Once a
 * version has shipped, dropping it from this list needs a real deprecation.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = ['1.1.0'] as const

export function isProtocolSupported(v: string): boolean {
  return (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(v)
}
