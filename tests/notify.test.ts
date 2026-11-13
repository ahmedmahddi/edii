import { describe, expect, it } from "vitest";
import { digestRegistre, jortRecent, quiet } from "@/lib/notify/digest";
import { renderDigest } from "@/lib/notify/email";
import { mailProvider, sendMail } from "@/lib/notify/send";
import { checkUnsubscribe, unsubscribeToken } from "@/lib/notify/token";
import type { Ligne, Registre } from "@/lib/registre/registre";
import type { Hit } from "@/lib/veille/watch";

const today = new Date("2026-11-16T06:00:00Z"); // a Monday
const texte = (id: string, titre: string) => ({ id, titre, type: "Décret", theme: "Incendie", domaine: "securite", when: [] }) as never;
const ligne = (id: string, patch: Partial<Ligne>): Ligne =>
  ({ texte: texte(id, `Texte ${id}`), retenu: true, origine: "propose", raisons: [], conformite: "", resume: "", risque: "", plan: "", responsable: "", echeance: "", frequence: "Annuelle", evalue: "", vus: [], ...patch }) as Ligne;
const reg = (lignes: Ligne[]): Registre => ({ id: "r1", nom: "Usine de Sfax", cree: "2025-01-01", maj: "2025-01-01", classe: null, etude: null, situation: "existant", activites: [], restauration: null, site: {} as never, lignes, ecartes: [] });

describe("the weekly digest", () => {
  const r = reg([
    ligne("late", { conformite: "C", evalue: "2025-10-01" }), // annual: due 2026-10-01, late
    ligne("soon", { conformite: "C", evalue: "2025-12-01" }), // due 2026-12-01, within 30 days
    ligne("fine", { conformite: "C", evalue: "2026-10-01" }),
    ligne("never", {}),
    ligne("nc-over", { conformite: "NC", evalue: "2026-11-01", echeance: "2026-11-10", responsable: "M. Rebaii" }),
    ligne("nc-plan", { conformite: "NC", evalue: "2026-11-01" }), // no deadline: to plan
    ligne("nc-far", { conformite: "NC", evalue: "2026-11-01", echeance: "2027-03-01" }), // too far to mention
    ligne("nc-done", { conformite: "NC", evalue: "2026-11-01", echeance: "2026-11-10", actionFaite: "2026-11-09" }),
    ligne("out", { retenu: false, conformite: "C", evalue: "2020-01-01" }),
  ]);
  const d = digestRegistre(r, [], [], today);

  it("lists what waits in a register", () => {
    expect(d.retard.map((i) => i.titre)).toEqual(["Texte late"]);
    expect(d.bientot.map((i) => i.titre)).toEqual(["Texte soon"]);
    expect(d.actions.map((i) => i.titre)).toEqual(["Texte nc-over", "Texte nc-plan"]);
    expect(d.actionsDepassees).toBe(1);
    expect(d.aEvaluer).toBe(1);
    expect(quiet(d)).toBe(false);
    expect(quiet(digestRegistre(reg([ligne("fine", { conformite: "C", evalue: "2026-10-01" })]), [], [], today))).toBe(true);
  });

  it("keeps the important JORT texts of the past week", () => {
    const hit = (id: string, date: string, severity: Hit["severity"]) => ({ id, date, severity, issue: 1, year: 2026, title: id, pdf: "x" }) as Hit;
    expect(jortRecent([hit("old", "2026-11-01", "important"), hit("new", "2026-11-12", "important"), hit("info", "2026-11-12", "information")], today).map((h) => h.id)).toEqual(["new"]);
  });

  it("writes an e-mail with a subject that says what matters, and an unsubscribe link", () => {
    const mail = renderDigest({
      name: "Alice",
      workspaces: [{ id: "w", nom: "Client SA", registres: [d] }],
      jort: [],
      appUrl: "https://app.example",
      unsubscribeUrl: "https://app.example/api/notifications/unsubscribe?u=1&t=2",
      today,
    });
    expect(mail.subject).toBe("ABClassement : 1 évaluation en retard, 2 actions à suivre");
    expect(mail.html).toContain("Usine de Sfax");
    expect(mail.html).toContain("1 échéance dépassée");
    expect(mail.html).toContain("M. Rebaii");
    expect(mail.text).toContain("Ne plus recevoir ce récapitulatif : https://app.example/api/notifications/unsubscribe?u=1&t=2");
    expect(mail.html).not.toContain("<script");
  });

  it("escapes what comes from users", () => {
    const evil = { ...d, nom: "<img src=x onerror=alert(1)>" };
    const mail = renderDigest({ name: "<b>", workspaces: [{ id: "w", nom: "W", registres: [evil] }], jort: [], appUrl: "https://a", unsubscribeUrl: "https://a/u", today });
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img src=x");
  });
});

describe("sending and unsubscribing", () => {
  it("signs the unsubscribe link", () => {
    const t = unsubscribeToken("u1", "secret");
    expect(checkUnsubscribe("u1", t, "secret")).toBe(true);
    expect(checkUnsubscribe("u2", t, "secret")).toBe(false);
    expect(checkUnsubscribe("u1", t, "other")).toBe(false);
    expect(checkUnsubscribe("u1", "short", "secret")).toBe(false);
  });

  it("sends through Resend or Brevo, and says what is missing", async () => {
    expect(mailProvider({})).toBeNull();
    expect(await sendMail({ to: "a@b.tn", subject: "s", html: "h", text: "t" }, {})).toMatchObject({ ok: false });
    const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const mail = { to: "a@b.tn", subject: "s", html: "h", text: "t", unsubscribe: "https://x/u" };
    expect(await sendMail(mail, { RESEND_API_KEY: "k", NOTIFY_FROM: "ABClassement <noreply@abc.tn>" }, fake)).toEqual({ ok: true, provider: "resend" });
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].body).toMatchObject({ from: "ABClassement <noreply@abc.tn>", to: ["a@b.tn"], headers: { "List-Unsubscribe": "<https://x/u>" } });
    expect(await sendMail(mail, { BREVO_API_KEY: "k", NOTIFY_FROM: "ABClassement <noreply@abc.tn>" }, fake)).toEqual({ ok: true, provider: "brevo" });
    expect(calls[1].body).toMatchObject({ sender: { name: "ABClassement", email: "noreply@abc.tn" }, to: [{ email: "a@b.tn" }] });
    expect(calls[1].headers["api-key"]).toBe("k");
  });
});
