import * as de from "./de/index";
import * as en from "./en/index";
import * as es from "./es/index";
import * as fr from "./fr/index";
import * as it from "./it/index";

const items: any = { en, es, fr, de, it };


const fallbackLang = "en";

export const getHelpFile = (lang: string, section: string): string => {
  if (typeof items[lang] !== "undefined" && typeof items[lang][section] !== "undefined") {
    return items[lang][section].default;
  }
  // Fallback to English
  if (typeof items[fallbackLang] !== "undefined" && typeof items[fallbackLang][section] !== "undefined") {
    return items[fallbackLang][section].default;
  }
  throw new Error(`Cannot load help doc for ${lang}-${section}`);
};

export default items;
