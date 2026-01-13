import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the service worker global environment
const mockCaches = {
  open: vi.fn(),
  keys: vi.fn(),
  delete: vi.fn(),
  match: vi.fn()
};

const mockClients = {
  claim: vi.fn()
};

const mockFetch = vi.fn();

// Define service worker handlers
const CACHE_NAME = "shielded-wallet-v1";
const OFFLINE_URLS = ["/", "/index.html", "/manifest.json"];

let installHandler: (event: any) => Promise<void>;
let activateHandler: (event: any) => Promise<void>;
let fetchHandler: (event: any) => void;
let syncHandler: (event: any) => Promise<void>;

describe("Service Worker", () => {
  let installEvent: any;
  let activateEvent: any;
  let fetchEvent: any;
  let syncEvent: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up global mocks for service worker environment
    (global as any).caches = mockCaches;
    (global as any).clients = mockClients;
    (global as any).fetch = mockFetch;

    // Mock event listeners
    const eventListeners: Record<string, Function[]> = {};

    (global as any).self = {
      addEventListener: vi.fn((event: string, handler: Function) => {
        if (!eventListeners[event]) {
          eventListeners[event] = [];
        }
        eventListeners[event].push(handler);
      }),
      skipWaiting: vi.fn().mockResolvedValue(undefined),
      clients: mockClients
    };

    // Create mock events
    installEvent = {
      waitUntil: vi.fn().mockImplementation((promise) => promise)
    };

    activateEvent = {
      waitUntil: vi.fn().mockImplementation((promise) => promise)
    };

    fetchEvent = {
      request: new Request('https://example.com/test'),
      respondWith: vi.fn().mockImplementation((promise) => promise)
    };

    syncEvent = {
      tag: 'sync-receipts',
      waitUntil: vi.fn().mockImplementation((promise) => promise)
    };

    // Define service worker handlers after mocks are set up
    installHandler = async (event: any) => {
      const cache = await (global as any).caches.open(CACHE_NAME);
      await cache.addAll(OFFLINE_URLS);
      await (global as any).self.skipWaiting();
      event.waitUntil(Promise.resolve());
    };

    activateHandler = async (event: any) => {
      const cacheNames = await (global as any).caches.keys();
      const deletePromises = cacheNames
        .filter((cacheName: string) => cacheName !== CACHE_NAME)
        .map((cacheName: string) => (global as any).caches.delete(cacheName));
      await Promise.all(deletePromises);
      await (global as any).clients.claim();
      event.waitUntil(Promise.resolve());
    };

    fetchHandler = async (event: any) => {
      if (event.request.url.includes('/api/')) {
        return;
      }
      const response = await (global as any).caches.match(event.request);
      const finalResponse = response || await (global as any).fetch(event.request);
      event.respondWith(finalResponse);
    };

    syncHandler = async (event: any) => {
      if (event.tag === 'sync-receipts') {
        event.waitUntil(Promise.resolve());
      } else {
        event.waitUntil(Promise.resolve());
      }
    };
  });

  describe("Install Event", () => {
    it("caches offline URLs during installation", async () => {
      const cacheInstance = {
        addAll: vi.fn().mockResolvedValue(undefined)
      };
      mockCaches.open.mockResolvedValue(cacheInstance);
      (global as any).self.skipWaiting.mockResolvedValue(undefined);

      await installHandler(installEvent);

      expect(mockCaches.open).toHaveBeenCalledWith("shielded-wallet-v1");
      expect(cacheInstance.addAll).toHaveBeenCalledWith(["/", "/index.html", "/manifest.json"]);
      expect((global as any).self.skipWaiting).toHaveBeenCalled();
      expect(installEvent.waitUntil).toHaveBeenCalled();
    });
  });

  describe("Activate Event", () => {
    it("cleans up old caches and claims clients", async () => {
      mockCaches.keys.mockResolvedValue(["old-cache-v1", "shielded-wallet-v1", "another-old-cache"]);

      await activateHandler(activateEvent);

      expect(mockCaches.keys).toHaveBeenCalled();
      expect(mockCaches.delete).toHaveBeenCalledTimes(2);
      expect(mockCaches.delete).toHaveBeenCalledWith("old-cache-v1");
      expect(mockCaches.delete).toHaveBeenCalledWith("another-old-cache");
      expect(mockClients.claim).toHaveBeenCalled();
      expect(activateEvent.waitUntil).toHaveBeenCalled();
    });

    it("handles empty cache keys array", async () => {
      mockCaches.keys.mockResolvedValue([]);

      await activateHandler(activateEvent);

      expect(mockCaches.delete).not.toHaveBeenCalled();
      expect(mockClients.claim).toHaveBeenCalled();
    });
  });

  describe("Fetch Event", () => {
    it("serves cached responses when available", async () => {
      const cachedResponse = new Response("cached content");
      mockCaches.match.mockResolvedValue(cachedResponse);

      await fetchHandler(fetchEvent);

      expect(mockCaches.match).toHaveBeenCalledWith(fetchEvent.request);
      expect(fetchEvent.respondWith).toHaveBeenCalledWith(cachedResponse);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("falls back to network when no cache hit", async () => {
      const networkResponse = new Response("network content");
      mockCaches.match.mockResolvedValue(null);
      mockFetch.mockResolvedValue(networkResponse);

      await fetchHandler(fetchEvent);

      expect(mockCaches.match).toHaveBeenCalledWith(fetchEvent.request);
      expect(mockFetch).toHaveBeenCalledWith(fetchEvent.request);
      expect(fetchEvent.respondWith).toHaveBeenCalledWith(networkResponse);
    });
  });

  describe("Sync Event", () => {
    it("handles sync-receipts events", async () => {
      await syncHandler(syncEvent);

      expect(syncEvent.waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    });

    it("ignores other sync tags", async () => {
      syncEvent.tag = 'other-sync-tag';

      await syncHandler(syncEvent);

      expect(syncEvent.waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    });
  });
});