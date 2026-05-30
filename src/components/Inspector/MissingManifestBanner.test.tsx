import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { MissingManifestBanner } from "./MissingManifestBanner";

describe("<MissingManifestBanner />", () => {
  it("warns and names the missing file when the manifest is absent", () => {
    // lpx-explorer-dfg: the AC requires the banner to name the missing
    // file so the user knows exactly what's wrong, not just that
    // something is.
    render(<MissingManifestBanner missing={true} />);

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/ProjectInformation\.plist/);
  });

  it("renders nothing when the manifest is present", () => {
    const { container } = render(<MissingManifestBanner missing={false} />);

    expect(container).toBeEmptyDOMElement();
  });
});
