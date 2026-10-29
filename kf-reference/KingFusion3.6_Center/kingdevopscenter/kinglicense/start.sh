#!/bin/bash

# 当前目录
workDir=$(cd "$(dirname "$0")" || exit; pwd);

while true
do
    check=$(sudo ps -aux | grep "kinglicense/exe/node" | grep "kinglicense/exe/index" | wc -l)
    if [ $check -lt 1 ]
    then
        # 启动
        sudo "$workDir"/exe/node "$workDir"/exe/index.js;
    fi

    sleep 3;
done