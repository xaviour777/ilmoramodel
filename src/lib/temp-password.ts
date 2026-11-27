// A fresh password that is easy to read out on the phone: four letters, a dash, four digits.
export function tempPassword() {
  const abc = "abcdefghjkmnpqrstuvwxyz", num = "23456789";
  const pick = (set: string, n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => set[x % set.length]).join("");
  return `${pick(abc, 4)}-${pick(num, 4)}`;
}

export type LoginState = { ok?: boolean; error?: string; login?: string; password?: string; name?: string } | null;

// m923001234567@phone.prinqo.app -> 03001234567
export function showLogin(login: string) {
  const m = login.match(/^m92(\d{10})@phone\.prinqo\.app$/);
  return m ? `0${m[1]}` : login;
}
