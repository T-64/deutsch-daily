# 准时更新：外部定时触发

节目在柏林时间傍晚播出，课程要在**第二天柏林时间 08:00 前**上线。

`update-lessons.yml` 自带定时（傍晚每小时一次，凌晨再三次），但 GitHub 的定时任务高峰期常延迟数小时。
为了保证准时，再用一个外部定时服务按精确时间调用 GitHub 接口触发同一个工作流。重复触发无害：已经发布的日期会被跳过。

## 1. 建一个只能触发工作流的 token

GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token

- Repository access：**Only select repositories** → `T-64/deutsch-daily`
- Permissions → Repository permissions → **Actions: Read and write**（其他保持 No access）
- Expiration：按需要（到期后在这里重新生成并更新到第 2 步）

这个 token 只能触发和查看 Actions，不能改代码、不能读 Secrets。

## 2. 在 cron-job.org 建定时任务

[cron-job.org](https://cron-job.org)（免费）→ Create cronjob：

| 字段 | 值 |
|---|---|
| URL | `https://api.github.com/repos/T-64/deutsch-daily/actions/workflows/update-lessons.yml/dispatches` |
| Request method | `POST` |
| Headers | `Authorization: Bearer <第 1 步的 token>`<br>`Accept: application/vnd.github+json`<br>`X-GitHub-Api-Version: 2022-11-28` |
| Request body | `{"ref":"main"}` |
| Time zone | `Europe/Berlin` |
| Schedule | 每天 **19:30、21:30、23:30、05:30** |

成功时 GitHub 返回 `204 No Content`，Actions 页面会出现一次 `workflow_dispatch` 运行。

token 只保存在 cron-job.org，不要写进仓库或任何文件。
