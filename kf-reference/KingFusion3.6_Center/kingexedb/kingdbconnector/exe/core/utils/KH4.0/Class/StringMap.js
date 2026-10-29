
const DataSet = require("./DataSet");

const { pb_decimalToString, pb_stringToDecimal } = require("./PbDecimal");

const Decimal = require("decimal.js");

const isFormat = 1;

class BaseVariant {
  constructor(value, type) {
    this.value = value;
    if (!type) {
      this.type = getValueType(value);
    } else {
      this.type = type;
    }
  }
}

const Variant = new Proxy(BaseVariant, {
  construct(target, argArray) {
    return new target(...argArray);
  },
  apply(target, thisArg, argArray) {
    return new target(...argArray);
  },
});

class BaseStringMap {
  constructor(object = {}) {
    this._keyValueMap = new Map();
    this._init(object);
  }

  _init(object) {
    for (const key in object) {
      this._insert(key, object[key]);
    }
  }

  _get(key) {
    key = key.toLocaleLowerCase();
    return this._keyValueMap.get(key)?.value;
  }

  _insert(key, value, type) {
    key = key.toLocaleLowerCase();
    if (type) {
      if (typeof value !== typeValueToType(type)) {
        throw new Error(
          `[${key}] type error, need ${typeValueToType(
            type
          )}, but get ${typeof value}`
        );
      }

      if (
        typeValueToType(type) === "number" &&
        !Number.isInteger(value) &&
        !(type === "double" || type === "float")
      ) {
        throw new Error(
          `[${key}] type error, need ${typeValueToType(
            type
          )}, but get double or float`
        );
      }

      if (type === "dateTime" && !(value instanceof Date)) {
        throw new Error(
          `[${key}] type error, need Date, but get ${typeof value}`
        );
      }
    }

    if (!type && this._keyValueMap.has(key)) {
      const item = this._keyValueMap.get(key);
      if (typeof value !== typeof item.value) {
        throw new Error(
          `[${key}] type error, need ${typeof item.value}, but get ${typeof value}`
        );
      }

      item.value = value;
      return;
    }
    this._keyValueMap.set(key, {
      value,
      type: type || getValueType(value),
    });
  }

  _keys() {
    return [...this._keyValueMap.keys()];
  }

  _values() {
    const keys = this._keys();
    return keys.map((key) => this._get(key));
  }

  _containsKey(key) {
    key = key.toLocaleLowerCase();
    return this._keyValueMap.has(key);
  }

  _erase(key) {
    key = key.toLocaleLowerCase();
    return this._keyValueMap.delete(key);
  }

  _clear() {
    this._keyValueMap.clear();
  }

  _at(key) {
    key = key.toLocaleLowerCase();
    return this._get(key);
  }

  _size() {
    return this._keyValueMap.size;
  }

  _entries() {
    return [...this._keyValueMap.entries()].map(([key, value]) => {
      return [key, value.value];
    });
  }
}

function proxyTarget(mapInstance) {
  return new Proxy(mapInstance, {
    get(target, p, receiver) {
      const item = Reflect.get(target, p, receiver);

      if (
        (typeof p === "string" && p.indexOf("_") === 0) ||
        typeof p === "symbol"
      ) {
        return item;
      }

      return target._get(p);
    },
    set(target, p, newValue) {
      target._insert(p, newValue);
      return true;
    },
  });
}

const StringMap = new Proxy(BaseStringMap, {
  construct(target, argArray) {
    const mapInstance = new target(...argArray);
    return proxyTarget(mapInstance);
  },
  apply(target, thisArg, argArray) {
    const mapInstance = new target(...argArray);
    return proxyTarget(mapInstance);
  },
});

function getValueType(value) {
  if (value === null) {
    return "";
  }

  switch (typeof value) {
    case "boolean":
      return "bool";
    case "number":
      return Number.isInteger(value) ? "int32" : "double";
    case "string":
      if (isNaN(value)) {
        return "string";
      } else if (value === "0") {
        return "uint64";
      } else if (value.indexOf("-") === 0) {
        return "int64";
      } else if (value.length > 11) {
        return "uint64";
      } else {
        return "string";
      }
    case "object":
      if (Array.isArray(value)) {
        const types = new Set([...value.map((el) => getValueType(el))]);
        if (types.size === 1) {
          return [...types][0] + "[]";
        } else {
          return "";
        }
      } else if (value instanceof StringMap) {
        return "stringmap<var>";
      } else if (value instanceof Variant) {
        return "var";
      } else if (value instanceof Decimal) {
        return "decimal";
      } else if (value.toString() === "[object ArrayBuffer]") {
        return "binary";
      } else if (value instanceof Date) {
        return "dateTime";
      } else {
        return "";
      }
    case "function":
      return "function";
    default:
      return "";
  }
}

function typeValueToType(type) {
  switch (type) {
    case "int8":
    case "uint8":
    case "int16":
    case "uint16":
    case "int32":
    case "uint32":
    case "float":
    case "double":
      return "number";
    case "bool":
      return "boolean";
    case "string":
    case "int64":
    case "uint64":
    case "dateTimeUi":
    case "timeStampUi":
    case "timeSpanUi":
      return "string";
    case "int8[]":
    case "uint8[]":
    case "int16[]":
    case "uint16[]":
    case "int32[]":
    case "uint32[]":
    case "float[]":
    case "double[]":
    case "bool[]":
    case "string[]":
    case "int64[]":
    case "uint64[]":
    case "stringmap<var>":
    case "stringmap<var>[]":
    case "var[]":
    case "binary":
    case "binary[]":
    case "dateTime":
    case "dateTime[]":
    case "json":
      return "object";
    default:
      return "object";
  }
}

const stringMapToPbJson = (stringMap) => {
  if (!(stringMap instanceof StringMap)) {
    return;
  }

  const result = {
    keyValueList: [],
  };
  for (const [key, typeValue] of [...stringMap._keyValueMap]) {
    result.keyValueList.push({
      key,
      value: valueToVariant(typeValue),
    });
  }

  return result;
};

const pbJsonToStringMap = (json) => {
  if (!json || !json.keyValueList) {
    return null;
  }

  const stringMap = new StringMap();

  for (const item of json.keyValueList) {
    const { key, value: variant } = item;
    if (!Object.keys(variant).length) {
      continue;
    }
    const { value, type } = variantToValue(variant);
    stringMap._insert(key, value, type);
  }

  return stringMap;
};

function valueToVariant(typeValue) {
  const { type, value } = typeValue;

  switch (type) {
    case "json":
      return {
        jsonStringValue: JSON.stringify(value),
      };
    case "stringmap<var>":
      return {
        stringDictionaryValue: stringMapToPbJson(value),
      };
    case "stringmap<var>[]":
      return {
        stringDictionaryArrayValue: {
          keyValueList: value.map((el) => stringMapToPbJson(el)),
        },
      };
    case "var[]":
      return {
        valueArrayValue: {
          values: value.map((el) => valueToVariant(el)),
        },
      };
    case "var[][]":
      return {
        valueArray2DValue: {
          arrays: value.map((item) => {
            return {
              values: item.map((el) => valueToVariant(el)),
            };
          }),
        },
      };
    case "uint64[][]":
      return {
        uint64Array2DValue: {
          arrays: value.map((item) => {
            return {
              uint64Array: item.map((el) => valueToVariant(el)),
            };
          }),
        },
      };
    case "string[][]":
      return {
        stringArray2DValue: {
          arrays: value.map((item) => {
            return {
              stringArray: item.map((el) => valueToVariant(el)),
            };
          }),
        },
      };
    case "decimal":
      return {
        decimalValue: pb_stringToDecimal(new Decimal(value).toFixed()),
      };
    case "binary":
      return {
        binaryValue: value,
      };
    case "binary[]":
      return {
        binaryArrayValue: {
          binaryArray: value,
        },
      };
    case "dateTime":
      return {
        dateTimeValue: {
          year: value.getUTCFullYear(),
          month: value.getUTCMonth() + 1,
          day: value.getUTCDate(),
          hour: value.getUTCHours(),
          minute: value.getUTCMinutes(),
          second: value.getUTCSeconds(),
          millisecond: value.getUTCMilliseconds(),
          microsecond: 0,
        },
      };
    case "dateTimeCST":
      return {
        dateTimeValue: {
          year: value.getFullYear(),
          month: value.getMonth() + 1,
          day: value.getDate(),
          hour: value.getHours(),
          minute: value.getMinutes(),
          second: value.getSeconds(),
          millisecond: value.getMilliseconds(),
          microsecond: 0,
        },
      };
    case "dateTime[]":
      return {
        dateTimeArray: {
          dateTimeArray: value.map((el) => {
            return {
              year: el.getUTCFullYear(),
              month: el.getUTCMonth() + 1,
              day: el.getUTCDate(),
              hour: el.getUTCHours(),
              minute: el.getUTCMinutes(),
              second: el.getUTCSeconds(),
              millisecond: el.getUTCMilliseconds(),
              microsecond: 0,
            };
          }),
        },
      };
    case "dateTimeCST[]":
      return {
        dateTimeArray: {
          dateTimeArray: value.map((el) => {
            return {
              year: el.getFullYear(),
              month: el.getMonth() + 1,
              day: el.getDate(),
              hour: el.getHours(),
              minute: el.getMinutes(),
              second: el.getSeconds(),
              millisecond: el.getMilliseconds(),
              microsecond: 0,
            };
          }),
        },
      };
    default:
      if (type.includes("[]")) {
        return {
          [type.replace("[]", "ArrayValue")]: {
            [type.replace("[]", "Array")]: value,
          },
        };
      } else {
        if (type === "int") {
          return {
            ["int32Value"]: value,
          };
        }
        return {
          [type + "Value"]: value,
        };
      }
  }
}

function variantToValue(variant) {
  if (Object.keys(variant).length === 0) {
    return {
      type: "",
      value: undefined,
    };
  }
  const [variantType, variantValue] = Object.entries(variant)[0];

  switch (variantType) {
    case "jsonStringValue":
      return {
        type: "json",
        value: JSON.parse(variantValue),
      };
    case "dateTimeValue":
      const date = new Date(0);
      date.setUTCFullYear(variantValue.year);
      date.setUTCMonth(variantValue.month - 1);
      date.setUTCDate(variantValue.day);
      date.setUTCHours(variantValue.hour);
      date.setUTCMinutes(variantValue.minute);
      date.setUTCSeconds(variantValue.second || 0);
      date.setUTCMilliseconds(variantValue.millisecond || 0);
      return {
        type: "dateTime",
        value: date,
      };
    case "dateTimeArray":
      if (JSON.stringify(variantValue) == "{}") {
        return {
          type: "dateTime[]",
          value: [],
        };
      }
      return {
        type: "dateTime[]",
        value: variantValue.dateTimeArray.map((el) => {
          const date = new Date(0);
          date.setUTCFullYear(el.year);
          date.setUTCMonth(el.month - 1);
          date.setUTCDate(el.day);
          date.setUTCHours(el.hour);
          date.setUTCMinutes(el.minute);
          date.setUTCSeconds(el.second);
          date.setUTCMilliseconds(el.millisecond);
          return date;
        }),
      };

    case "binaryValue":
      return {
        type: "binary",
        value: variantValue,
      };
    case "binaryArrayValue":
      return {
        type: "binary[]",
        value: variantValue.binaryArray,
      };
    case "decimalValue":
      if (variantValue.sign === undefined) {
        variantValue.sign = false;
      }

      if (variantValue.scale === undefined) {
        variantValue.scale = 0;
      }

      return {
        type: "decimal",
        value: new Decimal(pb_decimalToString(variantValue)),
      };
    case "stringDictionaryValue":
      return {
        type: "stringmap<var>",
        value: pbJsonToStringMap(variantValue),
      };
    case "stringDictionaryArrayValue":
      if (JSON.stringify(variantValue) == "{}") {
        return {
          type: "stringmap<var>[]",
          value: [],
        };
      }
      return {
        type: "stringmap<var>[]",
        value: variantValue.keyValueList.map((el) => {
          return pbJsonToStringMap(el);
        }),
      };
    case "valueArrayValue":
      if (Object.keys(variantValue).length === 0) {
        return {
          type: "var[]",
          value: [],
        };
      } else {
        return {
          type: "var[]",
          value: variantValue.values.map((el) => {
            const { type, value } = variantToValue(el);
            return new Variant(value, type);
          }),
        };
      }
    case "valueArray2DValue":
      return {
        type: "var[][]",
        value: variantValue.arrays.map((el) => {
          if (el.values) {
            return el.values.map((el1) => {
              const { type, value } = variantToValue(el1);
              return new Variant(value, type);
            });
          } else {
            return [];
          }
        }),
      };
    case "uint64Array2DValue":
      return {
        type: "uint64[][]",
        value: variantValue.arrays.map((el) => {
          if (el.uint64Array) {
            return el.uint64Array.map((el1) => {
              return new Variant(el1, "uint64");
            });
          } else {
            return [];
          }
        }),
      };
    case "stringArray2DValue":
      return {
        type: "string[][]",
        value: variantValue.arrays.map((el) => {
          if (el.stringArray) {
            return el.stringArray.map((el1) => {
              return new Variant(el1, "string");
            });
          } else {
            return [];
          }
        }),
      };
    case "dataSet":
      return {
        type: "dataset",
        value: new DataSet(variantValue),
      };
    case "dataSetArray":
      return {
        type: "dataset[]",
        value: variantValue.dataSetList.map((el) => new DataSet(el)),
      };
    default:
      if (variantType.includes("ArrayValue")) {
        if (JSON.stringify(variantValue) === "{}") {
          return {
            type: variantType.replace("ArrayValue", "[]"),
            value: [],
          };
        }
        return {
          type: variantType.replace("ArrayValue", "[]"),
          value: Object.values(variantValue)[0],
        };
      } else {
        return {
          type: variantType.replace("Value", ""),
          value: variantValue,
        };
      }
  }
}

function _valueToValue(value) {
  if (Array.isArray(value)) {
    return value.map((el) => _valueToValue(el));
  } else if (value instanceof Variant) {
    return _valueToValue(value.value);
  } else if (value instanceof StringMap) {
    return stringMapToObject(value);
  } else if (value instanceof DataSet) {
    return _dataSetToObjectList(value);
  }
  return value;
}

function _dataSetToObjectList(dataSet) {
  return dataSet.toVarArray().map((item) => {
    const object = {};
    for (let i = 0; i < dataSet.colsNames().length; i++) {
      object[dataSet.colsNames()[i]] = _valueToValue(item[i]);
    }
    return object;
  });
}

function stringMapToObject(stringMap) {
  if (!(stringMap instanceof StringMap)) {
    return null;
  }

  if (!isFormat) {
    return stringMap;
  }

  const object = {};

  for (const key of stringMap._keys()) {
    const value = stringMap._get(key);

    object[key] = _valueToValue(value);
  }

  return object;
}

module.exports = {
  Variant,
  StringMap,
  pbJsonToStringMap,
  stringMapToPbJson,
  stringMapToObject,
  variantToValue,
  valueToVariant,
};
