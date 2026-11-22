export const SHOP_CATS: [string, string][] = [["books", "Books"], ["uniform", "Uniform"], ["stationery", "Stationery"], ["other", "Other"]];
export const SHOP_STATUS: Record<string, [string, string]> = { pending: ["Waiting for payment", "pill-orange"], paid: ["Paid, ready to collect", "pill-blue"], delivered: ["Handed over", "pill-green"], cancelled: ["Cancelled", "pill-gray"] };
export const SHOP_MODE: Record<string, string> = { cash: "Cash at office", jazzcash: "JazzCash", easypaisa: "Easypaisa" };
