#!/bin/bash

# 当前目录
workDir=$(cd $(dirname $0); pwd);

# 日志文件路径
logFilePath=${workDir}/log.log;


## 给代理启动脚本赋予执行权限
sudo chmod +x "${workDir}"/start.sh

while true
do
    # 由于运维代理启动需要大约15s，所以不能通过检测端口判断状态
    # 即不能使用 check=$(netstat -tunlp | grep "LISTEN" | grep -E ":13000 " | wc -l);
    check=$(sudo ps -aux | grep "kingopsagent/exe/node" | grep -c "/exe/kingopsagent/exe/index");
    if [ "$check" -lt 1 ]
    then
        echo ["$(date "+%Y-%m-%d %H:%M:%S")"] restart opsproxy >> "${logFilePath}";
        rm -f ./nohup.out;
        nohup "${workDir}"/start.sh &
    fi
    
    sleep 3;
done