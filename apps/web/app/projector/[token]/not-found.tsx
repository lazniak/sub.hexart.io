/**
 * Deliberately renders nothing.
 *
 * A bad or expired projector token must not put text on somebody's broadcast.
 * Without this override the root not-found page would render into OBS, so the
 * blank output is the feature, not an oversight. The studio is where the user
 * learns the link is stale.
 */
export default function ProjectorNotFound() {
  return null
}
