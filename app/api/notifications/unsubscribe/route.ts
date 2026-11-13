/**
 * The digest's unsubscribe link: /api/notifications/unsubscribe?u=<account>&t=<signature>.
 * GET (a click) and POST (mail clients' one-click unsubscribe, RFC 8058) both turn it off.
 */
import { serviceClient } from "@/lib/cloud/server";
import { clientAddress, rateLimit, tooMany } from "@/lib/ratelimit";
import { checkUnsubscribe } from "@/lib/notify/token";

export const dynamic = "force-dynamic";

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#eef1f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
<div style="max-width:480px;margin:64px auto;padding:28px 24px;background:#fff;border-radius:16px;border:1px solid #e2e8f0">
<p style="margin:0 0 12px;font-size:22px;font-weight:700;letter-spacing:-.03em"><span style="color:#0a6ed1">ABC</span>lassement</p>
<h1 style="font-size:20px;margin:0 0 8px;color:#0f172a">${title}</h1><p style="margin:0;color:#475569;line-height:1.5">${body}</p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function unsubscribe(request: Request): Promise<Response> {
  const limited = rateLimit(`unsubscribe:${clientAddress(request)}`, 20, 60_000);
  if (!limited.ok) return tooMany(limited.retryAfter);
  const url = new URL(request.url);
  const u = url.searchParams.get("u") ?? "";
  const t = url.searchParams.get("t") ?? "";
  const secret = process.env.CRON_SECRET;
  const db = serviceClient();
  if (!secret || !db || !/^[0-9a-f-]{36}$/i.test(u) || !checkUnsubscribe(u, t, secret))
    return page("Lien invalide", "Ce lien de désinscription n’est pas valide. Vous pouvez arrêter le récapitulatif dans Mon compte.", 400);
  const { error } = await db.from("profiles").update({ notifications: false }).eq("id", u);
  if (error) return page("Erreur", "La désinscription n’a pas pu être enregistrée. Réessayez plus tard, ou arrêtez le récapitulatif dans Mon compte.", 500);
  return page("C’est noté", "Vous ne recevrez plus le récapitulatif hebdomadaire. Vous pouvez le réactiver à tout moment dans Mon compte.");
}

export const GET = unsubscribe;
export const POST = unsubscribe;
