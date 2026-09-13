import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { PaymentFlow } from "./PaymentFlow";
import { readPaymentFlowPage } from "./payment-flow";
vi.mock("wagmi", () => ({ usePublicClient: () => ({}) }));
vi.mock("./payment-flow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./payment-flow")>()),
  readPaymentFlowPage: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(readPaymentFlowPage).mockReset();
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PaymentFlow
        chainId={31337}
        factory="0x1111111111111111111111111111111111111111"
      />
    </QueryClientProvider>,
  );
}
it("shows a read failure without presenting an empty protocol", async () => {
  vi.mocked(readPaymentFlowPage).mockRejectedValue(
    new Error("RPC unavailable"),
  );
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be refreshed",
  );
  expect(
    screen.queryByText("No membership payments yet."),
  ).not.toBeInTheDocument();
});
it("shows an empty state only after a successful empty read", async () => {
  vi.mocked(readPaymentFlowPage).mockResolvedValue({
    results: [],
    tokens: [],
    total: 0n,
    blockNumber: 1n,
    timestamp: 1n,
    nextOffset: undefined,
  });
  mount();
  expect(await screen.findByText("No membership payments yet.")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
