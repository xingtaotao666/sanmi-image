/**
 * Vercel Serverless Function - 三米生图 API 代理
 * 部署到 Vercel 后自动生效，前端调用 /api/generate
 */

export default async function handler(req, res) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, size, image, watermark } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: '缺少 prompt 参数' });
    }

    const reqBody = {
      model: process.env.ARK_MODEL || 'doubao-seedream-5-0-pro-260628',
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

    console.log(`[三米生图] ${image ? '图生图' : '文生图'}: "${prompt.slice(0, 50)}..."`);

    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ARK_API_KEY}`,
      },
      body: JSON.stringify(reqBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[三米生图] API错误:', response.status, JSON.stringify(data));
      return res.status(response.status).json({ error: 'API调用失败', detail: data });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error('[三米生图] 服务器错误:', err);
    res.status(500).json({ error: '服务器内部错误', message: err.message });
  }
}
