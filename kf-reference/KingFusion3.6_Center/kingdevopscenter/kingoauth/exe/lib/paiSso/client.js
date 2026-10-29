"use strict";

/**
 * paiSso —— kafkajs 客户端封装（生产者/消费者单例）
 * 连接参数、主题均来自同目录 config.json。
 * kafkajs 由本模块自带的 node_modules 就近解析，不依赖 kingoauth 主依赖。
 */

const { Kafka, Partitioners, logLevel: KafkaLogLevel } = require("kafkajs");
const config = require("./config.json");
const logger = require("./logger");

const kafkaConfig = config.kafka;

const LOG_LEVEL_MAP = {
  debug: KafkaLogLevel.DEBUG,
  info: KafkaLogLevel.INFO,
  warn: KafkaLogLevel.WARN,
  error: KafkaLogLevel.ERROR,
  nothing: KafkaLogLevel.NOTHING
};

function resolveLogLevel(name) {
  return Object.prototype.hasOwnProperty.call(LOG_LEVEL_MAP, name)
    ? LOG_LEVEL_MAP[name]
    : KafkaLogLevel.INFO;
}

class PaiKafkaClient {
  constructor() {
    this.kafka = new Kafka({
      clientId: kafkaConfig.clientId,
      brokers: kafkaConfig.brokers,
      ssl: kafkaConfig.ssl,
      sasl: {
        mechanism: kafkaConfig.sasl.mechanism,
        username: kafkaConfig.sasl.username,
        password: kafkaConfig.sasl.password
      },
      logLevel: resolveLogLevel(kafkaConfig.logLevel)
    });
    this.producer = this.kafka.producer({ createPartitioner: Partitioners.LegacyPartitioner });
    this.consumer = this.kafka.consumer({ groupId: kafkaConfig.groupId });
    this.producerReady = false;
    this.consumerReady = false;
    // modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
    this.producerConnecting = null;
    this.consumerStarting = null;
    this.consumerWaiters = new Set();
    this.consumer.on(this.consumer.events.GROUP_JOIN, ({ payload }) => {
      const partitions = payload.memberAssignment && payload.memberAssignment[config.topics.inbox];
      this.consumerReady = Array.isArray(partitions) && partitions.length > 0;
      if (this.consumerReady) {
        this.consumerWaiters.forEach(function (complete) { complete(); });
      }
    });
    ["REBALANCING", "CRASH", "STOP", "DISCONNECT"].forEach((eventName) => {
      this.consumer.on(this.consumer.events[eventName], () => {
        this.consumerReady = false;
      });
    });
    // end
  }

  // modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
  async ensureProducer() {
    if (this.producerReady) {
      return;
    }
    if (!this.producerConnecting) {
      this.producerConnecting = Promise.resolve().then(async () => {
        try {
          await this.producer.connect();
        } catch (error) {
          logger.log("error", "producer 连接失败：" + error.message);
          throw error;
        }
        this.producerReady = true;
        logger.log("info", "producer 已连接");
      }).finally(() => {
        this.producerConnecting = null;
      });
    }
    await this.producerConnecting;
  }

  async startConsumer(messageHandler) {
    if (this.consumerReady) {
      return;
    }
    if (!this.consumerStarting) {
      this.consumerStarting = Promise.resolve().then(async () => {
        await this.consumer.connect();
        await this.consumer.subscribe({ topic: config.topics.inbox, fromBeginning: false });
        await this.consumer.run({
          eachMessage: async ({ topic, partition, message }) => {
            if (typeof messageHandler === "function") {
              await messageHandler(message, { topic, partition, offset: message.offset });
            }
          }
        });
        // run() 返回不能替代 GROUP_JOIN 的分区分配确认。
      }).finally(() => {
        this.consumerStarting = null;
      });
    }
    await this.consumerStarting;
  }

  waitForConsumer(signal) {
    return new Promise((resolve, reject) => {
      const complete = () => {
        this.consumerWaiters.delete(complete);
        if (signal) {
          signal.removeEventListener("abort", complete);
        }
        if (signal && signal.aborted) {
          reject(new Error("PAI 换票请求已结束"));
        } else {
          resolve();
        }
      };
      if ((signal && signal.aborted) || this.consumerReady) {
        complete();
        return;
      }
      this.consumerWaiters.add(complete);
      if (signal) {
        signal.addEventListener("abort", complete, { once: true });
      }
    });
  }

  // modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
  async send(topic, key, payload, signal) {
    try {
      await this.waitForConsumer(signal);
      if (signal && signal.aborted) return;
      await this.ensureProducer();
      await this.waitForConsumer(signal);
      if (signal && signal.aborted) return;
      return await this.producer.send({
        topic: topic,
        messages: [{ key: key, value: JSON.stringify(payload) }]
      });
    } catch (error) {
      logger.log("error", "Kafka 发送失败：" + error.message);
      throw error;
    }
  }
  // end

  async disconnect() {
    if (this.producerReady) {
      await this.producer.disconnect();
      this.producerReady = false;
    }
    if (this.consumerReady) {
      await this.consumer.disconnect();
      this.consumerReady = false;
    }
  }
}

module.exports = new PaiKafkaClient();
