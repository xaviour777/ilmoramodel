import { createHmac, timingSafeEqual } from "crypto";

// JazzCash hosted checkout (Page Redirection, v1.1). Credentials come from the server env:
// JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD, JAZZCASH_INTEGRITY_SALT and optionally JAZZCASH_URL
// (defaults to the sandbox). Nothing here works until they are set.
export const JAZZ_URL = process.env.JAZZCASH_URL || "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/";
export const jazzReady = () => !!(process.env.JAZZCASH_MERCHANT_ID && process.env.JAZZCASH_PASSWORD && process.env.JAZZCASH_INTEGRITY_SALT);
export const jazzSandbox = () => JAZZ_URL.includes("sandbox");

// HMAC-SHA256 over salt & every non-empty pp_ value, sorted by field name.
export function jazzHash(fields: Record<string, string>) {
  const salt = process.env.JAZZCASH_INTEGRITY_SALT!;
  const msg = [salt, ...Object.keys(fields).filter((k) => k.startsWith("pp_") && k !== "pp_SecureHash" && fields[k] !== "").sort().map((k) => fields[k])].join("&");
  return createHmac("sha256", salt).update(msg).digest("hex").toUpperCase();
}

export function jazzVerify(fields: Record<string, string>) {
  const got = (fields.pp_SecureHash ?? "").toUpperCase();
  const want = jazzHash(fields);
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

const stamp = (d: Date) => d.toLocaleString("sv-SE", { timeZone: "Asia/Karachi" }).replace(/\D/g, "").slice(0, 14);

export function jazzFields(o: { ref: string; amountPaisa: number; bill: string; description: string; returnUrl: string }) {
  const now = new Date();
  const f: Record<string, string> = {
    pp_Version: "1.1", pp_TxnType: "", pp_Language: "EN", pp_MerchantID: process.env.JAZZCASH_MERCHANT_ID!, pp_SubMerchantID: "",
    pp_Password: process.env.JAZZCASH_PASSWORD!, pp_BankID: "TBANK", pp_ProductID: "RETL", pp_TxnRefNo: o.ref,
    pp_Amount: String(Math.round(o.amountPaisa)), pp_TxnCurrency: "PKR", pp_TxnDateTime: stamp(now),
    pp_BillReference: o.bill.replace(/[^A-Za-z0-9]/g, "").slice(0, 20) || "fee", pp_Description: o.description.replace(/[^A-Za-z0-9 ]/g, "").slice(0, 100),
    pp_TxnExpiryDateTime: stamp(new Date(now.getTime() + 864e5)), pp_ReturnURL: o.returnUrl,
    ppmpf_1: "", ppmpf_2: "", ppmpf_3: "", ppmpf_4: "", ppmpf_5: "",
  };
  f.pp_SecureHash = jazzHash(f);
  return f;
}
