#!/bin/bash

# 当脚本退出（Ctrl+C）时，杀掉所有后台子进程
trap "exit" INT TERM
trap "kill 0" EXIT

cd server && deno task dev &
cd client && deno task dev
