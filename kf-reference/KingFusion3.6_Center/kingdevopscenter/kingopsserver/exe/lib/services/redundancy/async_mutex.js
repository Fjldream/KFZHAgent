// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

/**
 * 按业务键串行执行异步操作，避免同一冗余配置并发修改。
 */
class KeyedAsyncMutex {
  constructor() {
    this.tails = new Map()
  }

  /**
   * 在指定键的互斥区内执行任务。
   *
   * @template T
   * @param {string} key 互斥键，通常为 redundancyId。
   * @param {() => Promise<T>} task 需要串行执行的任务。
   * @returns {Promise<T>} 任务结果。
   */
  async runExclusive(key, task) {
    const previousTail = this.tails.get(key) || Promise.resolve()
    let releaseCurrent
    const currentTail = new Promise((resolve) => {
      releaseCurrent = resolve
    })
    this.tails.set(key, currentTail)

    await previousTail
    try {
      return await task()
    } finally {
      releaseCurrent()
      if (this.tails.get(key) === currentTail) {
        this.tails.delete(key)
      }
    }
  }
}

module.exports = { KeyedAsyncMutex }
// end
