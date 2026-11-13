/** The unsubscribe link's signature: HMAC-SHA256 of the account id, with the deployment's secret. */
import { createHmac, timingSafeEqual } from "node:crypto";

export function unsubscribeToken(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`unsubscribe:${userId}`).digest("base64url");
}

export function checkUnsubscribe(userId: string, token: string, secret: string): boolean {
  const want = Buffer.from(unsubscribeToken(userId, secret));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}
