/**
 * Sending an e-mail, through Resend (RESEND_API_KEY) or Brevo (BREVO_API_KEY), from NOTIFY_FROM
 * ("ABClassement <noreply@your-domain>"). Both are plain HTTPS APIs: no SDK.
 */
export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribe?: string; // List-Unsubscribe (one click, RFC 8058)
}
export type Sent = { ok: true; provider: string } | { ok: false; provider: string; error: string };

type Env = Record<string, string | undefined>;

export function mailProvider(env: Env = process.env): "resend" | "brevo" | null {
  if (env.RESEND_API_KEY) return "resend";
  if (env.BREVO_API_KEY) return "brevo";
  return null;
}

/** "Name <address>" → its parts. */
function sender(from: string): { name: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1] || "ABClassement", email: m[2] } : { name: "ABClassement", email: from.trim() };
}

export async function sendMail(mail: Mail, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<Sent> {
  const provider = mailProvider(env);
  const from = env.NOTIFY_FROM;
  if (!provider || !from) return { ok: false, provider: provider ?? "aucun", error: "RESEND_API_KEY (ou BREVO_API_KEY) et NOTIFY_FROM manquants" };
  const headers: Record<string, string> = mail.unsubscribe ? { "List-Unsubscribe": `<${mail.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {};
  try {
    const res =
      provider === "resend"
        ? await fetchImpl("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text, headers }),
            signal: AbortSignal.timeout(15_000),
          })
        : await fetchImpl("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: { "api-key": env.BREVO_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ sender: sender(from), to: [{ email: mail.to }], subject: mail.subject, htmlContent: mail.html, textContent: mail.text, headers }),
            signal: AbortSignal.timeout(15_000),
          });
    if (res.ok) return { ok: true, provider };
    return { ok: false, provider, error: `HTTP ${res.status} ${(await res.text()).slice(0, 200)}` };
  } catch (error) {
    return { ok: false, provider, error: error instanceof Error ? error.message : String(error) };
  }
}
