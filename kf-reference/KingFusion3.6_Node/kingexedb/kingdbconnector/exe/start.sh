#!/bin/bash

# 当前目录
workDir=$(cd $(dirname $0);pwd);

export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:${workDir}/core/extensions/linux/KSLXC;

"${workDir}/../../../env/linux_x64/node" "${workDir}/index.js" $1