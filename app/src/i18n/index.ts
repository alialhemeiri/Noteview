import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ar from "./ar.json";
import type { Language } from "../types";

export const RTL_LANGUAGES: Language[] = ["ar"];

export const i18nReady = i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function isRTLLanguage(lng: string): boolean {
  return RTL_LANGUAGES.includes(lng as Language);
}

export default i18n;
