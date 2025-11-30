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
  
  // 广播上传开始事件
  io.emit('upload-started', { timestamp: Date.now() });
  
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
    // 返回本地照片列表 - 使用文件名作为唯一 ID
    const files = fs.readdirSync(photosDir);
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp)$/i;
    const photos = files
      .filter(f => imageExtensions.test(f))
      .map((f) => {
        // 从文件名提取数字作为 ID，或使用哈希
        const match = f.match(/^(\d+)\./);
        const id = match ? parseInt(match[1]) : Math.abs(hashCode(f));
        return {
          id,
          url: `/photos/${encodeURIComponent(f)}`
        };
      });
    res.json(photos);
  }
});

// 简单的字符串哈希函数
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

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
  <title>上树照片到婚礼派对</title>
  <link href="https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0a1f0a 0%, #1a3a1a 50%, #0d2818 100%);
      min-height: 100vh;
      color: #D4AF37;
      overflow-x: hidden;
    }
    
    /* 雪花效果 */
    .snowflakes {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
      overflow: hidden;
    }
    .snowflake {
      position: absolute;
      top: -20px;
      color: #fff;
      font-size: 1rem;
      text-shadow: 0 0 5px rgba(255,255,255,0.5);
      animation: fall linear infinite;
      opacity: 0.8;
    }
    @keyframes fall {
      0% {
        transform: translateY(0) rotate(0deg);
        opacity: 0.8;
      }
      100% {
        transform: translateY(100vh) rotate(360deg);
        opacity: 0.3;
      }
    }
    .header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(10px);
      z-index: 100;
    }
    .header-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: #D4AF37;
    }
    .header-btn {
      background: none;
      border: 1px solid #D4AF37;
      color: #D4AF37;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.3s;
    }
    .header-btn:hover { background: rgba(212, 175, 55, 0.2); }
    .header-btn.active { background: #D4AF37; color: #0a1f0a; }
    
    /* 上传页面 */
    .upload-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 80px 20px 20px;
    }
    .upload-page.hidden { display: none; }
    .container { width: 100%; max-width: 400px; text-align: center; }
    h1 {
      font-size: 1.6rem;
      margin-bottom: 30px;
      background: linear-gradient(90deg, #D4AF37, #F5E6BF, #D4AF37);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .upload-area {
      border: 2px dashed #D4AF37;
      border-radius: 16px;
      padding: 50px 20px;
      margin-bottom: 20px;
      background: rgba(0, 0, 0, 0.3);
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .upload-area:hover { border-color: #F5E6BF; background: rgba(212, 175, 55, 0.1); }
    .upload-text { font-size: 1.1rem; color: #D4AF37; }
    #fileInput { display: none; }
    .preview-container { display: none; margin-bottom: 20px; }
    .preview-container.show { display: block; }
    .preview-image { max-width: 100%; max-height: 300px; border-radius: 12px; border: 3px solid #D4AF37; }
    .btn {
      width: 100%;
      padding: 16px 32px;
      font-size: 1rem;
      border: 2px solid #D4AF37;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .btn-primary {
      background: linear-gradient(135deg, #D4AF37 0%, #B8962E 100%);
      color: #0a1f0a;
      font-weight: 600;
    }
    .btn-primary:hover:not(:disabled) { background: linear-gradient(135deg, #F5E6BF 0%, #D4AF37 100%); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: transparent; color: #D4AF37; margin-top: 12px; display: none; }
    /* 按钮内置进度条 */
    .btn-primary.uploading {
      position: relative;
      overflow: hidden;
      pointer-events: none;
    }
    .btn-primary.uploading .btn-text {
      position: relative;
      z-index: 2;
    }
    .btn-primary .progress-bg {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      width: 0%;
      background: linear-gradient(135deg, #D4AF37 0%, #F5E6BF 100%);
      transition: width 0.3s ease;
      z-index: 1;
    }
    .btn-primary.uploading {
      background: rgba(212, 175, 55, 0.3);
    }
    .btn-primary.success {
      background: linear-gradient(135deg, #228B22 0%, #32CD32 100%) !important;
    }
    
    .progress-container { display: none; }
    .status { margin-top: 20px; padding: 16px; border-radius: 8px; display: none; }
    .status.show { display: block; }
    .status.success { background: rgba(34, 139, 34, 0.2); border: 1px solid #228B22; color: #90EE90; }
    .status.error { background: rgba(220, 53, 69, 0.2); border: 1px solid #dc3545; color: #ff6b6b; }
    
    /* 相册页面 */
    .gallery-page {
      display: none;
      padding: 80px 12px 20px;
      min-height: 100vh;
    }
    .gallery-page.show { display: block; }
    .gallery-grid {
      column-count: 2;
      column-gap: 12px;
    }
    .gallery-item {
      break-inside: avoid;
      margin-bottom: 12px;
      border-radius: 12px;
      overflow: hidden;
      background: rgba(0, 0, 0, 0.3);
      position: relative;
    }
    .gallery-item img {
      width: 100%;
      display: block;
      cursor: pointer;
      transition: transform 0.3s;
    }
    .gallery-item:hover img { transform: scale(1.02); }
    .download-btn {
      position: absolute;
      bottom: 8px;
      right: 8px;
      background: rgba(0, 0, 0, 0.7);
      color: #D4AF37;
      border: none;
      padding: 8px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.3s;
    }
    .gallery-item:hover .download-btn { opacity: 1; }
    .empty-gallery {
      text-align: center;
      padding: 60px 20px;
      color: #8B7355;
    }
    .empty-gallery p { font-size: 1.1rem; }
    
    /* 图片预览弹窗 */
    .lightbox {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.95);
      z-index: 200;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .lightbox.show { display: flex; }
    .lightbox img {
      max-width: 100%;
      max-height: 80vh;
      border-radius: 8px;
    }
    .lightbox-close {
      position: absolute;
      top: 20px;
      right: 20px;
      background: none;
      border: none;
      color: #fff;
      font-size: 2rem;
      cursor: pointer;
    }
    .lightbox-download {
      position: absolute;
      bottom: 30px;
      background: #D4AF37;
      color: #0a1f0a;
      border: none;
      padding: 12px 30px;
      border-radius: 25px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
    }
    .new-badge {
      position: absolute;
      top: 8px;
      right: 8px;
      background: #D4AF37;
      color: #0a1f0a;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.7rem;
      font-weight: bold;
      animation: pulse 1s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
  </style>
  <script src="/socket.io/socket.io.js"></script>
</head>
<body>
  <!-- 雪花容器 -->
  <div class="snowflakes" id="snowflakes"></div>
  
  <div class="header">
    <span class="header-title">大巍哥和大崔哥的婚礼派对</span>
    <button class="header-btn" id="toggleBtn">查看所有照片</button>
  </div>

  <div class="upload-page" id="uploadPage">
    <div class="container">
      <h1 style="font-family: 'Great Vibes', cursive; font-size: 2.5rem; background: linear-gradient(90deg, #D4AF37, #F5E6BF, #D4AF37); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 0.5rem;">Forever Begins Here</h1>
      <p style="color: #D4AF37; font-size: 1rem; margin-bottom: 1.5rem; letter-spacing: 2px;">分享美好瞬间</p>
      <div class="upload-area" id="uploadArea">
        <p class="upload-text">点击选择照片</p>
      </div>
      <input type="file" id="fileInput" accept="image/*">
      <div class="preview-container" id="previewContainer">
        <img id="previewImage" class="preview-image" alt="预览">
      </div>
      <button class="btn btn-primary" id="uploadBtn" disabled>
        <div class="progress-bg" id="progressBg"></div>
        <span class="btn-text" id="btnText">上树照片</span>
      </button>
      <button class="btn btn-secondary" id="resetBtn">重新选择</button>
      <div class="status" id="status"></div>
    </div>
  </div>

  <div class="gallery-page" id="galleryPage">
    <div class="gallery-grid" id="galleryGrid"></div>
    <div class="empty-gallery" id="emptyGallery" style="display: none;">
      <p>还没有照片，快来上传第一张吧</p>
    </div>
  </div>

  <div class="lightbox" id="lightbox">
    <button class="lightbox-close" id="lightboxClose">×</button>
    <img id="lightboxImg" src="" alt="预览">
    <button class="lightbox-download" id="lightboxDownload">保存到相册</button>
  </div>

  <script>
    // 创建雪花
    function createSnowflakes() {
      const container = document.getElementById('snowflakes');
      const snowflakeChars = ['❄', '❅', '❆', '✻', '✼', '❉'];
      
      for (let i = 0; i < 50; i++) {
        const snowflake = document.createElement('div');
        snowflake.className = 'snowflake';
        snowflake.innerHTML = snowflakeChars[Math.floor(Math.random() * snowflakeChars.length)];
        snowflake.style.left = Math.random() * 100 + '%';
        snowflake.style.fontSize = (Math.random() * 10 + 8) + 'px';
        snowflake.style.opacity = Math.random() * 0.6 + 0.4;
        snowflake.style.animationDuration = (Math.random() * 5 + 5) + 's';
        snowflake.style.animationDelay = (Math.random() * 5) + 's';
        container.appendChild(snowflake);
      }
    }
    createSnowflakes();
    
    // 页面切换
    const toggleBtn = document.getElementById('toggleBtn');
    const uploadPage = document.getElementById('uploadPage');
    const galleryPage = document.getElementById('galleryPage');
    let isGalleryView = false;

    toggleBtn.addEventListener('click', () => {
      isGalleryView = !isGalleryView;
      if (isGalleryView) {
        uploadPage.classList.add('hidden');
        galleryPage.classList.add('show');
        toggleBtn.textContent = '上树照片';
        toggleBtn.classList.add('active');
        loadGallery();
      } else {
        uploadPage.classList.remove('hidden');
        galleryPage.classList.remove('show');
        toggleBtn.textContent = '查看所有照片';
        toggleBtn.classList.remove('active');
      }
    });

    // 加载相册
    async function loadGallery() {
      try {
        const res = await fetch('/api/photos');
        const photos = await res.json();
        const grid = document.getElementById('galleryGrid');
        const empty = document.getElementById('emptyGallery');
        
        if (photos.length === 0) {
          grid.innerHTML = '';
          empty.style.display = 'block';
          return;
        }
        
        empty.style.display = 'none';
        grid.innerHTML = photos.map(p => \`
          <div class="gallery-item">
            <img src="\${p.url}" alt="照片" onclick="openLightbox('\${p.url}')">
            <button class="download-btn" onclick="downloadPhoto('\${p.url}')">保存</button>
          </div>
        \`).join('');
      } catch (e) {
        console.error('加载相册失败:', e);
      }
    }

    // 图片预览
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    let currentPhotoUrl = '';

    function openLightbox(url) {
      currentPhotoUrl = url;
      lightboxImg.src = url;
      lightbox.classList.add('show');
    }

    document.getElementById('lightboxClose').addEventListener('click', () => {
      lightbox.classList.remove('show');
    });

    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) lightbox.classList.remove('show');
    });

    // 下载照片
    document.getElementById('lightboxDownload').addEventListener('click', () => {
      downloadPhoto(currentPhotoUrl);
    });

    async function downloadPhoto(url) {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'christmas-tree-photo.jpg';
        link.click();
        URL.revokeObjectURL(link.href);
      } catch (e) {
        // iOS Safari 不支持 download，改用新窗口打开
        window.open(url, '_blank');
      }
    }

    // 上传功能
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

    const progressBg = document.getElementById('progressBg');
    const btnText = document.getElementById('btnText');
    
    uploadBtn.addEventListener('click', async () => {
      if (!selectedFile) return;
      uploadBtn.disabled = true;
      uploadBtn.classList.add('uploading');
      progressBg.style.width = '0%';
      btnText.textContent = '上传中 0%';
      
      const formData = new FormData();
      formData.append('photo', selectedFile);
      try {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressBg.style.width = percent + '%';
            btnText.textContent = '上传中 ' + percent + '%';
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            progressBg.style.width = '100%';
            btnText.textContent = '✓ 上传成功';
            uploadBtn.classList.remove('uploading');
            uploadBtn.classList.add('success');
            showStatus('照片已添加到婚礼派对', 'success');
            setTimeout(() => {
              uploadBtn.classList.remove('success');
              btnText.textContent = '上树照片';
              progressBg.style.width = '0%';
              resetBtn.click();
            }, 2000);
          } else { throw new Error('上传失败'); }
        });
        xhr.addEventListener('error', () => {
          showStatus('上传失败，请检查网络连接', 'error');
          uploadBtn.disabled = false;
          uploadBtn.classList.remove('uploading');
          btnText.textContent = '上树照片';
          progressBg.style.width = '0%';
        });
        xhr.open('POST', '/api/upload');
        xhr.send(formData);
      } catch (error) {
        showStatus('上传失败: ' + error.message, 'error');
        uploadBtn.disabled = false;
        uploadBtn.classList.remove('uploading');
        btnText.textContent = '上树照片';
        progressBg.style.width = '0%';
      }
    });

    function showStatus(message, type) {
      status.textContent = message;
      status.className = 'status show ' + type;
      // 成功提示3秒后自动消失
      if (type === 'success') {
        setTimeout(() => {
          status.classList.remove('show');
        }, 3000);
      }
    }

    // WebSocket 实时更新相册
    const socket = io();
    socket.on('connect', () => {
      console.log('🔗 已连接到服务器');
    });
    
    socket.on('new-photo', (photo) => {
      console.log('📸 收到新照片:', photo);
      // 在相册中添加新照片
      const grid = document.getElementById('galleryGrid');
      const empty = document.getElementById('emptyGallery');
      empty.style.display = 'none';
      
      const newItem = document.createElement('div');
      newItem.className = 'gallery-item';
      newItem.innerHTML = \`
        <span class="new-badge">NEW</span>
        <img src="\${photo.url}" alt="照片" onclick="openLightbox('\${photo.url}')">
        <button class="download-btn" onclick="downloadPhoto('\${photo.url}')">保存</button>
      \`;
      grid.insertBefore(newItem, grid.firstChild);
      
      // 3秒后移除 NEW 标签
      setTimeout(() => {
        const badge = newItem.querySelector('.new-badge');
        if (badge) badge.remove();
      }, 3000);
    });
  </script>
</body>
</html>`;
}

const localIP = getLocalIP();

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('\\n💒 婚礼派对照片服务器已启动!\\n');
  if (isProduction) {
    console.log(`🌐 生产环境模式`);
    console.log(`📡 端口: ${PORT}`);
  } else {
    console.log(`📱 扫码上传地址: http://${localIP}:${PORT}/upload.html`);
    console.log(`🖥️  本地访问: http://localhost:${PORT}/upload.html\\n`);
  }
});
