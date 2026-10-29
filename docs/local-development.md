# 本地开发

```bash
pip install -r apps/api/requirements.txt
uvicorn app.main:app --port 8000 --app-dir apps/api
npm install
npm run dev:expo
# 或浏览器调试
npm run dev:expo:web
```

开发 Seed 密码统一为 `weave12345`。
