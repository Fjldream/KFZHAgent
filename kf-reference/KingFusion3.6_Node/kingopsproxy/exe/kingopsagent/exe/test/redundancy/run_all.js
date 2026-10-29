// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const { run } = require('./helpers/test_runner')
require('./cache_and_guard.test')
require('./reconcile_service.test')
require('./runtime_client.test')
require('./batch_command_execution.test')

/**
 * 执行节点侧全部冗余功能测试。
 *
 * @returns {Promise<void>}
 */
async function main() {
  await run()
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error)
  process.exitCode = 1
})
// end
