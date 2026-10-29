<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
# 真实工程与一次局部修复成功的原稿（2026-10-27）

10:14，visual-semantic@21 / semantic-repair@10。新增审核43项、omit=0，独立蓝图确认与新工程签名；公开识图/蓝图仍来自本地规划夹具，result的acceptanceMode明确为semantic-only-with-new-approvals。physicalRequests=2，planningFixtureRequests=2（0token），不冒充完整真实识图验收。

初稿55节点/43绑定，控件均有显式合法styleRole；一次delta仅一个upsert-nodes、2节点，显式将node-devices改为批准的row外壳并用唯一column子节点容纳原内容，原plan/绑定/合法样式未重写。合并后通过全部严格语义/来源/候选/观察/native路径，工程Run及真实BuildJob均SUCCEEDED，实际制品字节SHA与数据库artifact一致。

真实产物：agent-app/outputs/energy-ui-20261027/energy-client.gz，22404bytes，SHA256 ebd0d47c13f568a50afcc9c29113f39a2356100de10f17992baeb5df9f9e59c7；64条归档项、展开128965bytes。产物未手工改写。随后这组字节在KF443独立工程通过导入、页面逐值读回、导出及另一个独立工程再导入。result.json的nativeKfAccepted=false/browserAccepted=false是原始模型测试结束时事实，保留原件，不倒改；后续原生证据另见outputs说明。尚无发布运行、截图或1:1结论。

implementation input/output=26513/7553、cache hit/miss=0/26513、latencyMs=23388；repair=30776/272、4352/26424、2261ms。该轮样本不证明通用缓存命中率或固定省费比例。

原始目录：/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-energy-live-XiR8Ks。只复制公开JSON字节，model-reply-1/2分别重命名为initial-provider-reply/repair-delta-provider-reply。无密钥、授权头、私有receipt、隐藏思维链或图片base64。

## 原件校验

- accepted-differences.json SHA256：`9ac60889c84e1d30031c6cb027b922af6a332a3a6c708cabbb99e6cb69e0211f`
- blueprint.json SHA256：`c65ee0ce1ab7ae021dfdf37dd23e55a5650db155444a7952d8658dbe6f2acded`
- initial-provider-reply.json SHA256：`8276faec2cc945bc449f051a643fa73163ecdf1b6d2f49e83c365a1755b0dd0a`
- reference-review-before-edit.json SHA256：`c826f7800433f89ffbb96ff1b8b6a823b16f5761280a4ab5cf11a5b2dcc8ec2d`
- reference-review.json SHA256：`c826f7800433f89ffbb96ff1b8b6a823b16f5761280a4ab5cf11a5b2dcc8ec2d`
- repair-delta-provider-reply.json SHA256：`29a5ee947af48b21f8b8f7666a9d0849444ef03f79b92a80a2e2bb9393d7f4e5`
- result.json SHA256：`c24cd259c0e92df0de41400e18b3ad634735e3adc4d846376b7b818c8ba773f1`
<!-- end -->
