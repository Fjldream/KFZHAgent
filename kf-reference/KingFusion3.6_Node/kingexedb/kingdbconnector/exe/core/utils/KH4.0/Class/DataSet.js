class DataSet {
  constructor(data = {}) {
    const { variantToValue } = require("./StringMap");

    this.fieldNames = data.fieldNames?.map(el => el.toLocaleLowerCase()) || [];
    this.fieldValues = data.fieldValues?.map((el) => variantToValue({
      valueArrayValue: el,
    }).value.map(el => el.value)) || [];
  }

  get rowLength() {
    return this.fieldValues.length;
  }

  get colLength() {
    return this.fieldNames.length;
  }

  row(index) {
    return this.fieldValues[index] || [];
  }

  colsNames() {
    return this.fieldNames;
  }

  colByName(colName) {
    colName = colName.toLocaleLowerCase();
    const colIndex = this.fieldNames.indexOf(colName);
    if (colIndex < 0) {
      return [];
    }
    return this.fieldValues.flatMap((el) => el[colIndex]);
  }

  cellByID(rowID, colID) {
    return this.fieldValues[rowID][colID];
  }

  cellByName(rowID, colName) {
    colName = colName.toLocaleLowerCase();
    const colIndex = this.fieldNames.indexOf(colName);
    if (colIndex < 0) {
      return;
    }
    return this.fieldValues[rowID][colIndex];
  }

  toVarArray() {
    return this.fieldValues;
  }

  toVarArrayByName(rowID, colNames) {
    const results = [];
    for (const colName of colNames) {
      results.push(this.cellByName(rowID, colName));
    }
    return results;
  }

  clear() {
    this.fieldNames = [];
    this.fieldValues = [];
  }
}

module.exports = DataSet;
