const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const sharp = require('sharp');
const { validateAttachmentSizes } = require('../dist/src/chats/chat-attachments.js');

test('upload validation rejects a fake image and accepts a real image', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dormproj-upload-'));
  try {
    const fake = join(dir, 'fake');
    await writeFile(fake, '<script>alert(1)</script>');
    await assert.rejects(
      validateAttachmentSizes([{ path: fake, size: 25, mimetype: 'image/jpeg', originalname: 'photo.jpg', filename: 'fake' }]),
      /Недопустимый тип файла|invalidFileType/,
    );

    const real = join(dir, 'real');
    const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ffffff' } }).png().toBuffer();
    await writeFile(real, png);
    const result = await validateAttachmentSizes([{ path: real, size: png.length, mimetype: 'image/png', originalname: 'photo.png', filename: 'real' }]);
    assert.equal(result[0].mimeType, 'image/png');
    assert.equal(result[0].kind, 'IMAGE');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
