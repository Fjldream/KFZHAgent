#!/bin/bash

# 当前目录
workDir=$(cd "$(dirname "$0")" || exit; pwd);

# 启动
"$workDir"/../env/linux_x64/node "$workDir"/exe/src/index.js;