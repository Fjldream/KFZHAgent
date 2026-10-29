const DigitSize = 9;
const DigPerDec = 9;

const DigIntgNumberLimit = [
  99999999, 9999999, 999999, 99999, 9999, 999, 99, 9, 0,
];

const powers10 = [
  1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000,
];

const MaxPrecision = 72;

function ROUND_UP(x) {
  return Math.floor((x + DigPerDec - 1) / DigPerDec);
}

class PbDecimal {
  constructor(digits, sign, precision, scale) {

    this.m_digits = [];

    let i = 0;
    for (; i < digits.length; i++) {
      this.m_digits[i] = digits[i];
    }

    for (; i < DigitSize; i++) {
      this.m_digits[i] = 0;
    }

    this.m_sign = sign;

    this.m_intg = precision - scale;
    this.m_frac = scale;
  }

  getDecIntgDigitNumber(dig) {
    for (let i = 0; i < DigPerDec; i++) {
      if (dig > DigIntgNumberLimit[i]) {
        return DigPerDec - i;
      }
    }

    return 0;
  }

  getDecFracDigitNumber(dig) {
    for (let i = 0; i < DigPerDec; i++) {
      if (dig % powers10[i + 1] > 0) {
        return DigPerDec - i;
      }
    }

    return 0;
  }

  getValidIntgCount() {
    let number = 0;

    let intg = ROUND_UP(this.m_intg);
    let i = 0;
    let end = intg;
    for (; i < end; ++i) {
      number += this.getDecIntgDigitNumber(this.m_digits[i]);
      if (number > 0) {
        number += (end - i - 1) * DigPerDec;
        break;
      }
    }

    return number;
  }

  getValidFracCount() {
    let number = 0;

    let intg = ROUND_UP(this.m_intg);
    let frac = ROUND_UP(this.m_frac);

    let i = intg + frac - 1;
    let end = intg;
    for (; i >= end; --i) {
      number += this.getDecFracDigitNumber(this.m_digits[i]);
      if (number > 0) {
        number += (i - end) * DigPerDec;
        break;
      }
    }

    return number;
  }

  getValidIntgSection() {

    let end = ROUND_UP(this.m_intg);
    let start = 0;

    while (start < end && this.m_digits[start] === 0) {
      start++;
    }

    return [start, end];
  }

  getValidFracSection() {
    let frac = DigitSize - ROUND_UP(this.m_intg);

    let start = ROUND_UP(this.m_intg);
    let end = ROUND_UP(this.m_intg) + ROUND_UP(this.m_frac);

    for (let k = 0; k < frac; k++) {
      if (this.m_digits[end - 1] != 0) {
        break;
      }
      --end;
    }

    return [start, end];
  }

  isZero() {
    for (let i = 0; i < DigitSize; ++i) {
      if (this.m_digits[i] != 0) {
        return false;
      }
    }

    return true;
  }

  toString() {
    const dec = this;
    let to = "";

    if (dec.isZero()) {
      to = "0";

      return to;
    }

    const intg = dec.getValidIntgCount();
    const frac = dec.getValidFracCount();

    const [start, end] = dec.getValidIntgSection();

    if (start < end) {
      for (let i = start; i < end; i++) {
        to += this.m_digits[i].toString().padStart(9, "0");
      }
    }
    else {
      to = "0";
    }

    let dotPos = to.length;

    // 小数位
    let isHaveFrac = false;
    const [fracStart, fracEnd] = dec.getValidFracSection();

    if (fracStart < fracEnd && frac > 0) {
      to += ".";
      if (fracStart < fracEnd) {
        for (let i = fracStart; i < fracEnd; i++) {
          to += this.m_digits[i].toString().padStart(9, "0");
        }
      }
      isHaveFrac = true;
    }

    let strBeg = 0;
    let strEnd = dotPos;

    while (strBeg < strEnd && '0' == to.charAt(strBeg)) {
      strBeg++;
    }

    if (strBeg == strEnd) {
      strBeg--;
    }
    else {
      let count = (strEnd - strBeg);
      if (count > intg) {
        strBeg += (count - intg);
      }
    }

    if (isHaveFrac) {
      let fraBeg = dotPos + 1;
      strEnd = to.length;

      while (strBeg <= strEnd && '0' == to.charAt(strEnd - 1)) {
        strEnd--;
      }

      if (to.charAt(strEnd - 1) == '.') {
        strEnd--;
      }

      if (strEnd - fraBeg > frac) {
        strEnd -= (strEnd - fraBeg - frac);
      }
    }

    let len = Math.min((strEnd - strBeg), MaxPrecision + (isHaveFrac ? 1 : 0));

    to = to.substring(strBeg, strBeg + len);
    if (dec.m_sign) {
      to = '-' + to;
    }

    return to;
  }
}

function pb_decimalToString(decimal) {
  if (!Reflect.has(decimal, 'digits') || !Reflect.has(decimal, 'sign') || !Reflect.has(decimal, 'precision') || !Reflect.has(decimal, 'scale')) {
    throw new Error(JSON.stringify(decimal) + " is not decimal");
  }

  const webDecimal = new PbDecimal(decimal.digits, decimal.sign, decimal.precision, decimal.scale);
  return webDecimal.toString();
}


function pb_stringToDecimal(str) {
  let digits = [];
  let sign = false;
  let scale = 0;
  let precision = 0;

  if (isNaN(str)) {
    throw new Error(str + " is NaN");
  }

  if (typeof str === 'number') {
    str = str.toString();
  }

  if (str.indexOf('-') === 0) {
    str = str.substring(1);
    sign = true;
  }

  let int = '';
  let frac = '';

  if (str.indexOf('.') > -1) {
    const [intStr, fracStr] = str.split('.');
    int = delZero1(intStr);
    frac = delZero2(fracStr);
  } else {
    int = delZero1(str);
  }

  scale = frac.length;
  precision = int.length + frac.length;

  digits.push(...genDigits1(int));
  frac && digits.push(...genDigits2(frac));

  return {
    digits,
    sign,
    scale,
    precision,
  }
}

// 前面补0
function addZero1(str, len) {
  while (str.length < len) {
    str = "0" + str;
  }


  return str;
}

// 后面补0
function addZero2(str, len) {
  while (str.length < len) {
    str = str + "0";
  }

  return str;
}
function delZero1(str) {
  while (str && str.indexOf('0') === 0) {
    str = str.substring(1);
  }

  return str || '0';
}
function delZero2(str) {
  while (str && str.lastIndexOf('0') === str.length - 1) {
    str = str.substring(0, str.length - 1);
  }

  return str;
}

function genDigits1(str) {
  const digits = [];
  while (str.length > 9) {
    digits.unshift(Number(str.substring(str.length - 9, str.length)));
    str = str.substring(0, str.length - 9);
  }

  digits.unshift(Number(str));
  return digits;
}

function genDigits2(str) {
  const digits = [];
  while (str.length > 9) {
    digits.push(Number(str.substring(0, 9)));
    str = str.substring(9, str.length);
  }

  digits.push(Number(str.padEnd(9, "0")));
  return digits;
}

module.exports =  { pb_decimalToString, pb_stringToDecimal };