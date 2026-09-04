// 判断是否为纯对象
export const isPlainObject = (obj) => Object.prototype.toString.call(obj) === '[object Object]';

// 判断是否为JSON字符串
export const isObjectString = (objStr) => {
  let result;
  try {
    result = JSON.parse(objStr);
  } catch (e) {
    result = false;
  }
  return result;
};

export const isNull = (str) => {
  return str === void 0 || str === '' || str === null;
};
