// modified by jinlong.feng at 0901 冗余功能开发
import { ElMessage } from "element-plus";

/** 构造只作用于冗余模块的消息配置。 */
export function createRedundancyMessageOptions(type, message) {
  return {
    type,
    message,
    placement: "top",
    customClass: "redundancy-message",
  };
}

/** 展示位置稳定的冗余操作消息。 */
export function showRedundancyMessage(type, message) {
  return ElMessage(createRedundancyMessageOptions(type, message));
}
// end
