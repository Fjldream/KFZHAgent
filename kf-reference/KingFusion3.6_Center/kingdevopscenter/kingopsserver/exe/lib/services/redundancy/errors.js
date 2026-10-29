// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

/**
 * 冗余功能统一业务异常，向控制器提供稳定错误码和 HTTP 状态。
 */
class RedundancyError extends Error {
  /**
   * @param {string} code 稳定业务错误码。
   * @param {string} message 面向调用方的错误说明。
   * @param {number} [httpStatus=400] 建议 HTTP 状态码。
   * @param {object} [details={}] 可用于定位问题的结构化详情。
   */
  constructor(code, message, httpStatus = 400, details = {}) {
    super(message)
    this.name = 'RedundancyError'
    this.code = code
    this.httpStatus = httpStatus
    this.details = details
    Error.captureStackTrace(this, RedundancyError)
  }
}

module.exports = { RedundancyError }
// end
