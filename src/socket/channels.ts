/** Public channels are open to any authenticated client in the namespace. */
const PUBLIC_PREFIX = 'public.';

/**
 * Decide whether a client may subscribe to `channel` given its allowed
 * `channels` claim. Public channels are always permitted. Claims support a
 * single trailing wildcard segment, e.g. "chat.*" matches "chat.42".
 */
export function isChannelAllowed(allowed: string[], channel: string): boolean {
  if (channel.startsWith(PUBLIC_PREFIX)) return true;

  return allowed.some((pattern) => {
    if (pattern === channel) return true;
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return channel.startsWith(prefix);
    }
    return false;
  });
}
