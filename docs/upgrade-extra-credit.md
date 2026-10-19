# 升级步骤

这是在已经运行的矿场测验上增加参数化查询、审计日志、日志完整性验证，以及 20 分评分显示的补丁。不是新项目，不重建原来的 12 条数据，不重设密码。

## 1. 复制文件

关闭本地 `npm run dev`。将补丁中的 `sql-quiz-supabase` 文件夹**内部内容**复制到现有项目根目录，同名文件覆盖，新文件合并。不要套一层同名目录。

保留现有 `.env.local`、`.env.example`、`supabase/supabase-ca.crt`、`package-lock.json`、`next.config.ts` 和 SQL 01–03。它们不在补丁中。GitHub 和 Vercel 仍使用原来的配置，没有新增 Secret。README 顶部已醒目标明：测验登录账户和密码将写在 Canvas 作业评论中，仓库内不包含密码。

## 2. 执行两份 SQL

在现有 Supabase 项目的 SQL Editor 以 `postgres` 运行完整的 `supabase/04_extra_credit.sql`，命名为 `04_extra_credit`。

最后一行应返回：

| audit_rls | backend_can_append | reader_can_edit_log | taker_can_edit_log | taker_can_view_own_activity |
| --- | --- | --- | --- | --- |
| true | true | false | false | true |

随后完整执行 `supabase/05_verify_audit_integrity.sql`，命名为 `05_verify_audit_integrity`。它需要项目中已有至少一个 Auth 用户（你已经创建过）。预期 19 项检查的 passed 均为 true。脚本只创建并清理自身的临时检查数据，不删除旧测验或业务日志；异常允许的操作会令测试事务失败并回滚。

如果执行报错就停下，不要删除原表或修改权限绕过检查。

## 3. 本地验证

这次没有新增依赖，不需要重新安装。依次运行，遇到第一处失败就停止：

```powershell
npm run check:all
```

通过后再启动网站：

```powershell
npm run dev
```

打开本地网站并登录。第一题点击 Use parameterized example，再 Run SQL & check answer。应返回 4 行、获得 4/4 分。五题全部运行正确参考 SQL 后，顶部应显示 20/20。编辑 SQL 或参数会清除该题分数；保存、刷新并 Open 后恢复经过验证的分数。

页面底部 My activity 会显示查询与保存事件。SQL Editor 中也可以由管理员查询 `quiz_audit.events`；学生账户不能直接读取、改写或删除整个日志。

## 4. 提交和上线

本地验证通过后：

```powershell
git add -A
git diff --cached --stat
git commit -m "Add parameterized queries, audit integrity checks and quiz scoring"
git push
```

确认 GitHub 两个 job 全部绿色；`live-database` 现在还会运行 `check:audit`。Vercel 会根据新提交部署，原来四项环境变量继续使用。部署后按 `docs/acceptance.md` 完成线上验证，再填写实际验收结果。

## 评分含义

原题没有要求自动评分，这是本次额外补上的功能。运行成功不一定答对。评分比较查询结果的值与题目要求的行顺序，不比较 SQL 文本，别名差异不扣分。每题为 4 或 0 分，无部分分；不运行的题目不计分。查看提示和使用参考 SQL 不会直接给分。

旧测验保留，但此前没有记录过评分的答案需要重新运行。保存接口不接受用户指定的得分；数据库根据该用户最近匹配的查询日志重新写入分数。审计历史只从应用本次升级后开始记录，不伪造旧操作历史。
