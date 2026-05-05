import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { StatusDot } from "./StatusDot";

describe("<StatusDot />", () => {
  it("renders an aria-hidden span (decorative)", () => {
    const { container } = render(<StatusDot status="clean" />);

    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(span?.getAttribute("aria-hidden")).toBe("true");
  });

  it("encodes the status as a data-status attribute for CSS targeting", () => {
    const { container } = render(<StatusDot status="warn" />);

    expect(container.querySelector("[data-status='warn']")).not.toBeNull();
  });

  it("supports each documented status without throwing", () => {
    for (const status of ["clean", "warn", "fail", "neutral"] as const) {
      const { container } = render(<StatusDot status={status} />);
      expect(container.querySelector(`[data-status='${status}']`)).not.toBeNull();
    }
  });
});
