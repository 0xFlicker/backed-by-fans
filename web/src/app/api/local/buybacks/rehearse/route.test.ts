import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ parse: vi.fn(), rehearse: vi.fn() }));
vi.mock("@/lib/config", () => ({
  publicConfig: { anvilRpcUrl: "http://127.0.0.1:18557" },
  getDeployment: () => ({ status: "ready", factoryAddress: "0xfactory" }),
}));
vi.mock("../../../../../../scripts/buyback-rehearsal", () => ({
  parseRehearsalInput: mock.parse,
  rehearseBuybacks: mock.rehearse,
}));
import { POST } from "./route";
function request(origin: string, host = "127.0.0.1:3110") {
  return new Request("http://localhost:3110/api/local/buybacks/rehearse", {
    method: "POST",
    headers: { origin, host, "content-type": "application/json" },
    body: "{}",
  });
}
describe("local rehearsal origin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VERCEL", "");
    mock.parse.mockReturnValue({ factory: "0xfactory" });
    mock.rehearse.mockResolvedValue({ rows: [] });
  });
  it("accepts the browser Host despite Next normalizing the request URL", async () => {
    const response = await POST(request("http://127.0.0.1:3110"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mock.rehearse).toHaveBeenCalledOnce();
  });
  it.each([
    ["https://evil.example", "127.0.0.1:3110"],
    ["http://evil.example", "evil.example"],
    ["http://localhost:3110", "127.0.0.1:3110"],
    ["http://127.0.0.1:3111", "127.0.0.1:3110"],
    ["", "127.0.0.1:3110"],
  ])("rejects cross-origin requests (%s, %s)", async (origin, host) => {
    expect((await POST(request(origin, host))).status).toBe(403);
    expect(mock.rehearse).not.toHaveBeenCalled();
  });
  it("refuses hosted execution", async () => {
    vi.stubEnv("VERCEL", "1");
    expect((await POST(request("http://127.0.0.1:3110"))).status).toBe(403);
    expect(mock.rehearse).not.toHaveBeenCalled();
  });
});

it.each([
  "missing bytecode for code hash 0xabc",
  "BlockOutOfRangeError: block height is 999",
])("explains an unavailable Anvil snapshot: %s", async (detail) => {
  vi.stubEnv("VERCEL", "");
  mock.parse.mockReturnValue({ factory: "0xfactory" });
  mock.rehearse.mockRejectedValueOnce(
    new Error(`releaseProtocolFees failed: ${detail}`),
  );
  const response = await POST(request("http://127.0.0.1:3110"));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error:
      "This fork snapshot is no longer readable. Rehearse again to use a fresh block.",
  });
});

it("keeps overlapping stateless rehearsals independent", async () => {
  vi.stubEnv("VERCEL", "");
  mock.parse.mockReturnValue({ factory: "0xfactory" });
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  mock.rehearse.mockImplementation(async () => {
    await pending;
    return { rows: [] };
  });
  const first = POST(request("http://127.0.0.1:3110"));
  const second = POST(request("http://127.0.0.1:3110"));
  await vi.waitFor(() =>
    expect(mock.rehearse.mock.calls.length).toBeGreaterThanOrEqual(2),
  );
  finish();
  expect((await first).status).toBe(200);
  expect((await second).status).toBe(200);
});
