// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const tests = []

/**
 * 注册一个冗余功能测试用例。
 *
 * @param {string} name 测试名称。
 * @param {Function} testFunction 测试函数。
 * @returns {void}
 */
function test(name, testFunction) {
  tests.push({ name, testFunction })
}

/**
 * 顺序执行已注册的测试，保证测试输出稳定且便于定位失败用例。
 *
 * @returns {Promise<{passed: number, failed: number}>} 测试统计。
 */
async function run() {
  let passed = 0
  let failed = 0

  for (const currentTest of tests) {
    try {
      await currentTest.testFunction()
      passed += 1
      console.log(`✓ ${currentTest.name}`)
    } catch (error) {
      failed += 1
      console.error(`✗ ${currentTest.name}`)
      console.error(error && error.stack ? error.stack : error)
    }
  }

  console.log(`冗余功能测试完成：通过 ${passed}，失败 ${failed}`)

  if (failed > 0) {
    throw new Error(`存在 ${failed} 个失败的冗余功能测试`)
  }

  return { passed, failed }
}

module.exports = { test, run }
// end
