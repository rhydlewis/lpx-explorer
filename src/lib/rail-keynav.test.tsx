import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { handleRailKeyDown } from "./rail-keynav";

function Rail({ rowCount = 3 }: { readonly rowCount?: number }) {
  return (
    <div onKeyDown={handleRailKeyDown}>
      {Array.from({ length: rowCount }, (_, i) => (
        <button
          key={i}
          type="button"
          data-rail-row="true"
          data-testid={`row-${i}`}
        >
          Row {i}
        </button>
      ))}
    </div>
  );
}

describe("handleRailKeyDown", () => {
  it("ArrowDown moves focus to the next rail row", () => {
    const { getByTestId } = render(<Rail />);
    const r0 = getByTestId("row-0");
    r0.focus();

    fireEvent.keyDown(r0, { key: "ArrowDown" });

    expect(document.activeElement).toBe(getByTestId("row-1"));
  });

  it("ArrowUp moves focus to the previous rail row", () => {
    const { getByTestId } = render(<Rail />);
    const r2 = getByTestId("row-2");
    r2.focus();

    fireEvent.keyDown(r2, { key: "ArrowUp" });

    expect(document.activeElement).toBe(getByTestId("row-1"));
  });

  it("ArrowDown on the last row stays put", () => {
    const { getByTestId } = render(<Rail />);
    const last = getByTestId("row-2");
    last.focus();

    fireEvent.keyDown(last, { key: "ArrowDown" });

    expect(document.activeElement).toBe(last);
  });

  it("ArrowUp on the first row stays put", () => {
    const { getByTestId } = render(<Rail />);
    const first = getByTestId("row-0");
    first.focus();

    fireEvent.keyDown(first, { key: "ArrowUp" });

    expect(document.activeElement).toBe(first);
  });

  it("Home jumps to the first rail row", () => {
    const { getByTestId } = render(<Rail />);
    const r2 = getByTestId("row-2");
    r2.focus();

    fireEvent.keyDown(r2, { key: "Home" });

    expect(document.activeElement).toBe(getByTestId("row-0"));
  });

  it("End jumps to the last rail row", () => {
    const { getByTestId } = render(<Rail />);
    const r0 = getByTestId("row-0");
    r0.focus();

    fireEvent.keyDown(r0, { key: "End" });

    expect(document.activeElement).toBe(getByTestId("row-2"));
  });

  it("ignores keys that aren't arrow / Home / End", () => {
    const { getByTestId } = render(<Rail />);
    const r0 = getByTestId("row-0");
    r0.focus();

    fireEvent.keyDown(r0, { key: "Tab" });

    expect(document.activeElement).toBe(r0);
  });

  it("ignores arrow keys when target isn't a rail row", () => {
    const { getByText } = render(
      <div onKeyDown={handleRailKeyDown}>
        <button type="button" data-rail-row="true">
          A row
        </button>
        <button type="button">Not a rail row</button>
      </div>,
    );
    const notARow = getByText("Not a rail row");
    notARow.focus();

    fireEvent.keyDown(notARow, { key: "ArrowDown" });

    expect(document.activeElement).toBe(notARow);
  });
});
