#!/bin/bash -e
workDir=$(cd $(dirname $0); pwd);
# common info
chmod 777 "$workDir/../../../../env/linux_x64/node";
#.sh file dir
# 前端启动
"$workDir/../../../../env/linux_x64/node" "$workDir/index";