#!/bin/bash

# 当前目录
# workDir=$(cd "$(dirname "$0")" || exit; pwd);

# 查杀服务
# shellcheck disable=SC2009
sudo kill -9 "$(sudo ps -aux | grep "kinglicense/start.sh" | grep -v grep | awk '{print $2}')" > /dev/null 2>&1;
licensePid=`sudo netstat -tunlp | grep tcp | grep LISTEN | grep -E ":11007\\s" | sudo awk '{print $7}' | sudo awk -F/ '{print $1}'`
if [[ x"licensePid" != x ]]
then
    kill -9 $licensePid 2>&1 > /dev/null;
fi