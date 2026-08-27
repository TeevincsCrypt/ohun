import "server-only";

import type { EmailMessage } from "./client";

/** Escapes interpolated user content so a display name can't inject markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** `YYYYMMDDTHHmmssZ`, the format Google Calendar's link expects. */
function toCalendarStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function googleCalendarUrl({
  title,
  details,
  start,
  minutes,
}: {
  title: string;
  details: string;
  start: Date;
  minutes: number;
}): string {
  const end = new Date(start.getTime() + minutes * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    details,
    dates: `${toCalendarStamp(start)}/${toCalendarStamp(end)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Rendered in the recipient's own timezone is impossible from a server, so
 * the time is written in UTC with the offset spelled out. Mail clients do
 * not run JavaScript, and guessing the recipient's zone would be worse
 * than being explicit.
 */
function formatWhen(date: Date): string {
  return date.toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export interface ScheduledCallEmailInput {
  /** Who the mail is addressed to. */
  recipientName: string;
  /** The other party on the call. */
  counterpartName: string;
  counterpartUsername: string;
  scheduledAt: string;
  note: string | null;
  /** Absolute URL of the app, for the call-to-action button. */
  siteUrl: string;
  /** True when the recipient is the one who booked it. */
  isOrganizer: boolean;
}

const ASSUMED_DURATION_MINUTES = 30;

export function scheduledCallEmail(input: ScheduledCallEmailInput): Omit<EmailMessage, "to"> {
  const when = new Date(input.scheduledAt);
  const whenLabel = formatWhen(when);

  const subject = input.isOrganizer
    ? `Your call with ${input.counterpartName} is scheduled`
    : `${input.counterpartName} scheduled a call with you`;

  const lead = input.isOrganizer
    ? `You scheduled a call with ${input.counterpartName} (@${input.counterpartUsername}).`
    : `${input.counterpartName} (@${input.counterpartUsername}) scheduled a call with you on OHUN.`;

  const calendarUrl = googleCalendarUrl({
    title: `OHUN call with ${input.counterpartName}`,
    details: input.note ?? `Translated voice call with @${input.counterpartUsername} on OHUN.`,
    start: when,
    minutes: ASSUMED_DURATION_MINUTES,
  });

  const peopleUrl = `${input.siteUrl}/people`;

  const text = [
    lead,
    "",
    `When: ${whenLabel}`,
    input.note ? `Note: ${input.note}` : null,
    "",
    `You can start the call from ${peopleUrl} five minutes before it begins.`,
    "",
    `Add to calendar: ${calendarUrl}`,
    "",
    "OHUN — speak freely, understand instantly.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#0b0b0c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#f4f4f5;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#141416;border:1px solid #27272a;border-radius:16px;">
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 4px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#a1a1aa;">OHUN</p>
          <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#ffffff;">${escapeHtml(subject)}</h1>

          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#d4d4d8;">${escapeHtml(lead)}</p>

          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;background:#1c1c1f;border:1px solid #27272a;border-radius:12px;">
            <tr>
              <td style="padding:16px 20px;">
                <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#a1a1aa;">When</p>
                <p style="margin:0;font-size:16px;font-weight:600;color:#ffffff;">${escapeHtml(whenLabel)}</p>
              </td>
            </tr>
            ${
              input.note
                ? `<tr>
              <td style="padding:0 20px 16px;">
                <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#a1a1aa;">Note</p>
                <p style="margin:0;font-size:15px;line-height:1.5;color:#d4d4d8;">${escapeHtml(input.note)}</p>
              </td>
            </tr>`
                : ""
            }
          </table>

          <a href="${peopleUrl}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#04120c;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;">Open OHUN</a>
          <a href="${calendarUrl}" style="display:inline-block;margin-left:8px;padding:12px 24px;border:1px solid #3f3f46;color:#e4e4e7;font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;">Add to calendar</a>

          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#a1a1aa;">
            You can start the call five minutes before it begins. Either of you can cancel it from the app.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
