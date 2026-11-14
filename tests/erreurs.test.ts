import { describe, expect, it } from "vitest";
import { parseErreur } from "@/lib/erreurs";

describe("an error reported by a browser", () => {
  it("keeps the message, the stack and the path only", () => {
    expect(parseErreur({ message: " Boom ", stack: "at x", url: "https://abc.tn/classement?e=1214:5000", digest: "123", user: "someone" })).toEqual({
      message: "Boom",
      stack: "at x",
      url: "/classement",
      digest: "123",
    });
  });
  it("cuts what is too long, and refuses a report without message", () => {
    expect(parseErreur({ message: "x".repeat(5000) })!.message).toHaveLength(1000);
    expect(parseErreur({ message: "  " })).toBeNull();
    expect(parseErreur("nope")).toBeNull();
  });
});
