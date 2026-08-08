/**
 * Blank catch-all under a projector token.
 *
 * Without it, any path below the token that is not `/voice` — a typo in the OBS
 * Browser Source URL, a trailing segment left over from an older link — falls
 * through to the application's root `not-found.tsx`, which renders a branded
 * 404 with a "back to the homepage" link. That page would be composited onto a
 * live broadcast. This route matches first and renders nothing, on the
 * transparent surface the `[token]` layout already provides.
 *
 * `/projector/<token>` itself is safe by other means: it renders the caption
 * surface, and a token that fails the attach schema simply never connects.
 */
export default function ProjectorCatchAll() {
  return null
}
