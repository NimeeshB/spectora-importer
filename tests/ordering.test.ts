import { expect, it } from "vitest";
import { renumber, reorder } from "../lib/ordering";

it("reorders and renumbers contiguously", () => {
  expect(reorder(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  expect(renumber(["b", "c", "a"])).toEqual([{ id: "b", position: 0 }, { id: "c", position: 1 }, { id: "a", position: 2 }]);
});
