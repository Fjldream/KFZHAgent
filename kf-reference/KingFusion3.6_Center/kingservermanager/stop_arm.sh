#!/bin/bash

# 当前目录
# workDir=$(cd "$(dirname "$0")" || exit; pwd);

# 查杀服务
# shellcheck disable=SC2009
sudo kill -9 "$(ps -aux | grep "kingservermanager/start_arm.sh" | grep -v grep | awk '{print $2}')" > /dev/null 2>&1;