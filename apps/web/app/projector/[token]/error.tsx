'use client'

/**
 * Deliberately renders nothing.
 *
 * This boundary sits on the surface OBS composites onto a live stream. Whatever
 * broke, the viewer must not see it — the captions simply stop. Diagnostics go
 * to the studio, never here.
 */
export default function ProjectorError() {
  return null
}
