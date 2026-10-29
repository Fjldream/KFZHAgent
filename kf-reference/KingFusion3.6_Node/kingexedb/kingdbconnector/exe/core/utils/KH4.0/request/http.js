class HttpRequest {
    constructor(sslMode, ip, port, clientNumber, funcName) {
      this.sslMode = sslMode;
      this.ip = ip;
      this.port = port;
      this.clientNumber = clientNumber;
      this.funcName = funcName;

      this.header = {
        clientNumber: this.clientNumber,
      };
    }

    setHeader(header) {
      this.header = {
        ...this.header,
        ...header,
      };
    }

    setData(data) {
      this.data = data;
    }

    sendRequest() {
      return fetch(this.getUrl(), {
        method: "POST",
        body: JSON.stringify({
          header: this.header,
          data: this.data,
        }),
      }).then((res) => res.json().then(res => {
        if(res.ret){
          return res;
        }
        return res.data;
      }
      ));
    }

    sendGetRequest() {
      return fetch(baseUrl + "/api/v1/" + this.funcName + "?" + this.data, {
        method: "GET"
      }).then((res) => res.json().then(res => {
        return res.data
      }
      ));
    }

    getUrl(){
      if (this.sslMode) {
        let url = "https://" + this.ip + ":"+ this.port + this.funcName; 
        return url;
      }
      else {
        let url = "http://" + this.ip + ":" + this.port + this.funcName;
        return url;
      }
    }
  }

    module.exports = HttpRequest;