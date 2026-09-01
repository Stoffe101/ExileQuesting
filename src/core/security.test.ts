import { describe, expect, it } from 'vitest';
import { assertBoundedContentLength, isAllowedDataUrl, isAllowedExternalUrl, readBoundedResponseText } from './security';

describe('security boundaries', () => {
  it('only opens explicitly allowlisted HTTPS reference hosts', () => {
    expect(isAllowedExternalUrl('https://www.pathofexile.com/forum/view-thread/1')).toBe(true);
    expect(isAllowedExternalUrl('https://pobb.in/abc')).toBe(true);
    expect(isAllowedExternalUrl('http://pobb.in/abc')).toBe(false);
    expect(isAllowedExternalUrl('https://evil.example/?next=https://pobb.in/abc')).toBe(false);
    expect(isAllowedExternalUrl('https://user:pass@github.com/a/b')).toBe(false);
  });

  it('keeps remote data fetches on known data hosts', () => {
    expect(isAllowedDataUrl('https://api.github.com/repos/a/b')).toBe(true);
    expect(isAllowedDataUrl('https://raw.githubusercontent.com/a/b/main/file.json')).toBe(true);
    expect(isAllowedDataUrl('https://pobb.in/abc/raw')).toBe(true);
    expect(isAllowedDataUrl('https://github.com/a/b')).toBe(false);
  });

  it('rejects oversized advertised content', () => {
    expect(() => assertBoundedContentLength(new Headers({ 'content-length': '999' }), 100)).toThrow(/safety limit/);
  });

  it('rejects streamed content that grows past the limit', async () => {
    const response = new Response('x'.repeat(200));
    await expect(readBoundedResponseText(response, 100)).rejects.toThrow(/safety limit/);
  });
});
