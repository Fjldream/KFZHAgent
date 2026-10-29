// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const { run } = require('./helpers/test_runner')
require('./config_service.test')
require('./event_repository.test')
require('./health_evaluator.test')
require('./rest_and_guard.test')
require('./query_service.test')
require('./operation_service.test')
require('./app_membership_service.test')
require('./node_runtime_service.test')
require('./ws_service.test')
require('./bootstrap.test')
require('./batch_command_pipeline.test')
require('./command_gateway_batch.test')

/**
 * 执行中心侧全部冗余功能测试。
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
