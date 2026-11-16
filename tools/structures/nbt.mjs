// Minimal NBT reader (zero dependencies). Java structure templates are gzip, big-endian;
// Bedrock .mcstructure files are uncompressed, little-endian.
import zlib from "node:zlib";

export function readNbt(buf, { littleEndian = false } = {}) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const le = littleEndian;
  let o = 0;
  const u8 = () => dv.getUint8(o++);
  const i8 = () => dv.getInt8(o++);
  const i16 = () => { const v = dv.getInt16(o, le); o += 2; return v; };
  const u16 = () => { const v = dv.getUint16(o, le); o += 2; return v; };
  const i32 = () => { const v = dv.getInt32(o, le); o += 4; return v; };
  const i64 = () => { const v = dv.getBigInt64(o, le); o += 8; return v; };
  const f32 = () => { const v = dv.getFloat32(o, le); o += 4; return v; };
  const f64 = () => { const v = dv.getFloat64(o, le); o += 8; return v; };
  const str = () => { const n = u16(); const s = buf.subarray(o, o + n).toString("utf8"); o += n; return s; };
  const payload = (t) => {
    switch (t) {
      case 1: return i8();
      case 2: return i16();
      case 3: return i32();
      case 4: return i64();
      case 5: return f32();
      case 6: return f64();
      case 7: { const n = i32(); const a = Array.from(buf.subarray(o, o + n), (b) => (b << 24) >> 24); o += n; return a; }
      case 8: return str();
      case 9: { const et = u8(); const n = i32(); const a = []; for (let k = 0; k < n; k++) a.push(payload(et)); return a; }
      case 10: { const c = {}; for (;;) { const tt = u8(); if (tt === 0) return c; const name = str(); c[name] = payload(tt); } }
      case 11: { const n = i32(); const a = []; for (let k = 0; k < n; k++) a.push(i32()); return a; }
      case 12: { const n = i32(); const a = []; for (let k = 0; k < n; k++) a.push(i64()); return a; }
      default: throw new Error(`Bad NBT tag ${t} at ${o}`);
    }
  };
  const rootType = u8();
  if (rootType !== 10) throw new Error("NBT root is not a compound");
  str();
  return payload(10);
}
