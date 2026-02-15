import { createIntl, createIntlCache } from "react-intl";
import langDe from "./lang/de.json";
import langEn from "./lang/en.json";
import langEs from "./lang/es.json";
import langFr from "./lang/fr.json";
import langIt from "./lang/it.json";
import langRo from "./lang/ro.json";
import langList from "./lang/lang-list.json";

// first item of each array should be the language code,
// not the country code
// Remember when adding to this list, also update check-locales.js script
const localeOptions = [
  { code: "en", locale: "en-US", messages: langEn, label: "English" },
  { code: "es", locale: "es-ES", messages: langEs, label: "Español" },
  { code: "fr", locale: "fr-FR", messages: langFr, label: "Français" },
  { code: "de", locale: "de-DE", messages: langDe, label: "German" },
  { code: "it", locale: "it-IT", messages: langIt, label: "Italiano" },
  { code: "ro", locale: "ro-RO", messages: langRo, label: "Română" },
];

const loadMessages = (locale?: string): typeof langList & typeof langEn => {
  const thisLocale = (locale || "en").slice(0, 2);

  // ensure this lang exists in localeOptions above, otherwise fallback to en
  if (thisLocale === "en" || !localeOptions.some((item) => item.code === thisLocale)) {
    return Object.assign({}, langList, langEn);
  }

  return Object.assign({}, langList, langEn, localeOptions.find((item) => item.code === thisLocale)?.messages);
};

const getLocale = (short = false) => {
  let loc = window.localStorage.getItem("locale");
  if (!loc) {
    loc = document.documentElement.lang;
  }
  if (short) {
    return loc.slice(0, 2);
  }
  // finally, fallback
  if (!loc) {
    loc = "en";
  }
  return loc;
};

const cache = createIntlCache();

const initialMessages = loadMessages(getLocale());
let intl = createIntl({ locale: getLocale(), messages: initialMessages }, cache);

const changeLocale = (locale: string): void => {
  const messages = loadMessages(locale);
  intl = createIntl({ locale, messages }, cache);
  window.localStorage.setItem("locale", locale);
  document.documentElement.lang = locale;
};

// This is a translation component that wraps the translation in a span with a data
// attribute so devs can inspect the element to see the translation ID
const T = ({
  id,
  data,
  tData,
}: {
  id: string;
  data?: Record<string, string | number | undefined>;
  tData?: Record<string, string>;
}) => {
  const translatedData: Record<string, string> = {};
  if (tData) {
    // iterate over tData and translate each value
    Object.entries(tData).forEach(([key, value]) => {
      translatedData[key] = intl.formatMessage({ id: value });
    });
  }
  return (
    <span data-translation-id={id}>
      {intl.formatMessage(
        { id },
        {
          ...data,
          ...translatedData,
        },
      )}
    </span>
  );
};

//console.log("L:", localeOptions);

export { localeOptions, getLocale, createIntl, changeLocale, intl, T };
