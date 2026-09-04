const SPECIAL_CHAR = '`~!@#$%^&*()_+-={}|[]\\:";\'<>?,./';
const strIsLetterAndNum = (str) => {
  return !/[^\w\d]/i.test(str);
};

const isArithmeticProgression = (list, diff) => {
  for (let i = 0, len = list.length - 1; i < len; i++) {
    if (list[i + 1] - list[i] !== diff) {
      return false;
    }
  }
  return true;
};

const continuityIncrease = (str, len) => {
  if (str.length < len) {
    return false;
  }

  for (let i = 0; i < str.length - len + 1; i++) {
    const charList = [];
    for (let j = i; j < i + len; j++) {
      charList.push(str.charCodeAt(j));
    }

    if (isArithmeticProgression(charList, 1) || isArithmeticProgression(charList, -1)) {
      return true;
    }
  }

  return false;
};

const continuitySimilar = (str, len) => {
  if (str.length < len) {
    return false;
  }

  for (let i = 0; i < str.length - len + 1; i++) {
    const charList = [];
    for (let j = i; j < i + len; j++) {
      charList.push(str.charCodeAt(j));
    }

    let flag = true;
    for (let j = 0; j < charList.length - 1; j++) {
      if (charList[j] !== charList[j + 1]) {
        flag = false;
        break;
      }
    }
    if (flag) {
      return true;
    }
  }

  return false;
};

const charTypeCount = (str) => {
  const charCount = {
    upperCase: 0,
    lowerCase: 0,
    number: 0,
    specialChar: 0,
  };

  for (const i in str) {
    if (/[A-Z]/.test(str[i])) {
      charCount.upperCase = true;
    }
    if (/[a-z]/.test(str[i])) {
      charCount.lowerCase = true;
    }
    if (/\d/i.test(str[i])) {
      charCount.number = true;
    }
    if (SPECIAL_CHAR.includes(str[i])) {
      charCount.specialChar = true;
    }
  }

  let countNum = 0;
  for (const i in charCount) {
    if (charCount[i]) {
      countNum++;
    }
  }

  return countNum;
};

export const userStrongPassword = (str) => {
  if (!str) {
    return false;
  }
  const strLen = str.length;
  if (strLen < 8 || strLen > 32) {
    return false;
  }

  for (const i in str) {
    if (!(strIsLetterAndNum(str[i]) || SPECIAL_CHAR.includes(str[i]))) {
      return false;
    }
  }

  if (charTypeCount(str) < 3) {
    return false;
  }

  if (continuityIncrease(str, 3)) {
    return false;
  }

  return !continuitySimilar(str, 3);
};
