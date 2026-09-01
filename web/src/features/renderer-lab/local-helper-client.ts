const highPortMinimum = 49_152;
const maxResponseBytes = 1_000_000;
const requestTimeoutMs = 5_000;

export type RendererHelperConnection = {
  origin: string;
  capability: string;
  sessionId: string;
};

export class HelperConnectionError extends Error {
  readonly fallback = "file-import" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "HelperConnectionError";
  }
}

type FragmentLocation = Pick<Location, "hash" | "pathname" | "search">;
type FragmentHistory = Pick<History, "replaceState">;

export function parseRendererHelperFragment(
  location: FragmentLocation,
  history: FragmentHistory,
): RendererHelperConnection | undefined {
  const rawFragment = location.hash.startsWith("#")
    ? location.hash.slice(1)
    : location.hash;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  if (!rawFragment) return undefined;

  const values = new URLSearchParams(rawFragment);
  const rawOrigin = values.get("helper");
  const capability = values.get("capability") ?? "";
  const sessionId = values.get("sessionId") ?? "";
  if (!rawOrigin || capability.length < 43 || !sessionId) {
    throw new HelperConnectionError(
      "The renderer loopback helper link is incomplete.",
    );
  }

  let helper: URL;
  try {
    helper = new URL(rawOrigin);
  } catch (cause) {
    throw new HelperConnectionError(
      "The renderer loopback helper address is invalid.",
      { cause },
    );
  }
  const port = Number(helper.port);
  if (
    helper.protocol !== "http:" ||
    helper.hostname !== "127.0.0.1" ||
    helper.pathname !== "/" ||
    helper.search ||
    helper.hash ||
    !Number.isInteger(port) ||
    port < highPortMinimum ||
    port > 65_535
  ) {
    throw new HelperConnectionError(
      "Only an exact 127.0.0.1 high-port renderer loopback helper is allowed.",
    );
  }

  return { origin: helper.origin, capability, sessionId };
}

async function responseJson(response: Response) {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxResponseBytes) {
    throw new HelperConnectionError("The local helper response is too large.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new HelperConnectionError(
      "The local helper returned an invalid response.",
      { cause },
    );
  }
}

export class RendererHelperClient {
  constructor(
    private readonly connection: RendererHelperConnection,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(path: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await this.fetcher(`${this.connection.origin}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${this.connection.capability}`,
          ...init.headers,
        },
        signal: controller.signal,
        // Chromium uses this annotation to request the user's Local Network
        // Access permission before contacting an HTTP loopback helper.
        targetAddressSpace: "local",
      } as RequestInit);
      if (!response.ok) {
        throw new HelperConnectionError(
          response.status === 410
            ? "The local renderer helper session expired. Import the renderer file instead."
            : "The local renderer helper is unavailable. Import the renderer file instead.",
        );
      }
      return responseJson(response);
    } catch (error) {
      if (error instanceof HelperConnectionError) throw error;
      throw new HelperConnectionError(
        "The browser could not reach the local renderer helper. Import the renderer file instead.",
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async connect() {
    const session = (await this.request("/v1/session")) as {
      sessionId?: unknown;
      chainId?: unknown;
      expiresAt?: unknown;
    };
    if (
      session.sessionId !== this.connection.sessionId ||
      session.chainId !== 46_630 ||
      typeof session.expiresAt !== "string" ||
      Date.parse(session.expiresAt) <= Date.now()
    ) {
      throw new HelperConnectionError(
        "The local renderer helper session is invalid or expired. Import the renderer file instead.",
      );
    }
    return session;
  }

  getCandidate() {
    return this.request("/v1/candidate");
  }

  getExampleRequests() {
    return this.request("/v1/example-requests");
  }

  submitExampleResults(results: unknown) {
    const body = JSON.stringify(results);
    if (new TextEncoder().encode(body).byteLength > maxResponseBytes) {
      return Promise.reject(
        new HelperConnectionError("The preview result set is too large."),
      );
    }
    return this.request("/v1/example-results", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  }
}
