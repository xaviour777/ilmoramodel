const OK: Record<string, [string, string]> = {
  sent: ["Added. A teacher will check it.", "شامل ہو گیا۔ استاد چیک کریں گے۔"], added: ["Added to the passport.", "پاسپورٹ میں شامل ہو گیا۔"],
  removed: ["Removed.", "ہٹا دیا گیا۔"], goal: ["Goal saved.", "ہدف محفوظ ہو گیا۔"], "goal-done": ["Goal reached. Well done!", "ہدف پورا ہو گیا۔ شاباش!"],
  "share-on": ["Sharing link is on.", "شیئر لنک چالو ہو گیا۔"], "share-off": ["Sharing is off. Nothing is public now.", "شیئر بند۔ اب کچھ بھی عوامی نہیں۔"],
  approved: ["Approved.", "منظور ہو گیا۔"], rejected: ["Sent back with your note.", "آپ کے نوٹ کے ساتھ واپس بھیج دیا۔"], rule: ["Rule saved.", "اصول محفوظ ہو گیا۔"], saved: ["Saved.", "محفوظ ہو گیا۔"],
};

export function Flash({ saved, error, ur }: { saved?: string; error?: string; ur: boolean }) {
  if (error) return <div className="notice-bad">{error}</div>;
  if (saved) return <div className="notice-ok">{(OK[saved] ?? OK.saved)[ur ? 1 : 0]}</div>;
  return null;
}
