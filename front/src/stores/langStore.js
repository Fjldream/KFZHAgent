import { defineStore } from 'pinia';
import i18n from '@/i18n/index.js';
import zh from '@/i18n/i18nLaguage/zh.js';
import en from '@/i18n/i18nLaguage/en.js';
import ko from '@/i18n/i18nLaguage/ko.js';
import ja from '@/i18n/i18nLaguage/ja.js';

export const useLangStore = defineStore(
  'langStore',
  () => {
    const currentLang = ref(import.meta.env.VITE_LANGUAGE);

    const elementLocale = computed(() => {
      switch (currentLang.value) {
        case 'en':
          return en;
        case 'ko':
          return ko;
        case 'ja':
          return ja;
        default:
          return zh;
      }
    });

    watchEffect(() => {
      i18n.global.locale.value = currentLang.value;
    });

    /**
     * 切换语言
     *
     * @param {string} lang 语言代码，可选值为 'zh' 或 'en'
     */
    function switchLang(lang) {
      // 设置当前语言
      currentLang.value = lang;
    }

    // 组件外响应式翻译(非.vue文件中使用)
    const i18nReactive = (key, ...args) => {
      const i18nValue = ref('');
      watchEffect(() => {
        i18nValue.value = i18n.global.t(key, ...args);
      });
      return i18nValue;
    };

    const laguageMap = new Map([
      ['zh', '中文简体'],
      ['ko', '한글'],
      ['en', 'English'],
      ['ja', '日本語'],
    ]);
    const laguageCommand = computed(() => {
      return [...i18n.global.availableLocales].reverse().map((item) => ({ value: item, label: laguageMap.get(item) }));
    });
    return {
      currentLang,
      elementLocale,
      laguageCommand,
      switchLang,
      i18nReactive,
    };
  },
  {
    persist: {
      enabled: true,
      storage: localStorage, // 使用 localStorage
    },
  },
);
