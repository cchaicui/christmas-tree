import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface Photo {
  id: number;
  url: string;
  timestamp?: number;
  isNew?: boolean;
}

interface UsePhotoSyncReturn {
  photos: Photo[];
  newPhoto: Photo | null;
  isConnected: boolean;
  serverUrl: string;
  uploadUrl: string;
  isUploading: boolean;
  clearNewPhoto: () => void;
}

// 获取 API 服务器地址
function getServerUrl(): string {
  // 优先使用环境变量
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // 开发环境：使用同一主机的 3011 端口
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:3011`;
  }
  
  return 'http://localhost:3011';
}

export function usePhotoSync(): UsePhotoSyncReturn {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [newPhoto, setNewPhoto] = useState<Photo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [uploadUrl, setUploadUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  
  const serverUrl = getServerUrl();

  // 加载服务器信息（获取正确的上传地址）
  const loadServerInfo = useCallback(async () => {
    try {
      const response = await fetch(`${serverUrl}/api/server-info`);
      if (response.ok) {
        const data = await response.json();
        setUploadUrl(data.uploadUrl);
      }
    } catch (error) {
      console.warn('无法获取服务器信息:', error);
      setUploadUrl(`${serverUrl}/upload.html`);
    }
  }, [serverUrl]);

  // 加载已有照片
  const loadExistingPhotos = useCallback(async () => {
    try {
      const response = await fetch(`${serverUrl}/api/photos`);
      if (response.ok) {
        const data = await response.json();
        // 处理照片 URL（如果是相对路径，添加服务器前缀）
        const processedPhotos = data.map((p: Photo) => ({
          ...p,
          url: p.url.startsWith('http') ? p.url : `${serverUrl}${p.url}`,
          isNew: false
        }));
        setPhotos(processedPhotos);
      }
    } catch (error) {
      console.warn('无法加载已有照片:', error);
    }
  }, [serverUrl]);

  // 清除新照片状态
  const clearNewPhoto = useCallback(() => {
    setNewPhoto(null);
  }, []);

  useEffect(() => {
    loadServerInfo();
    loadExistingPhotos();

    // 连接 WebSocket
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔗 已连接到照片服务器');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('❌ 与照片服务器断开连接');
      setIsConnected(false);
    });

    socket.on('upload-started', () => {
      console.log('⏳ 有人正在上传照片...');
      setIsUploading(true);
    });

    socket.on('new-photo', (photo: Photo) => {
      console.log('📸 收到新照片:', photo);
      setIsUploading(false);
      
      // 处理照片 URL
      const processedPhoto = {
        ...photo,
        url: photo.url.startsWith('http') ? photo.url : `${serverUrl}${photo.url}`,
        isNew: true
      };
      
      setPhotos(prev => [...prev, processedPhoto]);
      setNewPhoto(processedPhoto);
    });

    socket.on('connect_error', (error) => {
      console.warn('连接错误:', error.message);
    });

    return () => {
      socket.disconnect();
    };
  }, [serverUrl, loadExistingPhotos, loadServerInfo]);

  return {
    photos,
    newPhoto,
    isConnected,
    serverUrl,
    uploadUrl,
    isUploading,
    clearNewPhoto
  };
}
