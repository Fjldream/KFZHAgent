const path = require("path");
module.exports = (e) => {
  let s = global.projectBasePath,
    a = "";
  switch (e.type) {
    case 1:
      a = s + "/" + e.name + ".json";
      break;
    case 2:
      a = s + "/" + e.name + ".json";
      break;
    case 9:
      a = s + "/" + e.name + ".json";
      break;
    case 4:
      a = s + "/Tag/" + e.name + ".json";
      break;
    case 5:
      a = s + "/" + e.name + ".json";
      break;
    case 7:
      a = path.resolve(s, "config", `${e.name}.json`);
      break;
    case 3:
      a = s + "/page/" + e.name + ".json";
      break;
    case 9:
      a = s + "/" + e.name + ".json";
      break;
    case 14:
      a = s + "/" + e.name + ".json";
      break;
    case 15:
      a = s + "/" + e.name + ".json";
      break;
    case 11:
      a = s + "/res/graphicModel_base/" + e.name + ".json";
      break;
    case 12:
      a = s + "/res/customcharts_base/" + e.name + ".json";
      break;
    case 13:
      a = s + "/res/graphicGroup/" + e.name + ".json";
      break;
    case 16:
      a = s + "/" + e.name + ".json";
      break;
    case 17:
      a = s + "/res/images/" + e.name;
      break;
    case "sets":
      a = UpperFiveDirectory + "/sdb/sets";
      break;
    case 20:
      a = s + "/userSource/" + e.name + ".json";
      break;
    default:
      break;
  }
  return a;
};
