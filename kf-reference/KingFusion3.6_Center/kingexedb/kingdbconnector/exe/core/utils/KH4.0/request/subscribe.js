class SubscribeRequest {
  constructor(requestCenter, isAsync, clientID, funcName, runControl) {
    this.isAsync = isAsync;
    this.clientID = clientID;
    this.funcName = funcName;
    this.fuId = null;
    this.guid = null;
    this.rootFuId = null;

    this.areaid = null;

    this.callback = null;

    this.header = {
      clientID: this.clientID,
      cloudID: "0",
    };

    this.data = {};

    this.subIds = new Set();

    this.requestCenter = requestCenter;

    this.traceID = "0";

    this.operatetype = 0;

    this.cbType = null;
    this.runControl = runControl;
    this.runControl.generateRequestId();

  }

  setHeader(header) {
    this.header = {
      ...this.header,
      ...header,
    };

    this.runControl.setTerminalDqeHeader(this.header);
  }

  setData(data) {
    this.data = data;
  }

  setFuId(fuId) {
    this.fuId = fuId;
  }

  setGuId(guid) {
    this.guid = guid;
  }

  setRootFuId(rootFuId) {
    this.rootFuId = rootFuId;
  }

  setBasicProperty(basicProperty) {
    this.runControl.setBasicProperty({
      timeout: basicProperty.timeout || 10000,
      fuid: this.fuId || basicProperty.fuid || "0",
      operatetype: this.operatetype || basicProperty.operatetype || 0,
      areaid: this.areaid || basicProperty.areaid || 0
    });
  }

  setAreaid(areaid) {
    this.areaid = areaid;
  }

  setOperatetype(operatetype) {
    this.operatetype = operatetype;
  }

  setFuCallback(callback) {
    // this.runControl.setCB(callback);
    this.callback = callback;
  }

  setSubscribeIDs(areaid, fuid, sessionID, cbType, callBackFunc,subIds) {
    this.subIds = new Set(subIds);
    this.requestCenter.subscribe(this, subIds);

    this.fuId = fuid;
    this.areaid = areaid;
    this.cbType = cbType;

    this.runControl.setSubscribeIDs(areaid, fuid, sessionID, cbType, callBackFunc, subIds);
  }

  deleteSubscribeIDs(subIds) {
    this.requestCenter.unSubscribe(subIds);
    this.runControl.deleteSubscribeIDs(subIds);
  }
  eraseFailedSubscribeIDs(subIds) {
    subIds.forEach(id => this.subIds.delete(id));
    this.requestCenter.unSubscribe(subIds);
  }

  async sendRequest() {
    // 脚本运行控制对象，sendRequest入参 fuId、data: pbBuffer
    let sendResult = await this.requestCenter.sendAsyncSubRequest(this, this.isAsync, this.data)

    if (sendResult.ret) {
      return sendResult;
    }
    // 获取response
    const data = this.runControl.getResponseAndErrCode();
    if (data.errorCode) {
      return {
        ret: data.errorCode
      }
    }

    return data.dataPacketBody;
  }
}

module.exports = SubscribeRequest;
