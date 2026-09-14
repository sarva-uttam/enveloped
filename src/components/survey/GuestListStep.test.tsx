// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { GuestListStep } from "./GuestListStep";
import type { GuestRow } from "./guest-utils";

afterEach(() => cleanup());

/** A thin stateful wrapper so tests can interact with the component the way the real survey does (controlled rows + onChange). */
function Harness({ initial = [], showValidation = false }: { initial?: GuestRow[]; showValidation?: boolean }) {
  const [rows, setRows] = useState<GuestRow[]>(initial);
  return <GuestListStep rows={rows} onChange={setRows} showValidation={showValidation} />;
}

describe("GuestListStep — structured guest entry", () => {
  it("shows a helpful empty state and a zero count when there are no rows", () => {
    render(<Harness />);
    expect(screen.getByText("No guests yet.")).toBeTruthy();
    expect(screen.getByText(/0 guests added/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add your first guest" })).toBeTruthy();
  });

  it("adds a row, editing its name updates the visible count", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Add your first guest" }));
    const input = screen.getByLabelText("Guest 1 name");
    fireEvent.change(input, { target: { value: "Aria Thompson" } });
    expect(screen.getByText(/1 guest added/)).toBeTruthy();
  });

  it("adding a second row after the first is named uses the 'add another' label", () => {
    render(<Harness initial={[{ id: "r1", name: "Aria" }]} />);
    expect(screen.getByRole("button", { name: "Add another guest" })).toBeTruthy();
  });

  it("removing a row drops it from the list and updates the count", () => {
    render(<Harness initial={[{ id: "r1", name: "Aria" }, { id: "r2", name: "Rohan" }]} />);
    expect(screen.getByText(/2 guests added/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove guest 1" }));
    expect(screen.getByText(/1 guest added/)).toBeTruthy();
    expect(screen.queryByDisplayValue("Aria")).toBeNull();
  });

  it("blank rows don't count toward the visible total (empty entries are rejected from the count)", () => {
    render(<Harness initial={[{ id: "r1", name: "Aria" }, { id: "r2", name: "   " }]} />);
    expect(screen.getByText(/1 guest added/)).toBeTruthy();
  });

  it("shows a validation message only once the user has attempted to advance with zero named guests", () => {
    const { rerender } = render(<Harness showValidation={false} />);
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(<Harness showValidation />);
    expect(screen.getByRole("alert").textContent).toMatch(/at least one guest/i);
  });

  it("paste-multiple mode parses pasted text into new rows", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Paste multiple names" }));
    const textarea = screen.getByLabelText(/Paste names/);
    fireEvent.change(textarea, { target: { value: "Aria Thompson\nRohan Mehta, The Alvarez Family" } });
    fireEvent.click(screen.getByRole("button", { name: "Add these names" }));
    expect(screen.getByText(/3 guests added/)).toBeTruthy();
    expect(screen.getByDisplayValue("Aria Thompson")).toBeTruthy();
    expect(screen.getByDisplayValue("Rohan Mehta")).toBeTruthy();
    expect(screen.getByDisplayValue("The Alvarez Family")).toBeTruthy();
  });

  it("pasting malformed input (blank lines, stray commas) never crashes and adds nothing", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Paste multiple names" }));
    const textarea = screen.getByLabelText(/Paste names/);
    fireEvent.change(textarea, { target: { value: "   ,, \n\n  " } });
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Add these names" }))).not.toThrow();
    expect(screen.getByText(/0 guests added/)).toBeTruthy();
  });
});
