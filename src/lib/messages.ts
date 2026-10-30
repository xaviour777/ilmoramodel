import { rupees, shortDate } from "@/lib/format";

export type Channel = "whatsapp" | "sms";
export type ChannelChoice = Channel | "auto";

export const CHANNEL_LABEL: Record<Channel, string> = { whatsapp: "WhatsApp", sms: "SMS" };
export const CHOICE_LABEL: Record<ChannelChoice, string> = { auto: "Let Ilmora choose", whatsapp: "WhatsApp", sms: "SMS" };

// A Pakistani mobile in international form (923001234567), or null when it isn't one.
// Accepts 03001234567, 3001234567, +92 300 1234567 and 0092-300-1234567.
export function mobilePK(raw: string | null | undefined): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("0092")) d = d.slice(2);
  if (d.startsWith("92") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return /^3\d{9}$/.test(d) ? "92" + d : null;
}

export const showPhone = (intl: string) => "0" + intl.slice(2, 5) + " " + intl.slice(5);

// Opens WhatsApp (app or web) with the message typed in, ready to send.
export const whatsappLink = (phone: string, text: string) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
// Opens the phone's SMS app with the message typed in.
export const smsLink = (phone: string, text: string) => `sms:+${phone}?body=${encodeURIComponent(text)}`;
export const sendLink = (channel: Channel, phone: string, text: string) =>
  channel === "whatsapp" ? whatsappLink(phone, text) : smsLink(phone, text);

export type Recommendation = { channel: Channel | null; phone: string | null; reason: string; recentlySent?: string };

const DAY = 86_400_000;
// After a WhatsApp reminder this many days old with no payment, switch to SMS.
export const SWITCH_AFTER_DAYS = 3;

// Which channel to remind a family on, and why, in words the accountant can repeat to the parent.
// 1. No mobile number: nothing can be sent.
// 2. The family chose WhatsApp or SMS at admission: use it.
// 3. A WhatsApp reminder went a few days ago and nothing was paid since: send an SMS, it reaches
//    every phone, including ones without internet or WhatsApp.
// 4. Otherwise WhatsApp: it costs the school nothing and parents open it more.
export function recommendChannel(input: {
  reminderPhone: string | null;
  familyPhone: string | null;
  choice: ChannelChoice;
  lastReminder: { channel: Channel; created_at: string } | null;
  lastPaymentAt: string | null;
  now?: Date;
}): Recommendation {
  const phone = mobilePK(input.reminderPhone) ?? mobilePK(input.familyPhone);
  const last = input.lastReminder;
  const now = (input.now ?? new Date()).getTime();
  const days = last ? Math.floor((now - Date.parse(last.created_at)) / DAY) : null;
  const paidSince = !!(last && input.lastPaymentAt && Date.parse(input.lastPaymentAt) > Date.parse(last.created_at));
  const recentlySent = last && days !== null && days < SWITCH_AFTER_DAYS && !paidSince
    ? `${CHANNEL_LABEL[last.channel]} reminder already sent ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}.`
    : undefined;

  if (!phone) return { channel: null, phone: null, reason: "No mobile number on file. Add the reminder number below." };
  if (input.choice !== "auto") {
    return { channel: input.choice, phone, reason: `The family asked for ${CHANNEL_LABEL[input.choice]} reminders.`, recentlySent };
  }
  if (last?.channel === "whatsapp" && days !== null && days >= SWITCH_AFTER_DAYS && !paidSince) {
    return { channel: "sms", phone, reason: `The WhatsApp reminder ${days} days ago brought no payment. An SMS reaches every phone, even without internet.` };
  }
  return { channel: "whatsapp", phone, reason: "WhatsApp is free for the school and parents read it sooner.", recentlySent };
}

export function feeReminderText(p: { familyName: string; balancePaisa: number; dueOn: string | null; campus: string }) {
  const due = p.dueOn ? ` Last date: ${shortDate(p.dueOn)}.` : "";
  return `Assalam o Alaikum. ${p.campus}: ${p.familyName} ki fee ${rupees(p.balancePaisa)} baqi hai.${due} ` +
    `Cash school counter par, ya JazzCash / Easypaisa se jama karwa dein. Shukriya.`;
}

export const noticeText = (p: { title: string; body: string; campus: string }) => `${p.campus} notice: ${p.title}\n${p.body}`;
