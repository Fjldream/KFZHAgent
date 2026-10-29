// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const fs = require('fs')
const path = require('path')
const { ERROR_CODE } = require('./constants')
const { RedundancyError } = require('./errors')

/**
 * 使用独立 SQLite 数据库保存冗余异常、操作任务和逐 APP 执行步骤。
 */
class EventRepository {
  /**
   * @param {object} options 构造参数。
   * @param {string} options.databasePath 数据库文件路径。
   * @param {Function} [options.Database] better-sqlite3 构造函数。
   * @param {() => string} options.idFactory 唯一 ID 工厂。
   * @param {() => string} [options.clock] ISO 时间提供器。
   */
  constructor({
    databasePath,
    Database = require('better-sqlite3'),
    idFactory,
    clock = () => new Date().toISOString(),
  }) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true })
    this.database = new Database(databasePath)
    this.idFactory = idFactory
    this.clock = clock
    this.initializeSchema()
  }

  /**
   * 初始化数据库参数和表结构。
   *
   * @returns {void}
   */
  initializeSchema () {
    this.database.pragma('journal_mode = WAL')
    this.database.pragma('foreign_keys = ON')
    this.database.pragma('busy_timeout = 5000')
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS redundancy_event (
        event_id TEXT PRIMARY KEY,
        redundancy_id TEXT NOT NULL,
        redundancy_name_snapshot TEXT,
        tenant_id TEXT NOT NULL,
        reason_key TEXT NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        node_id TEXT,
        app_id TEXT,
        summary TEXT NOT NULL,
        detail_json TEXT NOT NULL,
        status TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        recovered_at TEXT,
        acknowledged_by TEXT,
        acknowledged_at TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ux_redundancy_event_open_reason
      ON redundancy_event (tenant_id, redundancy_id, reason_key)
      WHERE status = 'OPEN';

      CREATE INDEX IF NOT EXISTS ix_redundancy_event_query
      ON redundancy_event (tenant_id, status, occurred_at DESC);

      CREATE TABLE IF NOT EXISTS redundancy_operation_task (
        task_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        redundancy_id TEXT NOT NULL,
        redundancy_name_snapshot TEXT,
        tenant_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        status TEXT NOT NULL,
        current_stage TEXT NOT NULL,
        config_revision INTEGER NOT NULL,
        operator TEXT NOT NULL,
        input_json TEXT NOT NULL,
        result_json TEXT,
        failure_message TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        finished_at TEXT,
        UNIQUE (tenant_id, request_id)
      );

      CREATE INDEX IF NOT EXISTS ix_redundancy_operation_query
      ON redundancy_operation_task (tenant_id, redundancy_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS redundancy_operation_app_step (
        step_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        action TEXT NOT NULL,
        command_id TEXT,
        command_status TEXT NOT NULL,
        observed_status TEXT,
        failure_message TEXT,
        detail_json TEXT NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        finished_at TEXT,
        FOREIGN KEY (task_id) REFERENCES redundancy_operation_task(task_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS ix_redundancy_app_step_task
      ON redundancy_operation_app_step (tenant_id, task_id, started_at);
    `)
  }

  /**
   * 新增异常；相同租户、配置和原因已有 OPEN 事件时返回原事件。
   *
   * @param {object} input 异常信息。
   * @returns {object} 当前 OPEN 事件。
   */
  openEvent (input) {
    const occurredAt = input.occurredAt || this.clock()
    this.database
      .prepare(
        `INSERT OR IGNORE INTO redundancy_event (
          event_id, redundancy_id, redundancy_name_snapshot, tenant_id, reason_key,
          event_type, severity, node_id, app_id, summary, detail_json, status, occurred_at
        ) VALUES (
          @eventId, @redundancyId, @redundancyName, @tenantId, @reasonKey,
          @eventType, @severity, @nodeId, @appId, @summary, @detailJson, 'OPEN', @occurredAt
        )`,
      )
      .run({
        eventId: this.idFactory(),
        redundancyId: input.redundancyId,
        redundancyName: input.redundancyName || null,
        tenantId: input.tenantId,
        reasonKey: input.reasonKey,
        eventType: input.eventType,
        severity: input.severity,
        nodeId: input.nodeId || null,
        appId: input.appId || null,
        summary: input.summary,
        detailJson: JSON.stringify(input.detail || {}),
        occurredAt,
      })

    return this.mapEvent(
      this.database
        .prepare(
          `SELECT * FROM redundancy_event
           WHERE tenant_id = ? AND redundancy_id = ? AND reason_key = ? AND status = 'OPEN'`,
        )
        .get(input.tenantId, input.redundancyId, input.reasonKey),
    )
  }

  /**
   * 更新指定原因对应的 OPEN 异常摘要和结构化详情。
   *
   * 该方法不改变事件 ID、发生时间、确认状态及生命周期，用于补充状态评估中新获得的展示信息。
   *
   * @param {object} input 更新内容。
   * @param {string} input.tenantId 租户 ID。
   * @param {string} input.redundancyId 冗余配置 ID。
   * @param {string} input.reasonKey 异常原因稳定键。
   * @param {string} input.summary 异常摘要。
   * @param {object} input.detail 异常结构化详情。
   * @returns {object|null} 更新后的 OPEN 事件；不存在时返回 null。
   */
  updateOpenEvent (input) {
    const result = this.database
      .prepare(
        `UPDATE redundancy_event
         SET summary = @summary, detail_json = @detailJson
         WHERE tenant_id = @tenantId
           AND redundancy_id = @redundancyId
           AND reason_key = @reasonKey
           AND status = 'OPEN'`,
      )
      .run({
        tenantId: input.tenantId,
        redundancyId: input.redundancyId,
        reasonKey: input.reasonKey,
        summary: input.summary,
        detailJson: JSON.stringify(input.detail || {}),
      })
    if (result.changes === 0) {
      return null
    }
    return this.mapEvent(
      this.database
        .prepare(
          `SELECT * FROM redundancy_event
           WHERE tenant_id = ? AND redundancy_id = ? AND reason_key = ? AND status = 'OPEN'`,
        )
        .get(input.tenantId, input.redundancyId, input.reasonKey),
    )
  }

  /**
   * 恢复指定原因对应的 OPEN 异常。
   *
   * @param {object} input 恢复条件。
   * @returns {object|null} 已恢复事件；不存在 OPEN 事件时返回 null。
   */
  recoverEvent (input) {
    const recoveredAt = input.recoveredAt || this.clock()
    const row = this.database
      .prepare(
        `SELECT * FROM redundancy_event
         WHERE tenant_id = ? AND redundancy_id = ? AND reason_key = ? AND status = 'OPEN'`,
      )
      .get(input.tenantId, input.redundancyId, input.reasonKey)
    if (!row) {
      return null
    }
    this.database
      .prepare(
        `UPDATE redundancy_event
         SET status = 'RECOVERED', recovered_at = ?
         WHERE event_id = ?`,
      )
      .run(recoveredAt, row.event_id)
    return this.findEventById(input.tenantId, row.event_id)
  }

  // modified by jinlong.feng at 2026-10-08 冗余停用关闭异常事件
  /**
   * 关闭指定冗余配置下全部未恢复异常。
   *
   * 配置停用后不再参与健康扫描，未恢复事件不会被评估器自动收敛，
   * 因此停用时必须主动关闭，避免通知中心长期残留已解除管控的异常。
   * 事件不会被删除，仅置为 <REC></REC>OVERED，历史记录仍可在事件页面查询。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} redundancyId 冗余配置 ID。
   * @returns {number} 实际关闭的事件数量。
   */
  recoverOpenEventsByRedundancy (tenantId, redundancyId) {
    const result = this.database
      .prepare(
        `UPDATE redundancy_event
         SET status = 'RECOVERED', recovered_at = ?
         WHERE tenant_id = ? AND redundancy_id = ? AND status = 'OPEN'`,
      )
      .run(this.clock(), tenantId, redundancyId)
    return result.changes
  }
  // end modified by jinlong.feng at 2026-10-08 冗余停用关闭异常事件

  /**
   * 确认异常消息；确认不改变 OPEN/RECOVERED 状态。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} eventId 事件 ID。
   * @param {string} operator 确认人。
   * @returns {object|null} 更新后的事件。
   */
  acknowledgeEvent (tenantId, eventId, operator) {
    this.database
      .prepare(
        `UPDATE redundancy_event
         SET acknowledged_by = ?, acknowledged_at = ?
         WHERE tenant_id = ? AND event_id = ?`,
      )
      .run(operator, this.clock(), tenantId, eventId)
    return this.findEventById(tenantId, eventId)
  }

  /**
   * 按租户及可选条件查询事件。
   *
   * @param {object} filter 查询条件。
   * @returns {object[]} 事件列表。
   */
  queryEvents (filter) {
    const clauses = ['tenant_id = @tenantId']
    const parameters = { tenantId: filter.tenantId }
    const optionalColumns = {
      status: 'status',
      redundancyId: 'redundancy_id',
      nodeId: 'node_id',
      appId: 'app_id',
      eventType: 'event_type',
    }
    for (const [field, column] of Object.entries(optionalColumns)) {
      if (filter[field]) {
        clauses.push(`${column} = @${field}`)
        parameters[field] = filter[field]
      }
    }
    if (filter.from) {
      clauses.push('occurred_at >= @from')
      parameters.from = filter.from
    }
    if (filter.to) {
      clauses.push('occurred_at <= @to')
      parameters.to = filter.to
    }

    return this.database
      .prepare(
        `SELECT * FROM redundancy_event WHERE ${clauses.join(' AND ')} ORDER BY occurred_at DESC`,
      )
      .all(parameters)
      .map((row) => this.mapEvent(row))
  }

  /**
   * 创建统一操作任务；同租户 requestId 重复时返回原任务。
   *
   * @param {object} input 任务输入。
   * @returns {object} 新建或已存在的任务。
   */
  createOperationTask (input) {
    const existing = this.findByRequestId(input.tenantId, input.requestId)
    if (existing) {
      return existing
    }

    const startedAt = input.startedAt || this.clock()
    const taskId = this.idFactory()
    this.database
      .prepare(
        `INSERT INTO redundancy_operation_task (
          task_id, request_id, redundancy_id, redundancy_name_snapshot, tenant_id,
          operation_type, status, current_stage, config_revision, operator,
          input_json, started_at, updated_at
        ) VALUES (
          @taskId, @requestId, @redundancyId, @redundancyName, @tenantId,
          @operationType, @status, @currentStage, @configRevision, @operator,
          @inputJson, @startedAt, @updatedAt
        )`,
      )
      .run({
        taskId,
        requestId: input.requestId,
        redundancyId: input.redundancyId,
        redundancyName: input.redundancyName || null,
        tenantId: input.tenantId,
        operationType: input.operationType,
        status: input.status || 'RUNNING',
        currentStage: input.currentStage || 'CREATED',
        configRevision: input.configRevision,
        operator: input.operator,
        inputJson: JSON.stringify(input.input || {}),
        startedAt,
        updatedAt: startedAt,
      })
    return this.findOperationTaskById(input.tenantId, taskId)
  }

  /**
   * 更新操作任务的受控字段。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} taskId 任务 ID。
   * @param {object} patch 更新内容。
   * @returns {object|null} 更新后的任务。
   */
  updateOperationTask (tenantId, taskId, patch) {
    const columnMap = {
      status: 'status',
      currentStage: 'current_stage',
      configRevision: 'config_revision',
      result: 'result_json',
      failureMessage: 'failure_message',
      finishedAt: 'finished_at',
    }
    const assignments = []
    const parameters = { tenantId, taskId, updatedAt: this.clock() }
    for (const [field, column] of Object.entries(columnMap)) {
      if (Object.prototype.hasOwnProperty.call(patch, field)) {
        assignments.push(`${column} = @${field}`)
        parameters[field] = field === 'result' ? JSON.stringify(patch[field]) : patch[field]
      }
    }
    if (assignments.length === 0) {
      return this.findOperationTaskById(tenantId, taskId)
    }
    assignments.push('updated_at = @updatedAt')
    this.database
      .prepare(
        `UPDATE redundancy_operation_task SET ${assignments.join(', ')}
         WHERE tenant_id = @tenantId AND task_id = @taskId`,
      )
      .run(parameters)
    return this.findOperationTaskById(tenantId, taskId)
  }

  /**
   * 新增逐 APP 执行步骤。
   *
   * @param {object} input 步骤输入。
   * @returns {object} 新步骤。
   */
  addAppStep (input) {
    const startedAt = input.startedAt || this.clock()
    const stepId = this.idFactory()
    this.database
      .prepare(
        `INSERT INTO redundancy_operation_app_step (
          step_id, task_id, tenant_id, node_id, app_id, action, command_id,
          command_status, observed_status, failure_message, detail_json,
          started_at, updated_at, finished_at
        ) VALUES (
          @stepId, @taskId, @tenantId, @nodeId, @appId, @action, @commandId,
          @commandStatus, @observedStatus, @failureMessage, @detailJson,
          @startedAt, @updatedAt, @finishedAt
        )`,
      )
      .run({
        stepId,
        taskId: input.taskId,
        tenantId: input.tenantId,
        nodeId: input.nodeId,
        appId: input.appId,
        action: input.action,
        commandId: input.commandId || null,
        commandStatus: input.commandStatus || 'PENDING',
        observedStatus: input.observedStatus || null,
        failureMessage: input.failureMessage || null,
        detailJson: JSON.stringify(input.detail || {}),
        startedAt,
        updatedAt: startedAt,
        finishedAt: input.finishedAt || null,
      })
    return this.findAppStepById(input.tenantId, stepId)
  }

  /**
   * 更新逐 APP 步骤的受控字段。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} stepId 步骤 ID。
   * @param {object} patch 更新内容。
   * @returns {object|null} 更新后的步骤。
   */
  updateAppStep (tenantId, stepId, patch) {
    const columnMap = {
      commandId: 'command_id',
      commandStatus: 'command_status',
      observedStatus: 'observed_status',
      failureMessage: 'failure_message',
      detail: 'detail_json',
      finishedAt: 'finished_at',
    }
    const assignments = []
    const parameters = { tenantId, stepId, updatedAt: this.clock() }
    for (const [field, column] of Object.entries(columnMap)) {
      if (Object.prototype.hasOwnProperty.call(patch, field)) {
        assignments.push(`${column} = @${field}`)
        parameters[field] = field === 'detail' ? JSON.stringify(patch[field]) : patch[field]
      }
    }
    if (assignments.length === 0) {
      return this.findAppStepById(tenantId, stepId)
    }
    assignments.push('updated_at = @updatedAt')
    this.database
      .prepare(
        `UPDATE redundancy_operation_app_step SET ${assignments.join(', ')}
         WHERE tenant_id = @tenantId AND step_id = @stepId`,
      )
      .run(parameters)
    return this.findAppStepById(tenantId, stepId)
  }

  /**
   * 按幂等请求 ID 查询操作任务。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} requestId 请求 ID。
   * @returns {object|null} 任务或 null。
   */
  findByRequestId (tenantId, requestId) {
    return this.mapOperationTask(
      this.database
        .prepare('SELECT * FROM redundancy_operation_task WHERE tenant_id = ? AND request_id = ?')
        .get(tenantId, requestId),
    )
  }

  /**
   * 查询操作任务列表。
   *
   * @param {object} filter 查询条件。
   * @returns {object[]} 操作任务列表。
   */
  queryOperationTasks (filter) {
    const clauses = ['tenant_id = @tenantId']
    const parameters = {
      tenantId: filter.tenantId,
      limit: Number(filter.limit) || 100,
    }
    const optionalColumns = {
      redundancyId: 'redundancy_id',
      operationType: 'operation_type',
      status: 'status',
    }
    for (const [field, column] of Object.entries(optionalColumns)) {
      if (filter[field]) {
        clauses.push(`${column} = @${field}`)
        parameters[field] = filter[field]
      }
    }
    return this.database
      .prepare(
        `SELECT * FROM redundancy_operation_task
         WHERE ${clauses.join(' AND ')}
         ORDER BY started_at DESC LIMIT @limit`,
      )
      .all(parameters)
      .map((row) => this.mapOperationTask(row))
  }

  /**
   * 查询操作任务及其逐 APP 步骤。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} taskId 任务 ID。
   * @returns {object|null} 操作任务详情。
   */
  getOperationTaskDetail (tenantId, taskId) {
    const task = this.findOperationTaskById(tenantId, taskId)
    if (!task) return null
    const appSteps = this.database
      .prepare(
        `SELECT * FROM redundancy_operation_app_step
         WHERE tenant_id = ? AND task_id = ? ORDER BY started_at, step_id`,
      )
      .all(tenantId, taskId)
      .map((row) => this.mapAppStep(row))
    return { ...task, appSteps }
  }

  /**
   * 将所有运行中或等待中的任务标记为中断。
   *
   * @param {string} reason 中断原因。
   * @returns {number} 受影响任务数。
   */
  interruptRunningTasks (reason) {
    const now = this.clock()
    return this.database
      .prepare(
        `UPDATE redundancy_operation_task
         SET status = 'INTERRUPTED', failure_message = ?, updated_at = ?, finished_at = ?
         WHERE status IN ('PENDING', 'RUNNING')`,
      )
      .run(reason, now, now).changes
  }

  /**
   * 清理指定时间之前的已恢复事件和成功任务。
   *
   * @param {string} cutoffTime ISO 截止时间。
   * @returns {{events: number, tasks: number}} 删除统计。
   */
  cleanupBefore (cutoffTime) {
    const cleanup = this.database.transaction(() => {
      const events = this.database
        .prepare(
          `DELETE FROM redundancy_event
           WHERE status = 'RECOVERED' AND recovered_at < ?`,
        )
        .run(cutoffTime).changes
      const tasks = this.database
        .prepare(
          `DELETE FROM redundancy_operation_task
           WHERE status = 'SUCCEEDED' AND finished_at < ?`,
        )
        .run(cutoffTime).changes
      return { events, tasks }
    })
    return cleanup()
  }

  /**
   * 返回底层数据库，仅供启动检查和诊断使用。
   *
   * @returns {object} better-sqlite3 数据库对象。
   */
  getDatabase () {
    return this.database
  }

  /**
   * 关闭数据库连接。
   *
   * @returns {void}
   */
  close () {
    this.database.close()
  }

  /**
   * 按 ID 查询事件。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} eventId 事件 ID。
   * @returns {object|null} 事件或 null。
   */
  findEventById (tenantId, eventId) {
    return this.mapEvent(
      this.database
        .prepare('SELECT * FROM redundancy_event WHERE tenant_id = ? AND event_id = ?')
        .get(tenantId, eventId),
    )
  }

  /**
   * 按 ID 查询操作任务。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} taskId 任务 ID。
   * @returns {object|null} 任务或 null。
   */
  findOperationTaskById (tenantId, taskId) {
    return this.mapOperationTask(
      this.database
        .prepare('SELECT * FROM redundancy_operation_task WHERE tenant_id = ? AND task_id = ?')
        .get(tenantId, taskId),
    )
  }

  /**
   * 按 ID 查询 APP 步骤。
   *
   * @param {string} tenantId 租户 ID。
   * @param {string} stepId 步骤 ID。
   * @returns {object|null} 步骤或 null。
   */
  findAppStepById (tenantId, stepId) {
    return this.mapAppStep(
      this.database
        .prepare('SELECT * FROM redundancy_operation_app_step WHERE tenant_id = ? AND step_id = ?')
        .get(tenantId, stepId),
    )
  }

  /**
   * 将数据库事件行转换为领域对象。
   *
   * @param {object|undefined} row 数据库行。
   * @returns {object|null} 领域对象。
   */
  mapEvent (row) {
    if (!row) return null
    return {
      eventId: row.event_id,
      redundancyId: row.redundancy_id,
      redundancyName: row.redundancy_name_snapshot,
      tenantId: row.tenant_id,
      reasonKey: row.reason_key,
      eventType: row.event_type,
      reasonCode: row.event_type,
      severity: row.severity,
      nodeId: row.node_id,
      appId: row.app_id,
      summary: row.summary,
      detail: this.parseJson(row.detail_json, 'redundancy_event.detail_json'),
      status: row.status,
      occurredAt: row.occurred_at,
      openedAt: row.occurred_at,
      recoveredAt: row.recovered_at,
      acknowledgedBy: row.acknowledged_by,
      acknowledgedAt: row.acknowledged_at,
    }
  }

  /**
   * 将数据库任务行转换为领域对象。
   *
   * @param {object|undefined} row 数据库行。
   * @returns {object|null} 领域对象。
   */
  mapOperationTask (row) {
    if (!row) return null
    return {
      taskId: row.task_id,
      requestId: row.request_id,
      redundancyId: row.redundancy_id,
      redundancyName: row.redundancy_name_snapshot,
      tenantId: row.tenant_id,
      operationType: row.operation_type,
      status: row.status,
      currentStage: row.current_stage,
      configRevision: row.config_revision,
      operator: row.operator,
      input: this.parseJson(row.input_json, 'redundancy_operation_task.input_json'),
      result: this.parseJson(row.result_json, 'redundancy_operation_task.result_json', null),
      failureMessage: row.failure_message,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      finishedAt: row.finished_at,
    }
  }

  /**
   * 将数据库 APP 步骤行转换为领域对象。
   *
   * @param {object|undefined} row 数据库行。
   * @returns {object|null} 领域对象。
   */
  mapAppStep (row) {
    if (!row) return null
    return {
      stepId: row.step_id,
      taskId: row.task_id,
      tenantId: row.tenant_id,
      nodeId: row.node_id,
      appId: row.app_id,
      action: row.action,
      commandId: row.command_id,
      commandStatus: row.command_status,
      observedStatus: row.observed_status,
      failureMessage: row.failure_message,
      detail: this.parseJson(row.detail_json, 'redundancy_operation_app_step.detail_json'),
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      finishedAt: row.finished_at,
    }
  }

  /**
   * 安全解析数据库 JSON 字段。
   *
   * @param {string|null} value JSON 字符串。
   * @param {string} fieldName 字段名称。
   * @param {unknown} [emptyValue={}] 空值返回值。
   * @returns {unknown} 解析结果。
   */
  parseJson (value, fieldName, emptyValue = {}) {
    if (value === null || value === undefined) return emptyValue
    try {
      return JSON.parse(value)
    } catch (error) {
      throw new RedundancyError(
        ERROR_CODE.DATABASE_DATA_INVALID,
        `冗余数据库字段 ${fieldName} 不是有效 JSON`,
        500,
        { fieldName },
      )
    }
  }
}

module.exports = { EventRepository }
// end
