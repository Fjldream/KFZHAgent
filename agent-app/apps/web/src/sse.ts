// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
// Run 只订阅 GET 事件流；这里仅保留无执行副作用的 SSE 帧解析器。
export interface SseFrame {
  event: string;
  data: unknown;
}

/** 解析单个 SSE 数据块（可包含多帧）。 */
export function parseSseBlocks(text: string): SseFrame[] {
  const frames: SseFrame[] = [];
  for (const block of text.split("\n\n")) {
    if (block.trim().length === 0) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice("event:".length).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trim());
    }
    if (dataLines.length === 0) continue;
    frames.push({ event, data: JSON.parse(dataLines.join("\n")) as unknown });
  }
  return frames;
}
// end
