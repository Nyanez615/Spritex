import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FilterBar, type FilterGroup } from "./FilterBar";

function makeGroup(overrides: Partial<FilterGroup> = {}): FilterGroup {
  return {
    key: "type",
    label: "Type",
    items: ["Fire", "Water", "Grass"],
    active: [],
    onToggle: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
}

describe("FilterBar", () => {
  it("renders the group label and no chip panel until clicked", () => {
    render(<FilterBar groups={[makeGroup()]} />);
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.queryByText("Fire")).not.toBeInTheDocument();
  });

  it("clicking a group button reveals its chips, clicking again hides them", () => {
    render(<FilterBar groups={[makeGroup()]} />);
    fireEvent.click(screen.getByText("Type"));
    expect(screen.getByText("Fire")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Type"));
    expect(screen.queryByText("Fire")).not.toBeInTheDocument();
  });

  it("clicking a chip calls onToggle with that item", () => {
    const onToggle = vi.fn();
    render(<FilterBar groups={[makeGroup({ onToggle })]} />);
    fireEvent.click(screen.getByText("Type"));
    fireEvent.click(screen.getByText("Fire"));
    expect(onToggle).toHaveBeenCalledWith("Fire");
  });

  it("shows an active-count badge and a Clear button only when active.length > 0", () => {
    const onClear = vi.fn();
    render(<FilterBar groups={[makeGroup({ active: ["Fire", "Water"], onClear })]} />);
    expect(screen.getByText("2")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Type"));
    fireEvent.click(screen.getByText("Clear"));
    expect(onClear).toHaveBeenCalled();
  });

  it("only one group's chip panel is open at a time", () => {
    const groups = [makeGroup(), makeGroup({ key: "color", label: "Color", items: ["Red", "Blue"] })];
    render(<FilterBar groups={groups} />);

    fireEvent.click(screen.getByText("Type"));
    expect(screen.getByText("Fire")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Color"));
    expect(screen.queryByText("Fire")).not.toBeInTheDocument();
    expect(screen.getByText("Red")).toBeInTheDocument();
  });

  it("renders leading and trailing content", () => {
    render(<FilterBar groups={[]} leading={<span>Leading content</span>} trailing={<span>Trailing content</span>} />);
    expect(screen.getByText("Leading content")).toBeInTheDocument();
    expect(screen.getByText("Trailing content")).toBeInTheDocument();
  });

  it("renders an itemColor swatch when provided", () => {
    const { container } = render(
      <FilterBar groups={[makeGroup({ itemColor: (item) => (item === "Fire" ? "#F08030" : undefined) })]} />,
    );
    fireEvent.click(screen.getByText("Type"));
    const swatch = container.querySelector('span[style*="background-color"]');
    expect(swatch).toBeTruthy();
  });
});
