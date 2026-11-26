// What the school's public website says, in English and Urdu. Staff edit it in
// Settings → Website; this file only holds the starting text and the shape.
//
// Rule: nothing here states a fact about the school (results, counts, awards, facilities,
// address). Those fields start empty, the page hides them while empty, and the preview
// marks them "to be added by the school".

export type T = { en: string; ur: string };
export type Lang = "en" | "ur";

export type Area = { key: string; title: T; short: T; body: T; image: string };
export type Pillar = { title: T; text: T };
export type DayItem = { time: string; title: T; text: T };
export type Person = { name: string; role: T; bio: T; photo: string };
export type Showcase = { title: T; category: string; text: T; image: string; verified: boolean; consent: boolean };

export type SiteContent = {
  hero: { eyebrow: T; title: T; text: T; image: string; video: string };
  intro: { title: T; text: T; image: string; pillars: Pillar[] };
  principal: { name: string; title: T; message: T; photo: string; video: string };
  about: { story: T; mission: T; vision: T; image: string };
  leadership: Person[];
  areas: Area[];
  aiLab: { title: T; text: T; points: T[]; image: string };
  day: { title: T; text: T; image: string; items: DayItem[] };
  achievements: Showcase[];
  projects: Showcase[];
  admissions: { open: boolean; title: T; text: T; requirements: T; note: T };
  contact: { address: T; phone: string; whatsapp: string; email: string; mapUrl: string; hours: T };
  social: { facebook: string; instagram: string; youtube: string; tiktok: string };
  policies: { privacy: T; childSafety: T };
  seo: { description: T };
};

const t = (en: string, ur: string): T => ({ en, ur });
const empty = (): T => t("", "");

export const ACHIEVEMENT_CATEGORIES = ["Academics", "Science", "Sports", "Arts", "Leadership", "Innovation", "Community service"];
export const PROJECT_CATEGORIES = ["Science model", "Artwork", "Video", "AI-assisted project", "Community project", "Coding"];
export const CATEGORY_UR: Record<string, string> = {
  Academics: "تعلیم", Science: "سائنس", Sports: "کھیل", Arts: "فنون", Leadership: "قیادت", Innovation: "جدت", "Community service": "سماجی خدمت",
  "Science model": "سائنس ماڈل", Artwork: "فن پارہ", Video: "ویڈیو", "AI-assisted project": "اے آئی کی مدد سے پراجیکٹ", "Community project": "کمیونٹی پراجیکٹ", Coding: "کوڈنگ",
};

export const DEFAULT_CONTENT: SiteContent = {
  hero: {
    eyebrow: t("Model Science School & College", "ماڈل سائنس سکول اینڈ کالج"),
    title: t("The Future Starts Here.", "مستقبل کی تیاری یہیں سے"),
    text: t(
      "A place where curiosity becomes confidence, learning becomes achievement, and every child gets an opportunity to build their future.",
      "یہاں تجسس اعتماد میں بدلتا ہے، پڑھائی کامیابی بنتی ہے، اور ہر بچے کو اپنا مستقبل سنوارنے کا موقع ملتا ہے۔",
    ),
    image: "",
    video: "",
  },
  intro: {
    title: t("A school that believes in every child", "ایک سکول جو ہر بچے پر یقین رکھتا ہے"),
    text: t(
      "Every child has potential, and every achievement matters. We care about strong results, and just as much about the person a child becomes: confident, curious, honest and kind.",
      "ہر بچے میں صلاحیت ہے اور ہر کامیابی اہم ہے۔ ہمیں اچھے نتائج کی فکر ہے، اور اتنی ہی اس بات کی کہ بچہ کیسا انسان بنتا ہے: پُراعتماد، جستجو کرنے والا، سچا اور مہربان۔",
    ),
    image: "",
    pillars: [
      { title: t("Academic learning", "تعلیم"), text: t("Clear lessons, regular practice and honest feedback.", "واضح اسباق، باقاعدہ مشق اور سچی رائے۔") },
      { title: t("Personal growth", "شخصیت کی نشوونما"), text: t("Confidence to speak, ask and try again.", "بولنے، سوال کرنے اور دوبارہ کوشش کرنے کا حوصلہ۔") },
      { title: t("Sports", "کھیل"), text: t("Healthy bodies, team spirit and fair play.", "صحت مند جسم، ٹیم ورک اور کھیل میں دیانت۔") },
      { title: t("Creativity", "تخلیق"), text: t("Art, writing and projects children make themselves.", "آرٹ، تحریر اور وہ پراجیکٹ جو بچے خود بناتے ہیں۔") },
      { title: t("Values", "اقدار"), text: t("Respect, honesty and care for others.", "ادب، سچائی اور دوسروں کا خیال۔") },
      { title: t("Technology", "ٹیکنالوجی"), text: t("Using computers and AI wisely and responsibly.", "کمپیوٹر اور اے آئی کا سمجھداری اور ذمہ داری سے استعمال۔") },
    ],
  },
  principal: { name: "", title: t("A word from our Principal", "پرنسپل کا پیغام"), message: empty(), photo: "", video: "" },
  about: { story: empty(), mission: empty(), vision: empty(), image: "" },
  leadership: [],
  areas: [
    {
      key: "academics", image: "",
      title: t("Academic Excellence", "تعلیمی معیار"),
      short: t("Strong foundations in every subject, with regular tests and clear feedback.", "ہر مضمون کی مضبوط بنیاد، باقاعدہ ٹیسٹ اور واضح رائے کے ساتھ۔"),
      body: t(
        "Teachers plan each week, check homework and track every child's marks, so that parents and students always know where they stand and what to practise next.",
        "اساتذہ ہر ہفتے کی منصوبہ بندی کرتے ہیں، ہوم ورک چیک کرتے ہیں اور ہر بچے کے نمبروں پر نظر رکھتے ہیں، تاکہ والدین اور طلبہ کو ہمیشہ پتا ہو کہ وہ کہاں کھڑے ہیں اور آگے کس چیز کی مشق کرنی ہے۔",
      ),
    },
    {
      key: "science", image: "",
      title: t("Science & Discovery", "سائنس اور دریافت"),
      short: t("Asking questions, testing ideas and learning by doing.", "سوال پوچھنا، خیال آزمانا اور کر کے سیکھنا۔"),
      body: t(
        "Science is learned best with hands and eyes, not only from the book. Students make models, run simple experiments and explain what they found.",
        "سائنس صرف کتاب سے نہیں، ہاتھ اور آنکھ سے بہتر سیکھی جاتی ہے۔ طلبہ ماڈل بناتے ہیں، آسان تجربات کرتے ہیں اور اپنے نتائج خود بیان کرتے ہیں۔",
      ),
    },
    {
      key: "technology", image: "",
      title: t("Technology & AI", "ٹیکنالوجی اور اے آئی"),
      short: t("Digital skills and responsible use of AI, step by step.", "ڈیجیٹل مہارتیں اور اے آئی کا ذمہ دارانہ استعمال، قدم بہ قدم۔"),
      body: t(
        "Students learn to use computers with purpose: typing, research, presentations and, as they grow, coding and AI tools, always with a teacher guiding how to use them honestly.",
        "طلبہ مقصد کے ساتھ کمپیوٹر استعمال کرنا سیکھتے ہیں: ٹائپنگ، تحقیق، پریزنٹیشن، اور بڑی کلاسوں میں کوڈنگ اور اے آئی ٹولز، ہمیشہ استاد کی رہنمائی میں کہ انہیں ایمانداری سے کیسے استعمال کیا جائے۔",
      ),
    },
    {
      key: "creative", image: "",
      title: t("Creative Expression", "تخلیقی اظہار"),
      short: t("Art, writing, speaking and making things.", "آرٹ، تحریر، تقریر اور چیزیں بنانا۔"),
      body: t(
        "Every child needs a way to show what they think and feel. Drawing, writing, speeches and short videos give them that voice.",
        "ہر بچے کو اپنی سوچ اور احساس دکھانے کا راستہ چاہیے۔ ڈرائنگ، تحریر، تقریر اور مختصر ویڈیوز انہیں یہ آواز دیتی ہیں۔",
      ),
    },
    {
      key: "sports", image: "",
      title: t("Sports & Wellbeing", "کھیل اور صحت"),
      short: t("Active, healthy children who play fair.", "چست اور صحت مند بچے جو دیانت سے کھیلتے ہیں۔"),
      body: t(
        "Games and physical activity build health, discipline and friendship. Winning matters less than trying hard and playing fair.",
        "کھیل اور جسمانی سرگرمی صحت، نظم و ضبط اور دوستی بناتی ہے۔ جیتنے سے زیادہ اہم محنت اور دیانت سے کھیلنا ہے۔",
      ),
    },
    {
      key: "character", image: "",
      title: t("Character & Leadership", "کردار اور قیادت"),
      short: t("Respect, responsibility and the confidence to lead.", "ادب، ذمہ داری اور آگے بڑھنے کا اعتماد۔"),
      body: t(
        "Children take on small responsibilities in class and school life, learn to work in teams and to treat everyone with respect.",
        "بچے کلاس اور سکول میں چھوٹی ذمہ داریاں سنبھالتے ہیں، ٹیم میں کام کرنا سیکھتے ہیں اور ہر ایک سے عزت سے پیش آتے ہیں۔",
      ),
    },
  ],
  aiLab: {
    title: t("Model AI Lab: learning beyond textbooks", "ماڈل اے آئی لیب: کتاب سے آگے کی تعلیم"),
    text: t(
      "Model AI Lab is our future-skills programme. It sits next to strong academics, not in place of them, and teaches students to use technology to think, create and communicate.",
      "ماڈل اے آئی لیب ہمارا مستقبل کی مہارتوں کا پروگرام ہے۔ یہ مضبوط تعلیم کے ساتھ ہے، اس کی جگہ نہیں، اور طلبہ کو سکھاتا ہے کہ ٹیکنالوجی سے سوچیں، تخلیق کریں اور اپنی بات پہنچائیں۔",
    ),
    points: [
      t("Responsible AI use: when to use it, when not to, and how to check its answers", "اے آئی کا ذمہ دارانہ استعمال: کب کرنا ہے، کب نہیں، اور اس کے جواب کیسے جانچنے ہیں"),
      t("Digital creativity and video production", "ڈیجیٹل تخلیق اور ویڈیو بنانا"),
      t("Communication and presentation", "بات چیت اور پریزنٹیشن"),
      t("Coding and practical technology skills", "کوڈنگ اور عملی ٹیکنالوجی کی مہارتیں"),
    ],
    image: "",
  },
  day: {
    title: t("A day at Model", "ماڈل میں ایک دن"),
    text: t("What a normal school day looks like for our students.", "ہمارے طلبہ کا ایک عام سکول کا دن کیسا ہوتا ہے۔"),
    image: "",
    items: [
      { time: "", title: t("Morning assembly", "صبح کی اسمبلی"), text: t("Recitation, national anthem and a thought for the day.", "تلاوت، قومی ترانہ اور آج کی بات۔") },
      { time: "", title: t("Lessons", "اسباق"), text: t("Focused classes with practice in every period.", "ہر پیریڈ میں توجہ سے پڑھائی اور مشق۔") },
      { time: "", title: t("Break", "وقفہ"), text: t("Play, food and time with friends.", "کھیل، کھانا اور دوستوں کے ساتھ وقت۔") },
      { time: "", title: t("Activities", "سرگرمیاں"), text: t("Science, computers, art or sports.", "سائنس، کمپیوٹر، آرٹ یا کھیل۔") },
      { time: "", title: t("Homework in the diary", "ڈائری میں ہوم ورک"), text: t("Parents see the day's homework on their phone.", "والدین آج کا ہوم ورک اپنے فون پر دیکھتے ہیں۔") },
    ],
  },
  achievements: [],
  projects: [],
  admissions: {
    open: true,
    title: t("Your child's next chapter starts here.", "آپ کے بچے کا نیا باب یہاں سے شروع ہوتا ہے۔"),
    text: t(
      "Choose a class, tell us a little about your child, and book a campus visit or ask a question. No account is needed. The school will call you back.",
      "کلاس چنیں، اپنے بچے کے بارے میں تھوڑا بتائیں، اور سکول دیکھنے کا وقت لیں یا سوال پوچھیں۔ کوئی اکاؤنٹ بنانے کی ضرورت نہیں۔ سکول آپ کو خود فون کرے گا۔",
    ),
    requirements: empty(),
    note: empty(),
  },
  contact: { address: empty(), phone: "", whatsapp: "", email: "", mapUrl: "", hours: empty() },
  social: { facebook: "", instagram: "", youtube: "", tiktok: "" },
  policies: {
    privacy: t(
      "We collect only what we need to run the school and to answer your enquiry. An admission enquiry asks for your child's name, the class, your name and a phone number, and is seen only by the school office and principal. Student records, marks, attendance and fees are private: they are shown only to the child's own guardians, the child, and the school staff who need them, after signing in to My Model. We never show a student's marks or contact details on the public website. You may ask the school to correct or delete your information at any time.",
      "ہم صرف وہی معلومات لیتے ہیں جو سکول چلانے اور آپ کے سوال کا جواب دینے کے لیے ضروری ہیں۔ داخلے کی درخواست میں بچے کا نام، کلاس، آپ کا نام اور فون نمبر پوچھا جاتا ہے، جو صرف سکول آفس اور پرنسپل دیکھتے ہیں۔ طلبہ کا ریکارڈ، نمبر، حاضری اور فیس نجی ہیں: یہ صرف بچے کے اپنے والدین، خود بچے اور ان اساتذہ کو نظر آتے ہیں جنہیں ضرورت ہو، وہ بھی مائی ماڈل میں لاگ اِن کے بعد۔ ہم ویب سائٹ پر کبھی کسی طالب علم کے نمبر یا رابطہ نمبر نہیں دکھاتے۔ آپ کسی بھی وقت سکول سے اپنی معلومات درست کروا یا ختم کروا سکتے ہیں۔",
    ),
    childSafety: t(
      "Children's safety comes first, online and on campus. A child's photo, name or work appears on this website only after a teacher has checked it and the child's guardian has given permission, and it is removed as soon as that permission is withdrawn. We do not publish marks, home addresses or phone numbers of students. Any concern about a child's safety can be raised with the principal directly, and it will be handled in confidence.",
      "بچوں کی حفاظت سب سے پہلے ہے، آن لائن بھی اور سکول میں بھی۔ کسی بچے کی تصویر، نام یا کام اس ویب سائٹ پر تب ہی آتا ہے جب استاد نے اسے دیکھ لیا ہو اور بچے کے والدین نے اجازت دی ہو، اور اجازت واپس لیتے ہی اسے ہٹا دیا جاتا ہے۔ ہم طلبہ کے نمبر، گھر کا پتا یا فون نمبر شائع نہیں کرتے۔ بچے کی حفاظت سے متعلق کوئی بھی فکر براہِ راست پرنسپل کو بتائیں، اسے راز داری سے دیکھا جائے گا۔",
    ),
  },
  seo: {
    description: t(
      "Model Science School & College, Allahabad, Kasur. Academics, science, technology and character, with admissions open online.",
      "ماڈل سائنس سکول اینڈ کالج، الہ آباد، قصور۔ تعلیم، سائنس، ٹیکنالوجی اور کردار سازی۔ داخلے کے لیے آن لائن رابطہ کریں۔",
    ),
  },
};

// Saved content is merged over the defaults so a field added later always has a value.
function merge<V>(base: V, over: unknown): V {
  if (over === undefined || over === null) return base;
  if (Array.isArray(base)) return (Array.isArray(over) ? over : base) as V;
  if (typeof base === "object" && base !== null) {
    if (typeof over !== "object" || Array.isArray(over)) return base;
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const k of Object.keys(base as object)) out[k] = merge((base as Record<string, unknown>)[k], (over as Record<string, unknown>)[k]);
    return out as V;
  }
  return (typeof over === typeof base ? over : base) as V;
}

export function withDefaults(saved: unknown): SiteContent {
  const c = merge(DEFAULT_CONTENT, saved);
  // list items saved before a field existed still get every field
  c.areas = c.areas.map((a, i) => merge(DEFAULT_CONTENT.areas[i] ?? DEFAULT_CONTENT.areas[0], a));
  return c;
}

// The text in the visitor's language, falling back to the other language when one is empty.
export const pick = (v: T | undefined, lang: Lang) => (v ? (lang === "ur" ? v.ur || v.en : v.en || v.ur) : "");
export const filled = (v: T | string | undefined) => (typeof v === "string" ? !!v.trim() : !!(v && (v.en.trim() || v.ur.trim())));

// Only showcase items a teacher verified and, where a child is shown, a guardian allowed.
export const visibleShowcase = (items: Showcase[]) => items.filter((x) => x.verified && x.consent && filled(x.title));

// What the school still has to add before the site looks complete (shown in Settings → Website).
export function missingFacts(c: SiteContent): string[] {
  const m: string[] = [];
  if (!c.hero.image) m.push("Hero photo of the school");
  if (!filled(c.principal.message)) m.push("Principal's message");
  if (!c.principal.name.trim()) m.push("Principal's name");
  if (!filled(c.about.story)) m.push("Our story (About page)");
  if (!filled(c.contact.address)) m.push("School address");
  if (!c.contact.phone.trim()) m.push("Phone number");
  if (!c.contact.whatsapp.trim()) m.push("Official WhatsApp number");
  if (!filled(c.admissions.requirements)) m.push("Admission requirements");
  if (c.policies.privacy.en === DEFAULT_CONTENT.policies.privacy.en) m.push("Read and approve the privacy policy text");
  if (c.policies.childSafety.en === DEFAULT_CONTENT.policies.childSafety.en) m.push("Read and approve the child safety text");
  return m;
}
