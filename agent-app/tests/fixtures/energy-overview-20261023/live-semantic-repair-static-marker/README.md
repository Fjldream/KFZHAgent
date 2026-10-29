<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 识图将冗余状态色点识别成table的真实负例

2026-10-26 13:47:20 /16.78s，blueprint@7/semantic@9、两种修复均显式once，实际仅1次vision请求；工程与语义修复均未调用。固定演示图中device-2-status-dot与device-3-status-dot被识别为table且无子节点/文字，目录不支持，因此验收在WAITING_INPUT停止，未自动删除业务状态。已有固定行审阅先更正静态行容器并留下before/edit事实，但不包含这两个叶子小色点。

vision实际input/output=1534/3584，cacheHit/cacheMiss=1280/254，latencyMs=11716。source图片仍为上级reference.png，SHA256 `3a79f4361e1e48b80ce64b1ec4053be63b4827df1c3f42deb5c7887bd3f2488c`。五份JSON逐字节来自 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-energy-live-xpS1uT`，provider-reply.json对应model-reply-1.json；未保留key/header/reasoning/base64或私有签名。JSON为原事实，不加注释。

随后对照目标图，新增仅测试使用的固定图审阅辅助：严格限定sourceHash、已知页头细线/三条设备状态色点的位置、叶子无文字无交互无数据要求，并验证相同父行包含设备名称及运行正常/待检修文字。明确省略冗余装饰时通过原acceptedDifferences/HMAC/确认链记录，保留全部业务文字和数值；其他图、不含状态文字或含交互的区域不省略。不是生产映射fallback，也不代表像素一致。未改这五份原回复或恢复旧Run；后续新验收单独记录。

- reference-review.json SHA256：`b76c3a8dc17f734e5c73e4c4a1dec7b98d76f68281caf3975ca23097dd48e757`
- reference-review-before-edit.json SHA256：`8df77451841ae283138f74f7c4176533243ecff9cbf270dc05b216600f229d85`
- reference-review-edit.json SHA256：`e0b41d1084cb6770778e7543844b367f6fbc8abe4cccc6a1bb09baf14aa0d3ab`
- provider-reply.json SHA256：`ab8e536ff014fe45b394f0cfdea7ca370e2610edaf59d374ccde4a48fd77b66e`
- result.json SHA256：`db674052a292fc07c3b99da9df036337017961e46cd67cc75603409efe3286a6`
<!-- end -->
