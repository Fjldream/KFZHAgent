import { createI18n } from 'vue-i18n';
import zh from '@/i18n/i18nLaguage/zh.js';
import en from '@/i18n/i18nLaguage/en.js';
import ko from '@/i18n/i18nLaguage/ko.js';
import ja from '@/i18n/i18nLaguage/ja.js';

const locale = import.meta.env.VITE_LANGUAGE;

const i18n = createI18n({
  legacy: false,
  locale,
  globalInjection: true, // ✅ 关键：允许全局注入 t()
  messages: {
    zh,
    en,
    ko,
    ja,
  },
});

export const { t } = i18n.global; // ✅ 导出全局 t 方法

export default i18n;
