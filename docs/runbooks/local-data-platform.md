# Local Data Platform Runbook

## 启动

推荐使用托管开发栈：

```powershell
npm run dev:stack
```

该命令启动 Compose 基础设施和 Node 服务。按 `Ctrl+C` 后会先优雅关闭 Node、数据库连接池和后台 worker，再执行 Compose `down --remove-orphans`。命名卷会保留。

也可以只启动基础设施：

```powershell
Copy-Item infra/dev/.env.example infra/dev/.env
docker compose --env-file infra/dev/.env -f infra/dev/compose.yaml up -d
docker compose --env-file infra/dev/.env -f infra/dev/compose.yaml ps
```

访问地址：Redpanda Console `http://localhost:18080`，MinIO Console `http://localhost:19001`，Iceberg REST `http://localhost:18181`。

## 停止

```powershell
docker compose --env-file infra/dev/.env -f infra/dev/compose.yaml down
npm run stack:stop
```

默认保留命名卷。只有确定不需要测试数据时，才手工执行带 `--volumes` 的清理命令。该 Compose 不管理项目现有 PostgreSQL，不会删除其数据。

`npm start` 只启动 Node 服务，因此只能回收 Node 自己的连接池、定时器和 worker，不能停止外部 PostgreSQL 服务或手工启动的容器。需要自动回收基础设施时使用 `npm run dev:stack`。项目不会擅自停止操作系统级 PostgreSQL，因为它可能被其他应用共享。

## 健康验证

```powershell
docker compose --env-file infra/dev/.env -f infra/dev/compose.yaml ps
Invoke-RestMethod http://localhost:19644/v1/status/ready
Invoke-RestMethod http://localhost:19000/minio/health/live
Invoke-RestMethod http://localhost:18181/v1/config
```

## 回滚

关闭后续功能开关并执行 `docker compose ... down`。基础设施当前是旁路环境，不改变 Node.js + PostgreSQL 主链路。
