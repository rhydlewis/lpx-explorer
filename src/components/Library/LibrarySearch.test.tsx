import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { useLibraryStore } from "../../store/library-store";

import { LibrarySearch } from "./LibrarySearch";

describe("<LibrarySearch />", () => {
  beforeEach(() => {
    useLibraryStore.getState().clear();
  });

  afterEach(() => {
    useLibraryStore.getState().clear();
  });

  it("renders a labelled search input", () => {
    render(<LibrarySearch />);

    expect(screen.getByRole("searchbox", { name: /search/i })).toBeInTheDocument();
  });

  it("writes typed input through to the library-store query", () => {
    render(<LibrarySearch />);

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "strings" },
    });

    expect(useLibraryStore.getState().query).toBe("strings");
  });

  it("Escape clears the query", () => {
    useLibraryStore.getState().setQuery("foo");
    render(<LibrarySearch />);

    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });

    expect(useLibraryStore.getState().query).toBe("");
  });

  it("reflects the current store query as the input value", () => {
    useLibraryStore.getState().setQuery("ambient");

    render(<LibrarySearch />);

    expect(screen.getByRole<HTMLInputElement>("searchbox").value).toBe("ambient");
  });
});
