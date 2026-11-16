// NBT that keeps tag types, so a file can be read, changed and written back unchanged in form.
// A node is { t: <tag type>, v: <value> }; compounds hold { name: node }, lists hold { et: <element type>, v: [values] }.
// Used for Bedrock .mcstructure files (little-endian).
import zlib from "node:zlib";

export const T = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTES: 7, STRING: 8, LIST: 9, COMPOUND: 10, INTS: 11, LONGS: 12 };

export function readTyped(buf, littleEndian = true) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const le = littleEndian;
  let o = 0;
  const str = () => { const n = dv.getUint16(o, le); o += 2; const s = buf.subarray(o, o + n).toString("utf8"); o += n; return s; };
  const payload = (t) => {
    switch (t) {
      case 1: return dv.getInt8(o++);
      case 2: { const v = dv.getInt16(o, le); o += 2; return v; }
      case 3: { const v = dv.getInt32(o, le); o += 4; return v; }
      case 4: { const v = dv.getBigInt64(o, le); o += 8; return v; }
      case 5: { const v = dv.getFloat32(o, le); o += 4; return v; }
      case 6: { const v = dv.getFloat64(o, le); o += 8; return v; }
      case 7: { const n = dv.getInt32(o, le); o += 4; const a = Array.from(buf.subarray(o, o + n), (b) => (b << 24) >> 24); o += n; return a; }
      case 8: return str();
      case 9: { const et = dv.getUint8(o++); const n = dv.getInt32(o, le); o += 4; const v = []; for (let k = 0; k < n; k++) v.push(payload(et)); return { et, v }; }
      case 10: { const c = {}; for (;;) { const tt = dv.getUint8(o++); if (tt === 0) return c; const name = str(); c[name] = { t: tt, v: payload(tt) }; } }
      case 11: { const n = dv.getInt32(o, le); o += 4; const a = []; for (let k = 0; k < n; k++) { a.push(dv.getInt32(o, le)); o += 4; } return a; }
      case 12: { const n = dv.getInt32(o, le); o += 4; const a = []; for (let k = 0; k < n; k++) { a.push(dv.getBigInt64(o, le)); o += 8; } return a; }
      default: throw new Error(`Bad NBT tag ${t} at ${o}`);
    }
  };
  const rootType = dv.getUint8(o++);
  const rootName = str();
  return { name: rootName, root: { t: rootType, v: payload(rootType) } };
}

export function writeTyped({ name = "", root }, littleEndian = true) {
  const parts = [];
  const le = littleEndian;
  const num = (size, fn) => { const b = Buffer.alloc(size); const dv = new DataView(b.buffer); fn(dv); parts.push(b); };
  const str = (s) => { const b = Buffer.from(s, "utf8"); num(2, (dv) => dv.setUint16(0, b.length, le)); parts.push(b); };
  const payload = (t, v) => {
    switch (t) {
      case 1: return num(1, (dv) => dv.setInt8(0, v));
      case 2: return num(2, (dv) => dv.setInt16(0, v, le));
      case 3: return num(4, (dv) => dv.setInt32(0, v, le));
      case 4: return num(8, (dv) => dv.setBigInt64(0, BigInt(v), le));
      case 5: return num(4, (dv) => dv.setFloat32(0, v, le));
      case 6: return num(8, (dv) => dv.setFloat64(0, v, le));
      case 7: num(4, (dv) => dv.setInt32(0, v.length, le)); return parts.push(Buffer.from(v.map((b) => b & 0xff)));
      case 8: return str(v);
      case 9: {
        const et = v.v.length ? v.et : (v.et || 0);
        num(1, (dv) => dv.setUint8(0, et));
        num(4, (dv) => dv.setInt32(0, v.v.length, le));
        for (const e of v.v) payload(et, e);
        return;
      }
      case 10:
        for (const [k, n] of Object.entries(v)) { num(1, (dv) => dv.setUint8(0, n.t)); str(k); payload(n.t, n.v); }
        return num(1, (dv) => dv.setUint8(0, 0));
      case 11: num(4, (dv) => dv.setInt32(0, v.length, le)); for (const e of v) num(4, (dv) => dv.setInt32(0, e, le)); return;
      case 12: num(4, (dv) => dv.setInt32(0, v.length, le)); for (const e of v) num(8, (dv) => dv.setBigInt64(0, BigInt(e), le)); return;
      default: throw new Error(`Bad NBT tag ${t}`);
    }
  };
  num(1, (dv) => dv.setUint8(0, root.t));
  str(name);
  payload(root.t, root.v);
  return Buffer.concat(parts);
}

/** Plain JS view of a typed node (numbers, strings, objects, arrays). */
export function plain(node) {
  const { t, v } = node;
  if (t === 10) return Object.fromEntries(Object.entries(v).map(([k, n]) => [k, plain(n)]));
  if (t === 9) return v.v.map((e) => plain({ t: v.et, v: e }));
  return v;
}
