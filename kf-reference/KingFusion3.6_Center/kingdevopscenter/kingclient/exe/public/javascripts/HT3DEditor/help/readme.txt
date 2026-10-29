感谢您使用 HT 编辑器，这是一款集成了矢量图标和拓扑图纸编辑，纯 Web 可视化设计工具，HT 编辑器基于 HT for Web 图形组件库打造而成，更多信息请访问图扑软件官网：http://www.hightopo.com

本软件产品版权人图扑软件对本软件用户许可协议的各项内容拥有最终解释权。试用用户不得将本软件以任何方式泄露给任何第三方，如因试用用户自身行为导致本软件泄露的，用户承担泄露带来的一切损失，如对图扑软件造成损失，包括但不限于名誉及经济方面，图扑软件留向用户追偿的权利。

==============================
常见问题（FAQ）：
==============================

1、HT 是什么？
HT 是 HT for Web 的简称，其包含树、表格、对话框等通用组件、2D 拓扑图组件、3D 图形组件，这些组件都是供 API 的方式进行二次开发。

2、HT 矢量是什么？
HT 提供了 JSON 格式的图形描述，并且 HT 的所有组件都能渲染显示这些矢量格式，详见 http://www.hightopo.com/guide/guide/core/vector/ht-vector-guide.html ，在 HT 的架构里 PNG、JPG 和 JSON 的矢量格式内容都是图片，都可以通过 ht.Default.setImage 进行注册并供所有组件使用。

3、拓扑图是什么？
拓扑图是泛化的说法，电信网管的网络拓扑图、电力的电网拓扑图、工业控制的监控图、工作流程图、思维脑图等等，简单说就是节点连线构成的这些都是这里指的拓扑图。

4、Symbol 和 Display 是什么？
Symbol 指「矢量图标」，Display 指「拓扑图纸」，简称「图标」和「图纸」。

5、Symbol 和 Display 的存储格式一样吗？
两者都是采用 JSON 方式存储，但格式标准不一样，图标格式参见 http://www.hightopo.com/guide/guide/core/vector/ht-vector-guide.html，图纸格式参见 http://www.hightopo.com/guide/guide/core/serialization/ht-serialization-guide.html

7、Components 是什么？
Component 指「组件」，是构成矢量图标 Symbol 的最小单元，HT 默认提供了矢量手册 www.hightopo.com/guide/guide/core/vector/ht-vector-guide.html 中介绍的 rect, circle, shape, image, text 等类型，当这些基础组件无法满足需求时，用户也可以通过自定义 Component 组件增加更多矢量类型。

8、编辑器由哪几部分组成？
HT 编辑器大体分为帮助文档（help）、客户端（client）、服务端（server）和存储资源（instance）四部分构成，详见 files.txt 编辑器文件系统说明。

9、如何运行？
HT 编辑器服务端基于 Node.js，需要安装 Node.js 环境（https://nodejs.org），然后在解压编辑器的 zip 目录下，运行 node server/server.js 命令进行服务器启动，服务器启动成功后会自动打开默认浏览器，并访问 http://localhost:5566 的 instace-enjoy 实例页面，可通过 server/config.ini 文件修改 port 端口，通过 http://localhost:5666 可访问干净的 instance-default 实例。

10、如何切换客户端语言？
修改 instance/custom/configs/config.js 文件的 locale 属性，zh 代表中文，en 代表英文。参考 i18n.txt 文档。

11、服务器启动有问题怎么办？
为了方便客户，HT 编辑器默认已经包含了第三方 Node.js 模块在 server/node_modules 目录，可尝试通过删除 node_modules 目录，然后在 server 目录下运行 npm install 命令的方式重新安装，试试。

12、服务器放在 Linux 环境下 Node 出现 Error: watch *** ENOSPC 错误怎么办？
执行命令 cat /proc/sys/fs/inotify/max_user_watches 看当前的 max_user_watches 配置数，适当的把这个配置项调整大，调整命令为：

echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p

我们编辑器的服务端需要通过 watch 文件变化来通知前端页面资源刷新，根据不同的 storage 文件夹下的文件数需要的 max_user_watches 也不同。如果系统配置的值不够，建议可以适当的把这个值向上调整到较大的范围。

13、客户端打开有问题怎么办？
请确保你使用支持 HTML5 的浏览器，如果用 IE 请确保是 IE9 及以上的版本，记得不要打开兼容模式，其他浏览器应该都是没问题的，iOS 和 Android 上的浏览器也都支持。

14、有没有 Windows 下的 exe 或 Mac 下的 dmg 的可执行程序？
可用 http://electron.atom.io 技术进行打包，有图有真相 http://www.hightopo.com/images/ht-electron.jpg

15、如何发布？
编辑器编辑后的最终产品就是 storage 里面的所有内容，只要将运行时的 HTML 页面放置在 storage 目录下即可，这样只需要将 storage 部署在任何 HTTP 服务下，通过映射的 URL 地址访问 storage 目录下的 运行时 HTML 页面。

简单的方式就是启动 HT 编辑器自带的 Node 服务，与客户的 HTTP 服务并行运行，这样也不需要有 storage 的拷贝同步过程，编辑器的任何修改，用户随时可以浏览到最新图纸。

如果有必要，例如不想多开端口，或不想启动两个服务，也可以根据自己的语言平台，完全重写后台服务，参考 service.txt 文档。

16、还有问题有建议怎么办？
找我们：service@hightopo.com 还请将问题和建议描述清楚再发邮件，非常感谢！
