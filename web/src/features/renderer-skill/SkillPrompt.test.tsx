import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SkillPrompt } from "@/features/renderer-skill/SkillPrompt";

describe("renderer skill prompt", () => {
  it("lets a creator revise and copy the agent prompt", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();

    render(<SkillPrompt skillUrl="https://example.com/skill" />);

    const prompt = screen.getByLabelText("Your agent prompt");
    expect((prompt as HTMLTextAreaElement).value).toMatch(
      /show me the representative previews/i,
    );
    expect((prompt as HTMLTextAreaElement).value).not.toMatch(
      /ask me three short questions/i,
    );
    expect((prompt as HTMLTextAreaElement).value).not.toMatch(/dogs/i);

    await user.clear(prompt);
    await user.type(prompt, "Create an onchain design about rabbits.");
    await user.click(screen.getByRole("button", { name: "Copy agent prompt" }));

    expect(writeText).toHaveBeenCalledWith(
      "Create an onchain design about rabbits.",
    );
    expect(screen.getByRole("button", { name: "Prompt copied" })).toBeVisible();
    expect(
      screen.getByText("Paste it into your agent and keep working there."),
    ).toBeVisible();
  });
});
