  const HttpRequest = require("./http")
  class RequestCenter {
    constructor() {
    }

    get subRunInstanceList() {
      return new Set(this.subMap.values());
    }

    getHttpInstance(sslMode, ip, port, clientNumber, funcName) {
      return new HttpRequest(sslMode, ip, port, clientNumber, funcName);
    }

    getServiceType(dataType) {
      if (dataType / 1000 === 0) {
        return undefined;
      }

      if (dataType == 1003){
          let serviceType = 6;
          return serviceType;
      }

      let serviceType = Math.floor(dataType / 1000);

      return serviceType;
    }

  }

  module.exports = new RequestCenter;