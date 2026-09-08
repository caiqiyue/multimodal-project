import { describe, it, expect, vi } from 'vitest';
import { uploadMedia, MediaValidationError } from '@/lib/upload-media';

vi.mock('@/lib/tokenStorage', () => ({
  getAccessToken: () => 'test-token',
}));

describe('uploadMedia', () => {
  it('throws on oversized image', async () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.png', {
      type: 'image/png',
    });
    await expect(uploadMedia({ file: big, mediaType: 'image' })).rejects.toThrow(
      MediaValidationError,
    );
  });

  it('throws on unsupported mime', async () => {
    const bad = new File(['x'], 'x.gif', { type: 'image/gif' });
    await expect(uploadMedia({ file: bad, mediaType: 'image' })).rejects.toThrow(/不支持/);
  });
});