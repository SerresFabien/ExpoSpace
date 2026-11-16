// Archives .tar.gz (format ustar).
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';

const BLOCK = 512;

function header(name, size, mtime) {
  if (Buffer.byteLength(name) > 100) throw new Error(`Nom trop long pour l'archive : ${name}`);
  const h = Buffer.alloc(BLOCK);
  const field = (value, offset, length) => h.write(value, offset, length, 'utf8');
  const octal = (value, offset, length) => field(value.toString(8).padStart(length - 1, '0') + '\0', offset, length);
  field(name, 0, 100);
  octal(0o644, 100, 8);
  octal(0, 108, 8);
  octal(0, 116, 8);
  octal(size, 124, 12);
  octal(Math.floor(mtime / 1000), 136, 12);
  field('        ', 148, 8);
  field('0', 156, 1);
  field('ustar\0', 257, 6);
  field('00', 263, 2);
  let sum = 0;
  for (const byte of h) sum += byte;
  field(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}

export async function writeTarGz(target, entries) {
  async function* blocks() {
    for (const entry of entries) {
      const data = entry.data ?? (await readFile(entry.path));
      yield header(entry.name, data.length, Date.now());
      yield data;
      const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
      if (pad) yield Buffer.alloc(pad);
    }
    yield Buffer.alloc(BLOCK * 2);
  }
  await pipeline(Readable.from(blocks()), createGzip({ level: 6 }), createWriteStream(target, { flags: 'wx' }));
}

export async function readTarGz(source, onFile) {
  let buffer = Buffer.alloc(0);
  let pending = null;
  const gunzip = createGunzip();
  await pipeline(createReadStream(source), gunzip, async function consume(chunks) {
    for await (const chunk of chunks) {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (!pending) {
          if (buffer.length < BLOCK) break;
          const h = buffer.subarray(0, BLOCK);
          buffer = buffer.subarray(BLOCK);
          if (h.every((b) => b === 0)) continue;
          const text = (offset, length) => h.toString('utf8', offset, offset + length).replace(/\0.*$/s, '');
          const size = parseInt(text(124, 12).trim() || '0', 8);
          const prefix = text(345, 155);
          const name = prefix ? `${prefix}/${text(0, 100)}` : text(0, 100);
          pending = { name, size, padded: Math.ceil(size / BLOCK) * BLOCK, type: text(156, 1) || '0' };
        }
        if (buffer.length < pending.padded) break;
        const data = buffer.subarray(0, pending.size);
        buffer = buffer.subarray(pending.padded);
        if (pending.type === '0') await onFile(pending.name, Buffer.from(data));
        pending = null;
      }
    }
  });
}
