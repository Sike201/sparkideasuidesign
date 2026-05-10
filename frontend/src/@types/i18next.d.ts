import en from "@/i18n/locales/en.json"

// This file adds type safety to using useTranslations() hook

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "en" // default language
    resources: {
      en: typeof en
    }
  }
}
