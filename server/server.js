import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 环境变量
const PORT = process.env.PORT || 3011;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
const CLOUDINARY_URL = process.env.CLOUDINARY_URL;
const isProduction = process.env.NODE_ENV === 'production';

// Cloudinary 配置（如果配置了的话）
let cloudinary = null;
if (process.env.CLOUDINARY_CLOUD_NAME) {
  const { v2: cloudinaryV2 } = await import('cloudinary');
  cloudinaryV2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  cloudinary = cloudinaryV2;
  console.log('☁️ Cloudinary 已配置');
}

// 内存存储（用于 Cloudinary 上传）
const memoryStorage = multer.memoryStorage();

// 本地存储（用于开发环境）
const photosDir = path.join(__dirname, '../public/photos');
if (!fs.existsSync(photosDir)) {
  fs.mkdirSync(photosDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, photosDir);
  },
  filename: (req, file, cb) => {
    const files = fs.readdirSync(photosDir);
    const jpgFiles = files.filter(f => /^\d+\.jpg$/i.test(f));
    const numbers = jpgFiles.map(f => parseInt(f.match(/^(\d+)/)[1]));
    const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
    const newNum = maxNum + 1;
    cb(null, `${newNum}.jpg`);
  }
});

// 根据环境选择存储方式
const upload = multer({ 
  storage: cloudinary ? memoryStorage : diskStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'));
    }
  }
});

// CORS 配置
app.use(cors({
  origin: FRONTEND_URL === '*' ? '*' : FRONTEND_URL.split(','),
  methods: ['GET', 'POST'],
  credentials: true
}));

// JSON 解析
app.use(express.json());

// 静态文件服务（本地开发）
if (!isProduction) {
  app.use(express.static(path.join(__dirname, '../public')));
  app.use('/photos', express.static(photosDir));
}

// WebSocket 服务器
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: FRONTEND_URL === '*' ? '*' : FRONTEND_URL.split(','),
    methods: ['GET', 'POST']
  }
});

// 照片列表（云端存储用）
let cloudPhotos = [];
let photoCounter = 0;

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// 上传接口
app.post('/api/upload', upload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '没有收到文件' });
  }
  
  try {
    let photoUrl, photoId;
    
    if (cloudinary) {
      // 上传到 Cloudinary
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { 
            folder: 'christmas-tree',
            resource_type: 'image'
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(req.file.buffer);
      });
      
      photoId = ++photoCounter;
      photoUrl = result.secure_url;
      
      // 保存到内存列表
      cloudPhotos.push({ id: photoId, url: photoUrl, timestamp: Date.now() });
      
      console.log(`📸 新照片上传到云端: ${photoId}`);
    } else {
      // 本地存储
      photoUrl = `/photos/${req.file.filename}`;
      photoId = parseInt(req.file.filename.match(/^(\d+)/)[1]);
      console.log(`📸 新照片上传到本地: ${req.file.filename}`);
    }
    
    // 通过 WebSocket 广播新照片
    io.emit('new-photo', {
      id: photoId,
      url: photoUrl,
      timestamp: Date.now()
    });
    
    res.json({ 
      success: true, 
      url: photoUrl,
      id: photoId
    });
  } catch (error) {
    console.error('上传失败:', error);
    res.status(500).json({ error: '上传失败' });
  }
});

// 获取服务器信息
app.get('/api/server-info', (req, res) => {
  if (isProduction) {
    // 生产环境：返回当前请求的 host
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    res.json({
      uploadUrl: `${protocol}://${host}/upload.html`,
      serverUrl: `${protocol}://${host}`
    });
  } else {
    // 开发环境：返回本地 IP
    const localIP = getLocalIP();
    res.json({
      uploadUrl: `http://${localIP}:${PORT}/upload.html`,
      serverUrl: `http://${localIP}:${PORT}`
    });
  }
});

// 获取所有照片列表
app.get('/api/photos', (req, res) => {
  if (cloudinary) {
    // 返回云端照片列表
    res.json(cloudPhotos);
  } else {
    // 返回本地照片列表
    const files = fs.readdirSync(photosDir);
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp)$/i;
    const photos = files
      .filter(f => imageExtensions.test(f))
      .map((f, index) => ({
        id: index + 1,
        url: `/photos/${encodeURIComponent(f)}`
      }));
    res.json(photos);
  }
});

// 生产环境：提供上传页面
app.get('/upload.html', (req, res) => {
  res.send(getUploadPageHTML());
});

// WebSocket 连接
io.on('connection', (socket) => {
  console.log('🔗 客户端已连接:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('❌ 客户端断开:', socket.id);
  });
});

// 获取本机 IP 地址
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// 上传页面 HTML（内嵌，避免静态文件问题）
function getUploadPageHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>上传照片到圣诞树</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Cinzel', 'Georgia', serif;
      background: linear-gradient(135deg, #0a1f0a 0%, #1a3a1a 50%, #0d2818 100%);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: #D4AF37;
    }
    .container { width: 100%; max-width: 400px; text-align: center; }
    h1 {
      font-size: 1.8rem;
      margin-bottom: 8px;
      background: linear-gradient(90deg, #D4AF37, #F5E6BF, #D4AF37);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle { font-size: 0.9rem; color: #8B7355; margin-bottom: 30px; letter-spacing: 2px; }
    .upload-area {
      border: 2px dashed #D4AF37;
      border-radius: 16px;
      padding: 40px 20px;
      margin-bottom: 20px;
      background: rgba(0, 0, 0, 0.3);
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .upload-area:hover { border-color: #F5E6BF; background: rgba(212, 175, 55, 0.1); }
    .upload-icon { font-size: 4rem; margin-bottom: 16px; }
    .upload-text { font-size: 1.1rem; color: #D4AF37; margin-bottom: 8px; }
    .upload-hint { font-size: 0.8rem; color: #8B7355; }
    #fileInput { display: none; }
    .preview-container { display: none; margin-bottom: 20px; }
    .preview-container.show { display: block; }
    .preview-image { max-width: 100%; max-height: 300px; border-radius: 12px; border: 3px solid #D4AF37; }
    .btn {
      width: 100%;
      padding: 16px 32px;
      font-size: 1.1rem;
      border: 2px solid #D4AF37;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s ease;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .btn-primary {
      background: linear-gradient(135deg, #D4AF37 0%, #B8962E 100%);
      color: #0a1f0a;
    }
    .btn-primary:hover:not(:disabled) { background: linear-gradient(135deg, #F5E6BF 0%, #D4AF37 100%); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: transparent; color: #D4AF37; margin-top: 12px; display: none; }
    .progress-container { display: none; margin: 20px 0; }
    .progress-container.show { display: block; }
    .progress-bar { height: 8px; background: rgba(212, 175, 55, 0.2); border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #D4AF37, #F5E6BF); width: 0%; transition: width 0.3s; }
    .progress-text { margin-top: 8px; font-size: 0.9rem; color: #D4AF37; }
    .status { margin-top: 20px; padding: 16px; border-radius: 8px; display: none; }
    .status.show { display: block; }
    .status.success { background: rgba(34, 139, 34, 0.2); border: 1px solid #228B22; color: #90EE90; }
    .status.error { background: rgba(220, 53, 69, 0.2); border: 1px solid #dc3545; color: #ff6b6b; }
  </style>
</head>
<body>
  <div class="container">
    <h1>分享美好瞬间</h1>
    <div class="upload-area" id="uploadArea">
      <p class="upload-text">点击选择照片</p>
    </div>
    <input type="file" id="fileInput" accept="image/*">
    <div class="preview-container" id="previewContainer">
      <img id="previewImage" class="preview-image" alt="预览">
    </div>
    <div class="progress-container" id="progressContainer">
      <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
      <p class="progress-text" id="progressText">上传中...</p>
    </div>
    <button class="btn btn-primary" id="uploadBtn" disabled>上传到圣诞树</button>
    <button class="btn btn-secondary" id="resetBtn">重新选择</button>
    <div class="status" id="status"></div>
  </div>
  <script>
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const previewContainer = document.getElementById('previewContainer');
    const previewImage = document.getElementById('previewImage');
    const uploadBtn = document.getElementById('uploadBtn');
    const resetBtn = document.getElementById('resetBtn');
    const progressContainer = document.getElementById('progressContainer');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const status = document.getElementById('status');
    let selectedFile = null;

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = '#F5E6BF'; });
    uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = '#D4AF37'; });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = '#D4AF37';
      if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFile(e.target.files[0]); });

    function handleFile(file) {
      if (!file.type.startsWith('image/')) { showStatus('请选择图片文件', 'error'); return; }
      selectedFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewContainer.classList.add('show');
        uploadArea.style.display = 'none';
        uploadBtn.disabled = false;
        resetBtn.style.display = 'block';
        status.classList.remove('show');
      };
      reader.readAsDataURL(file);
    }

    resetBtn.addEventListener('click', () => {
      selectedFile = null;
      fileInput.value = '';
      previewContainer.classList.remove('show');
      uploadArea.style.display = 'block';
      uploadBtn.disabled = true;
      resetBtn.style.display = 'none';
      progressContainer.classList.remove('show');
      status.classList.remove('show');
    });

    uploadBtn.addEventListener('click', async () => {
      if (!selectedFile) return;
      uploadBtn.disabled = true;
      progressContainer.classList.add('show');
      progressFill.style.width = '0%';
      const formData = new FormData();
      formData.append('photo', selectedFile);
      try {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressFill.style.width = percent + '%';
            progressText.textContent = '上传中... ' + percent + '%';
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            progressFill.style.width = '100%';
            progressText.textContent = '上传成功!';
            showStatus('🎉 照片已添加到圣诞树！', 'success');
            setTimeout(() => resetBtn.click(), 3000);
          } else { throw new Error('上传失败'); }
        });
        xhr.addEventListener('error', () => {
          showStatus('上传失败，请检查网络连接', 'error');
          uploadBtn.disabled = false;
          progressContainer.classList.remove('show');
        });
        xhr.open('POST', '/api/upload');
        xhr.send(formData);
      } catch (error) {
        showStatus('上传失败: ' + error.message, 'error');
        uploadBtn.disabled = false;
        progressContainer.classList.remove('show');
      }
    });

    function showStatus(message, type) {
      status.textContent = message;
      status.className = 'status show ' + type;
    }
  </script>
</body>
</html>`;
}

const localIP = getLocalIP();

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('\\n🎄 圣诞树照片服务器已启动!\\n');
  if (isProduction) {
    console.log(`🌐 生产环境模式`);
    console.log(`📡 端口: ${PORT}`);
  } else {
    console.log(`📱 扫码上传地址: http://${localIP}:${PORT}/upload.html`);
    console.log(`🖥️  本地访问: http://localhost:${PORT}/upload.html\\n`);
  }
});
