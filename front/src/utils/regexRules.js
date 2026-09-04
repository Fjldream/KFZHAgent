import DOMPurify from 'dompurify';
import { t } from '@/i18n/index.js';

const regexRules = {
  //1. 密码强度（8-20位，只是包含字母和数字）
  strongPassword: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,20}$/,
  //2.数字
  number: /^\d+$/,
  //3. 非空
  notEmpty: /\S+/,
  //4. 防止XSS
  noXss: /^(?!.*(<|>|script|on\w+=|javascript:)).*$/i,
  //5.首个字符不能为数字，只允许数字和下划线、语言文字，限制在1-24
  safaText: /^(?=.{1,64}$)[\p{L}_][\p{L}\p{N}_]*$/u,
  //6.URL
  url: /^(http?|ftp):\/\/[^\s/$.?#].[^\s]*$/i,
  //7.IPv4 地址
  ip: /^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){2}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
  //8.端口
  port: /^([1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-9])$/,
  //9.变量名命名规则
  variableName: /^[a-zA-Z_$][a-zA-Z0-9_$]*$/,
  //10.端口范围1024-65535
  rangePort: /^(?:102[4-9]|10[3-9]\d|1[1-9]\d{2}|[2-9]\d{3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5])$/,
};

export function regexValidator(type, message, required = true, trigger = ['blur', 'change']) {
  const pattern = regexRules[type];

  return {
    required,
    validator: (rule, value, callback) => {
      if (!value && required) {
        callback(new Error(t('rulesNotEmpty')));
      } else if (value && !containsXSS(value)) {
        callback(new Error(t('rulesXss')));
      } else if (value && pattern && !pattern.test(value)) {
        callback(new Error(message));
      } else {
        callback();
      }
    },
    trigger: trigger,
  };
}

/**
 * 严格清洗 HTML，防止 XSS 攻击
 * @param input 任意字符串或用户 HTML 输入
 * @returns 安全的 HTML 字符串
 */
export function sanitizeStrictHTML(input) {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [], // ❌ 不允许任何标签
    ALLOWED_ATTR: [], // ❌ 不允许任何属性
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'srcdoc'],
    USE_PROFILES: { html: false }, // 禁用默认 HTML 白名单
  });
}

/**
 * 判断是否半酣被DOMPurify判定为XSS的内用
 * @param {string} input - 需要检测的HTML字符串
 * @returns {boolean} - 如果存在禁用内容返回true,否则false
 */
export function containsXSS(input) {
  let foundXss = true;

  // 检测删除的属性
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.allowed === false) {
      foundXss = false;
    }
  });

  // 检测删除的标签
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.allowedTags && !data.allowedTags[node.nodeName.toLowerCase()]) {
      foundXss = false;
    }
  });
  sanitizeStrictHTML(input);
  // 清除hooks 避免污染全局
  DOMPurify.removeAllHooks();

  return foundXss;
}
