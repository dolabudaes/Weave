# Weave

## 界面预览

<p>
  <img src="weave-picture/01-login.png" alt="Login" width="180" />
  <img src="weave-picture/02-home.png" alt="Home" width="180" />
  <img src="weave-picture/03-noa-chat.png" alt="Noa chat" width="180" />
  <img src="weave-picture/04-noa-recommendations.png" alt="Noa recommendations" width="180" />
</p>
<p>
  <img src="weave-picture/05-messages.png" alt="Messages" width="180" />
  <img src="weave-picture/06-chat.png" alt="Chat" width="180" />
  <img src="weave-picture/07-profile.png" alt="Profile" width="180" />
  <img src="weave-picture/08-match.png" alt="Match" width="180" />
</p>
<p>
  <img src="weave-picture/09-discover.png" alt="Discover" width="180" />
  <img src="weave-picture/10-match-waiting.png" alt="Match waiting" width="180" />
</p>

## 数据集

本地开发会用到两套数据：

- `socialpersona-6E9B`：约 100 个匿名用户的画像与帖子，启动时导入成演示账号池。
- `CartoonSet-100`：对应头像图（`001.png`–`100.png`）。

## 启动

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r apps/api/requirements.txt
cp .env.example .env
npm install
```

API：

```bash
source .venv/bin/activate
npm run dev:api
```

前端（Web）：

```bash
npm run dev:expo:web
```

前端（手机 / 模拟器）：

```bash
npm run dev:expo
npm run dev:expo -- ios
npm run dev:expo -- android
```

Docker 只起 API：

```bash
docker compose up --build api
```
