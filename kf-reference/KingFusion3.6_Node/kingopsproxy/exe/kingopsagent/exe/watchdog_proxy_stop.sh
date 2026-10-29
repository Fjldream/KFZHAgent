#!/bin/bash

# 停止看门狗
sudo kill -9 $(sudo ps -aux | grep "watchdog_proxy_start.sh" | grep -v grep | awk '{print $2}' | awk -F/ '{print $1}') 2&>1 /dev/null;
# 停止代理
port=13000;
sudo kill -9 $(netstat -tunlp | grep tcp | grep LISTEN | grep -E ":${port}\\s" | awk '{print $7}' | cut -d/ -f1 | sort | uniq) 2&>1 /dev/null;