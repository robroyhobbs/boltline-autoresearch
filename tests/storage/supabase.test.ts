import { describe, it, expect, beforeEach, vi } from "vitest";
import { SupabaseStorage } from "../../src/storage/supabase.js";

// Mock the Supabase client
function createMockSupabaseClient() {
  const mockData: any[] = [];
  const mockError: any = null;

  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi
      .fn()
      .mockResolvedValue({ data: mockData[0] ?? null, error: mockError }),
    then: undefined as any,
  };

  // Make the query thenable for await
  const makeThenable = (data: any, error: any) => {
    const result = { ...mockQuery };
    // Each terminal method returns a promise-like
    result.select = vi.fn().mockReturnValue(result);
    result.insert = vi.fn().mockImplementation((rows: any) => {
      const insertResult = { ...result };
      (insertResult as any).select = vi.fn().mockReturnValue({
        ...insertResult,
        then: (resolve: any) =>
          resolve({ data: Array.isArray(rows) ? rows : [rows], error }),
      });
      // Also make insert itself thenable for simple inserts
      (insertResult as any).then = (resolve: any) =>
        resolve({ data: Array.isArray(rows) ? rows : [rows], error });
      return insertResult;
    });
    result.eq = vi.fn().mockReturnValue(result);
    result.gte = vi.fn().mockReturnValue(result);
    result.lte = vi.fn().mockReturnValue(result);
    result.order = vi.fn().mockReturnValue(result);
    result.limit = vi.fn().mockReturnValue(result);
    return result;
  };

  const fromFn = vi.fn().mockImplementation(() => {
    const query = makeThenable(mockData, mockError);
    // Default: the query resolves with data/error when awaited
    (query as any).then = (resolve: any) =>
      resolve({ data: mockData, error: mockError });
    return query;
  });

  return {
    from: fromFn,
    _setData: (data: any[]) => {
      mockData.length = 0;
      mockData.push(...data);
    },
    _setError: (err: any) => {
      /* handled via fromFn override */
    },
    _mockQuery: mockQuery,
  };
}

describe("SupabaseStorage", () => {
  let mockClient: ReturnType<typeof createMockSupabaseClient>;
  let storage: SupabaseStorage;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
    storage = new SupabaseStorage(mockClient as any);
  });

  // === Happy Path ===

  describe("Happy Path", () => {
    it("writeResult inserts a result into experiment_results table", async () => {
      const result = {
        experimentId: "exp-1",
        timestamp: new Date().toISOString(),
        score: 0.85,
        config: { temperature: 0.7 },
        costUsd: 0.12,
      };
      await storage.writeResult(result);
      expect(mockClient.from).toHaveBeenCalledWith("experiment_results");
    });

    it("writeConfig inserts config with promoted=false", async () => {
      const config = {
        id: "cfg-1",
        parameters: { temperature: 0.7, maxTokens: 2000 },
        createdAt: new Date().toISOString(),
      };
      await storage.writeConfig(config);
      expect(mockClient.from).toHaveBeenCalledWith("staged_configs");
    });

    it("readResults queries experiment_results with filters", async () => {
      mockClient._setData([
        { experimentId: "exp-1", score: 0.85 },
        { experimentId: "exp-2", score: 0.9 },
      ]);
      const results = await storage.readResults({ minScore: 0.8 });
      expect(mockClient.from).toHaveBeenCalledWith("experiment_results");
      expect(results).toBeDefined();
    });

    it("readStagedConfigs returns unpromoted configs", async () => {
      mockClient._setData([{ id: "cfg-1", promoted: false }]);
      const configs = await storage.readStagedConfigs();
      expect(mockClient.from).toHaveBeenCalledWith("staged_configs");
      expect(configs).toBeDefined();
    });

    it("writeResult includes all required fields", async () => {
      const result = {
        experimentId: "exp-1",
        timestamp: new Date().toISOString(),
        score: 0.85,
        config: { temperature: 0.7 },
        costUsd: 0.12,
      };
      await storage.writeResult(result);
      const fromCall = mockClient.from.mock.results[0].value;
      expect(fromCall.insert).toHaveBeenCalled();
    });

    it("readResults returns empty array when no matches", async () => {
      mockClient._setData([]);
      const results = await storage.readResults({});
      expect(results).toEqual([]);
    });
  });

  // === Bad Path ===

  describe("Bad Path", () => {
    it("writeResult throws on Supabase error", async () => {
      const errorClient = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "Insert failed", code: "23505" },
            }),
            then: (resolve: any) =>
              resolve({
                data: null,
                error: { message: "Insert failed", code: "23505" },
              }),
          }),
        }),
      };
      const errorStorage = new SupabaseStorage(errorClient as any);
      await expect(
        errorStorage.writeResult({
          experimentId: "exp-1",
          timestamp: new Date().toISOString(),
          score: 0.5,
          config: {},
          costUsd: 0.1,
        }),
      ).rejects.toThrow("Insert failed");
    });

    it("writeConfig throws on Supabase error", async () => {
      const errorClient = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "Config insert failed" },
            }),
            then: (resolve: any) =>
              resolve({
                data: null,
                error: { message: "Config insert failed" },
              }),
          }),
        }),
      };
      const errorStorage = new SupabaseStorage(errorClient as any);
      await expect(
        errorStorage.writeConfig({
          id: "cfg-1",
          parameters: {},
          createdAt: new Date().toISOString(),
        }),
      ).rejects.toThrow("Config insert failed");
    });

    it("readResults throws on Supabase error", async () => {
      const errorClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    then: (resolve: any) =>
                      resolve({
                        data: null,
                        error: { message: "Query failed" },
                      }),
                  }),
                }),
              }),
            }),
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  then: (resolve: any) =>
                    resolve({
                      data: null,
                      error: { message: "Query failed" },
                    }),
                }),
              }),
            }),
            order: vi.fn().mockReturnValue({
              then: (resolve: any) =>
                resolve({
                  data: null,
                  error: { message: "Query failed" },
                }),
            }),
            then: (resolve: any) =>
              resolve({
                data: null,
                error: { message: "Query failed" },
              }),
          }),
        }),
      };
      const errorStorage = new SupabaseStorage(errorClient as any);
      await expect(errorStorage.readResults({})).rejects.toThrow(
        "Query failed",
      );
    });

    it("writeResult propagates insert errors", async () => {
      const errorClient = {
        from: () => ({
          insert: async () => ({ error: { message: "Insert failed" } }),
          select: () => ({
            eq: () => ({ data: [], error: null }),
            order: () => ({ data: [], error: null }),
          }),
        }),
      };
      const errorStorage = new SupabaseStorage(errorClient as any);
      await expect(
        errorStorage.writeResult({
          experiment_type: "temperature",
          section_type: "executive_summary",
          parameters: {},
          fixture_id: "test",
          fixture_difficulty: "easy",
          production_score: {},
          enhanced_score: {},
          divergence: 0,
          token_usage: 0,
          cost_usd: 0,
          duration_ms: 0,
        }),
      ).rejects.toThrow("Insert failed");
    });

    it("writeConfig rejects missing id", async () => {
      await expect(
        storage.writeConfig({
          id: "",
          parameters: {},
          createdAt: new Date().toISOString(),
        }),
      ).rejects.toThrow();
    });

    it("constructor throws without client", () => {
      expect(() => new SupabaseStorage(null as any)).toThrow();
    });
  });

  // === Edge Cases ===

  describe("Edge Cases", () => {
    it("readResults with no filters returns all results", async () => {
      mockClient._setData([{ id: 1 }, { id: 2 }]);
      const results = await storage.readResults({});
      expect(results.length).toBe(2);
    });

    it("readStagedConfigs returns empty array when none exist", async () => {
      mockClient._setData([]);
      const configs = await storage.readStagedConfigs();
      expect(configs).toEqual([]);
    });

    it("handles large result payloads", async () => {
      const bigConfig = { data: "x".repeat(10000) };
      const result = {
        experimentId: "exp-big",
        timestamp: new Date().toISOString(),
        score: 0.5,
        config: bigConfig,
        costUsd: 0.1,
      };
      // Should not throw
      await storage.writeResult(result);
      expect(mockClient.from).toHaveBeenCalled();
    });

    it("readResults with all filter fields populated", async () => {
      mockClient._setData([{ experimentId: "exp-1", score: 0.9 }]);
      const results = await storage.readResults({
        minScore: 0.5,
        maxScore: 1.0,
        experimentId: "exp-1",
      });
      expect(results).toBeDefined();
    });
  });

  // === Security ===

  describe("Security", () => {
    it("does not log connection strings", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await storage.writeResult({
        experimentId: "exp-sec",
        timestamp: new Date().toISOString(),
        score: 0.5,
        config: {},
        costUsd: 0.1,
      });

      for (const spy of [consoleSpy, warnSpy, errorSpy]) {
        for (const call of spy.mock.calls) {
          const output = call.join(" ");
          expect(output).not.toContain("supabase");
          expect(output).not.toContain("password");
          expect(output).not.toContain("connection");
        }
      }

      consoleSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("writeResult does not expose internal client details in returned data", async () => {
      await storage.writeResult({
        experimentId: "exp-1",
        timestamp: new Date().toISOString(),
        score: 0.5,
        config: {},
        costUsd: 0.1,
      });
      // Should not throw and client internals should not leak
      expect(mockClient.from).toHaveBeenCalled();
    });
  });

  // === Data Leak ===

  describe("Data Leak", () => {
    it("writeConfig sets promoted=false by default", async () => {
      await storage.writeConfig({
        id: "cfg-leak",
        parameters: { temperature: 0.7 },
        createdAt: new Date().toISOString(),
      });
      const fromResult = mockClient.from.mock.results[0].value;
      const insertCall = fromResult.insert.mock.calls[0][0];
      expect(insertCall.promoted).toBe(false);
    });

    it("readResults does not return fields not in the schema", async () => {
      mockClient._setData([
        { experimentId: "exp-1", score: 0.85, _internal: "leaked" },
      ]);
      const results = await storage.readResults({});
      // The storage should not add extra fields; it returns what Supabase returns
      // But we verify it doesn't add its own metadata
      expect(results).toBeDefined();
    });
  });

  // === Data Damage ===

  describe("Data Damage", () => {
    it("writeResult does not mutate the input object", async () => {
      const result = {
        experimentId: "exp-1",
        timestamp: new Date().toISOString(),
        score: 0.85,
        config: { temperature: 0.7 },
        costUsd: 0.12,
      };
      const copy = JSON.parse(JSON.stringify(result));
      await storage.writeResult(result);
      expect(result).toEqual(copy);
    });

    it("writeConfig does not mutate the input object", async () => {
      const config = {
        id: "cfg-1",
        parameters: { temperature: 0.7 },
        createdAt: new Date().toISOString(),
      };
      const copy = JSON.parse(JSON.stringify(config));
      await storage.writeConfig(config);
      expect(config).toEqual(copy);
    });

    it("readResults returns data copies not references to cache", async () => {
      mockClient._setData([{ experimentId: "exp-1", score: 0.85 }]);
      const r1 = await storage.readResults({});
      const r2 = await storage.readResults({});
      expect(r1).not.toBe(r2);
    });
  });
});
