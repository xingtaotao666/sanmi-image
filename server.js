/**
 * 三米生图 - 后端代理服务器
 * 隐藏 API Key，代理转发豆包 Seedream API 请求
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 从环境变量读取 API 配置
const ARK_API_KEY = process.env.ARK_API_KEY;
const ARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const ARK_MODEL = process.env.ARK_MODEL || 'doubao-seedream-5-0-pro-260628';

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' })); // 图生图 base64 可能很大
app.use(express.static(path.join(__dirname, 'public')));

// ========================================
// API 代理路由
// ========================================
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, size, image, watermark } = req.body;

    // 参数校验
    if (!prompt) {
      return res.status(400).json({ error: '缺少 prompt 参数' });
    }

    // 构建请求体
    const reqBody = {
      model: ARK_MODEL,
      prompt: prompt,
      response_format: 'url',
      size: size || '2048x2048',
      stream: false,
      watermark: watermark !== false,
    };

    // 图生图：添加参考图
    if (image) {
      reqBody.image = image;
    }

    console.log(`[三米生图] ${image ? '图生图' : '文生图'} 请求: "${prompt.slice(0, 50)}..." size=${size}`);

    // 调用豆包 API
    const response = await fetch(ARK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ARK_API_KEY}`,
      },
      body: JSON.stringify(reqBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[三米生图] API错误:', response.status, JSON.stringify(data));
      return res.status(response.status).json({
        error: 'API调用失败',
        detail: data,
      });
    }

    // 返回结果
    console.log('[三米生图] 生成成功');
    res.json(data);

  } catch (err) {
    console.error('[三米生图] 服务器错误:', err);
    res.status(500).json({ error: '服务器内部错误', message: err.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 所有其他路由返回 index.html（SPA 支持）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║       三米生图 - 服务器已启动        ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  地址: http://localhost:${PORT}          ║`);
  console.log(`║  模型: ${ARK_MODEL.padEnd(30)}║`);
  console.log('║  API Key: ******（已隐藏）           ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
});
