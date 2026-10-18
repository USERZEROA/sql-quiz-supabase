# 先完成这一步

把压缩包中 sql-quiz-supabase 文件夹里的内容，复制到你现有的同名项目根目录。不要在原项目里再套一个同名文件夹。压缩包没有 .env.local、.git 或 node_modules，不会提供或覆盖你的真实密码。

截图中空白的 supabase/01_quiz_data.sql 可以用包中的版本覆盖。文件内容已改为矿场的 12 条记录，不是之前的电商或电影数据。已有云数据和 quiz_reader 的登录密码不用重建。

## 现在需要执行的 SQL

在 Supabase SQL Editor 新建查询，完整复制 supabase/03_saved_quizzes.sql 并运行一次。它只增加保存测验所需的表和权限。

最后应该显示：

| rls_enabled | signed_in_can_save | signed_out_can_save | reader_can_read_saved_quizzes |
| --- | --- | --- | --- |
| true | true | false | false |

## 接下来本地启动

项目根目录 PowerShell：

```powershell
node --version
npm install
npm run typecheck
npm test
npm run build
npm run check:db
npm run dev
```

需要 Node.js 22 或 24。访问 http://localhost:3000。先不要 commit/push，也不用先部署 Vercel。若前一条失败，停在该步骤检查报错，不要把后面成功的步骤当作前一步已解决。

.env.local 继续保留你的三个值：NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY、QUIZ_DATABASE_URL。第三项必须是 quiz_reader 的 Session pooler 连接串，带 sslmode=require。不要发送包含密码的文件或日志。

认证采用 Supabase 邮箱/密码，尚需在控制台启用并创建测试用户；此步骤和部署等本地检查后再做。注册启用了邮箱确认但未配置邮件服务时，不要误以为网站无法登录：可以先从 Authentication → Users 创建并确认自己的测试用户。

最终提交之前必须完成真实登录、运行、保存、登出拒绝、其他账户不能访问私人保存记录、Vercel 正式地址和 GitHub Actions 的云数据库绿色运行。README 有网站地址占位符，部署后必须替换成真实地址。
