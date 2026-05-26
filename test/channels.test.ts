import { describe, it, expect } from 'vitest';
import { isChannelAllowed } from '../src/socket/channels.js';

describe('isChannelAllowed', () => {
  it('always allows public channels regardless of claims', () => {
    expect(isChannelAllowed([], 'public.announcements')).toBe(true);
  });

  it('allows exact channel matches', () => {
    expect(isChannelAllowed(['chat.42'], 'chat.42')).toBe(true);
    expect(isChannelAllowed(['chat.42'], 'chat.43')).toBe(false);
  });

  it('supports trailing wildcard claims', () => {
    expect(isChannelAllowed(['chat.*'], 'chat.42')).toBe(true);
    expect(isChannelAllowed(['chat.*'], 'orders.42')).toBe(false);
  });

  it('denies private channels with no matching claim', () => {
    expect(isChannelAllowed([], 'chat.42')).toBe(false);
    expect(isChannelAllowed(['orders.*'], 'chat.42')).toBe(false);
  });
});
