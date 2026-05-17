import { ru, type RuDictionary } from "../i18n/ru";

type Locale = "ru";
type SupportedDictionary = RuDictionary;

export class LocalizationService {
  private language: Locale = "ru";
  private dictionary: SupportedDictionary = ru;

  setLanguage(lang?: string): void {
    this.language = lang === "ru" ? "ru" : "ru";
    this.dictionary = ru;
  }

  getLanguage(): Locale {
    return this.language;
  }

  t<TKey extends keyof SupportedDictionary>(key: TKey): SupportedDictionary[TKey] {
    return this.dictionary[key];
  }
}
