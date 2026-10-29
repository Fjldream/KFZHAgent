// modified by jinlong.feng at 0907 修复冗余运行态请求重复 tenantId
'use strict'

const assert = require('assert')
const { test } = require('./helpers/test_runner')
const { RuntimeClient } = require('../../lib/services/redundancy/runtime_client')

test('冗余运行态 GET 请求只包含公共请求层追加的一个 tenantId', async () => {
  let requestedUrl = null
  const requestClient = {
    async httpRequestSync(options) {
      const separator = options.url.includes('?') ? '&' : '?'
      requestedUrl = `${options.url}${separator}tenantId=tenant-kf`
      return {
        err: null,
        res: { statusCode: 200 },
        body: { code: 0, data: { revision: 3, role: 'ACTIVE' } },
      }
    },
  }
  const client = new RuntimeClient({
    requestClient,
    apiBaseUrl: 'http://center/api/v1',
  })

  const runtime = await client.getRuntime({ nodeId: 'node-189', tenantId: 'tenant-kf' })
  const tenantMatches = requestedUrl.match(/[?&]tenantId=/g) || []

  assert.strictEqual(tenantMatches.length, 1)
  assert.deepStrictEqual(runtime, { revision: 3, role: 'ACTIVE' })
})
// end
