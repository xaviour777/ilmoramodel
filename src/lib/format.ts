const inr = new Intl.NumberFormat("en-IN");

// Rupees from whole paisa, written the Pakistani way (Rs 1,50,000).
export const rupees = (paisa: number) => "Rs " + inr.format(Math.round(paisa / 100));
export const pct = (x: number, digits = 0) => (x * 100).toFixed(digits) + "%";

// Today's date in Pakistan as YYYY-MM-DD.
export const todayPK = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());

export const shortDate = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export const time = (t: string | null) => (t ? t.slice(0, 5) : "");
