// URL-friendly slug. Должен быть строго ASCII (HTTP-заголовки, в т.ч.
// x-action-redirect от Server Actions, не пропускают не-ASCII).
// Кириллица транслитерируется по упрощённой карте, остальные не-латинские
// символы отбрасываются; короткий случайный суффикс добавляется отдельно
// через withRandomSuffix.

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function transliterate(input: string): string {
  let out = "";
  for (const ch of input.toLowerCase()) {
    out += TRANSLIT[ch] ?? ch;
  }
  return out;
}

export function slugify(input: string): string {
  return transliterate(input.normalize("NFKD"))
    .replace(/[^a-z0-9\s_-]+/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function withRandomSuffix(slug: string, suffix: string): string {
  return slug ? `${slug}-${suffix}` : suffix;
}
