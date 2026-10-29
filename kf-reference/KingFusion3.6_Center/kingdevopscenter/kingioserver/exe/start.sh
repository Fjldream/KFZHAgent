#!/bin/bash -e
workDir=$(cd $(dirname $0); pwd);
# common inof

#.sh file dir
chmod 777 "$workDir/../../node_executable/node";
#启动参数检验
if [ "$1" = '-v' -o "$1" = '-version' ]; then
    "$workDir/../../node_executable/node"  --experimental-worker "$workDir/index.js" -v;
else
    #.sh file dir
    "$workDir/../../node_executable/node"  --experimental-worker "$workDir/index.js";
fi
