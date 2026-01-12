import { describe, it, expect } from "vitest";
import { base64UrlEncode, base64UrlDecode, toUint8, nowIso, addSeconds, ensureFetch, stableStringify } from "../src/utils.js";

describe("utils", () => {
  it("encodes and decodes base64url", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = base64UrlEncode(data);
    const decoded = base64UrlDecode(encoded);
    expect(decoded).toEqual(data);
  });

  it("converts string to Uint8Array", () => {
    const str = "hello";
    const uint8 = toUint8(str);
    expect(uint8).toBeInstanceOf(Uint8Array);
    expect(uint8.length).toBe(5);
  });

  it("returns ISO timestamp", () => {
    const iso = nowIso();
    expect(typeof iso).toBe("string");
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("adds seconds to ISO timestamp", () => {
    const iso = "2023-01-01T00:00:00.000Z";
    const result = addSeconds(iso, 60);
    expect(result).toBe("2023-01-01T00:01:00.000Z");
  });

  it("handles fetch availability", () => {
    expect(ensureFetch()).toBe(fetch);
  });

  it("handles fetch unavailability", () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = undefined;
    
    expect(() => ensureFetch()).toThrow("FETCH_NOT_AVAILABLE");
    
    globalThis.fetch = originalFetch;
  });

  it("uses btoa/atob when Buffer is unavailable", () => {
    const originalBuffer = (globalThis as any).Buffer;
    (globalThis as any).Buffer = undefined;
    
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = base64UrlEncode(data);
    const decoded = base64UrlDecode(encoded);
    expect(decoded).toEqual(data);
    
    (globalThis as any).Buffer = originalBuffer;
  });

  describe("stableStringify", () => {
    it("stringifies null and undefined", () => {
      expect(stableStringify(null)).toBe("null");
      expect(stableStringify(undefined)).toBe("null");
    });

    it("stringifies arrays", () => {
      expect(stableStringify([1, 2, 3])).toBe("[1,2,3]");
      expect(stableStringify(["a", "b"])).toBe('["a","b"]');
    });

    it("stringifies numbers and booleans", () => {
      expect(stableStringify(42)).toBe("42");
      expect(stableStringify(3.14)).toBe("3.14");
      expect(stableStringify(true)).toBe("true");
      expect(stableStringify(false)).toBe("false");
    });

    it("stringifies nested objects", () => {
      const obj = { b: { z: 1, a: 2 }, a: [1, 2] };
      expect(stableStringify(obj)).toBe('{"a":[1,2],"b":{"a":2,"z":1}}');
    });

    it("stringifies strings", () => {
      expect(stableStringify("hello")).toBe('"hello"');
      expect(stableStringify("with\"quotes")).toBe('"with\\"quotes"');
    });

    it("stringifies numbers and booleans", () => {
      expect(stableStringify(42)).toBe("42");
      expect(stableStringify(3.14)).toBe("3.14");
      expect(stableStringify(true)).toBe("true");
      expect(stableStringify(false)).toBe("false");
    });

    it("filters out undefined values in objects", () => {
      const obj = { a: 1, b: undefined, c: 2 };
      expect(stableStringify(obj)).toBe('{"a":1,"c":2}');
    });
  });
});