import "server-only";

/**
 * Minimal Resend client over fetch — the REST API is a single POST, so a
 * dependency would buy nothing.
 *
 * Every send is best-effort. Notification email is a courtesy on top of an
 * action the user already completed successfully; a provider outage must
 * never turn a scheduled call into an error.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** True when email is configured at all. Lets callers skip the work entirely. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(message: EmailMessage): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn("[ohun/email] skipped — RESEND_API_KEY or EMAIL_FROM is unset");
    return { sent: false };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      // Resend puts the useful part in the body — a bare status is not
      // enough to tell "unverified domain" from "bad key".
      const detail = await response.text().catch(() => "");
      console.error("[ohun/email] send failed", response.status, detail);
      return { sent: false };
    }

    return { sent: true };
  } catch (error) {
    console.error("[ohun/email] send threw", error);
    return { sent: false };
  }
}
