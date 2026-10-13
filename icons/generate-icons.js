/**
 * Generate valid PNG icons for Chrome Extension using Node.js built-in zlib
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCrcTable();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function generatePng(size) {
  const width = size;
  const height = size;

  // Raw RGBA scanlines: (width * 4 + 1) * height
  const rawData = Buffer.alloc((width * 4 + 1) * height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = (width / 2) - 1;

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter byte: 0 (None)
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Cookie body: Warm golden amber #e69c24 with soft radial gradient
        let r = 230;
        let g = 156;
        let b = 36;
        let a = 255;

        // Subtle shaded border
        if (dist > radius - 1.5) {
          r = 180;
          g = 110;
          b = 20;
        }

        // Chocolate chips (proportional positions)
        const chipPositions = [
          { x: cx - radius * 0.35, y: cy - radius * 0.3, rad: radius * 0.22 },
          { x: cx + radius * 0.35, y: cy - radius * 0.25, rad: radius * 0.2 },
          { x: cx, y: cy + radius * 0.25, rad: radius * 0.24 },
          { x: cx - radius * 0.4, y: cy + radius * 0.4, rad: radius * 0.16 },
          { x: cx + radius * 0.38, y: cy + radius * 0.35, rad: radius * 0.18 }
        ];

        for (const chip of chipPositions) {
          const cdx = x - chip.x;
          const cdy = y - chip.y;
          if (Math.sqrt(cdx * cdx + cdy * cdy) <= chip.rad) {
            r = 75;
            g = 40;
            b = 15;
            break;
          }
        }

        rawData[offset++] = r;
        rawData[offset++] = g;
        rawData[offset++] = b;
        rawData[offset++] = a;
      } else {
        // Transparent
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA color type
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // standard filter
  ihdr[12] = 0; // no interlace

  const headerChunk = makeChunk('IHDR', ihdr);
  const compressed = zlib.deflateSync(rawData);
  const dataChunk = makeChunk('IDAT', compressed);
  const endChunk = makeChunk('IEND', Buffer.alloc(0));

  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([pngSig, headerChunk, dataChunk, endChunk]);
}

const iconsDir = path.resolve('icons');
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const png = generatePng(size);
  const target = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(target, png);
  console.log(`Generated ${target} (${png.length} bytes)`);
}
