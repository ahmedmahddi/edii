import { describe, expect, it } from "vitest";
import { frenchError } from "@/lib/cloud/errors";

describe("Supabase's messages, in French", () => {
  it("says why an address is refused", () => {
    expect(frenchError(new Error('Email address "ali@gmail.com" is invalid'))).toMatch(/^Cette adresse e-mail est refusée/);
    expect(frenchError(new Error("Email address not authorized"))).toMatch(/configuration de l’envoi des e-mails/);
    expect(frenchError(new Error("Invalid login credentials"))).toBe("Adresse e-mail ou mot de passe incorrect.");
  });
});
