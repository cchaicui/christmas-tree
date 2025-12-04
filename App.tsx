import React, { useState, Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Experience } from './components/Experience';
import { UIOverlay } from './components/UIOverlay';
// 已移除手势控制
import { TreeMode } from './types';
import { usePhotoSync } from './hooks/usePhotoSync';

// 3D 加载动画
const TreeLoader = () => (
  <div className="absolute inset-0 flex items-center justify-center z-10">
    <div className="text-center">
      <div className="relative w-20 h-20 mx-auto mb-4">
        {/* 旋转的圣诞树轮廓 */}
        <div className="absolute inset-0 border-4 border-[#D4AF37]/30 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-transparent border-t-[#D4AF37] rounded-full animate-spin"></div>
        <div className="absolute inset-2 border-4 border-transparent border-t-[#50C878] rounded-full animate-spin" style={{animationDirection: 'reverse', animationDuration: '1.5s'}}></div>
      </div>
      <p className="text-[#D4AF37] font-serif text-lg">正在装饰圣诞树...</p>
    </div>
  </div>
);

// Error Boundary
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Error loading 3D scene:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 text-[#D4AF37] font-serif p-8 text-center">
          <div className="max-w-lg">
            <h2 className="text-2xl mb-2">出问题了</h2>
            <p className="opacity-70 mb-4">资源加载失败。</p>
            <pre className="text-xs text-left bg-black/50 p-4 rounded overflow-auto max-h-40 mb-4">
              {this.state.error?.toString()}
            </pre>
            <button 
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 px-4 py-2 border border-[#D4AF37] hover:bg-[#D4AF37] hover:text-black transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [mode, setMode] = useState<TreeMode>(TreeMode.FORMED);
  
  // 照片同步
  const { photos, newPhoto, isConnected, uploadUrl, isUploading, clearNewPhoto } = usePhotoSync();
  
  // 调试：打印照片数量
  useEffect(() => {
    console.log('📷 照片数量:', photos.length, photos);
  }, [photos]);
  
  // 聚焦状态
  const [focusPhotoId, setFocusPhotoId] = useState<number | null>(null);

  // 当有新照片时，触发聚焦（稍微延迟确保数据已更新）
  useEffect(() => {
    if (newPhoto) {
      console.log('🎯 准备聚焦到新照片:', newPhoto.id);
      // 延迟 500ms 确保照片已经渲染到树上
      const timer = setTimeout(() => {
        console.log('🎯 开始聚焦到新照片:', newPhoto.id);
        setFocusPhotoId(newPhoto.id);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [newPhoto]);

  // 聚焦完成后清理
  const handleFocusComplete = () => {
    setFocusPhotoId(null);
    clearNewPhoto();
  };

  const toggleMode = () => {
    setMode((prev) => (prev === TreeMode.FORMED ? TreeMode.CHAOS : TreeMode.FORMED));
  };



  return (
    <div className="w-full h-screen relative bg-gradient-to-b from-black via-[#001a0d] to-[#0a2f1e]">
      <ErrorBoundary>
        <Suspense fallback={<TreeLoader />}>
          <Canvas
            dpr={[1, 2]}
            camera={{ position: [0, 4, 20], fov: 45 }}
            gl={{ antialias: false, stencil: false, alpha: false }}
            shadows
          >
            <Suspense fallback={null}>
              <Experience 
                mode={mode} 
                photos={photos}
                focusPhotoId={focusPhotoId}
                onFocusComplete={handleFocusComplete}
              />
            </Suspense>
          </Canvas>
        </Suspense>
      </ErrorBoundary>
      
      
      <UIOverlay 
        mode={mode} 
        onToggle={toggleMode}
        uploadUrl={uploadUrl}
        isConnected={isConnected}
      />
      
      
      {/* 聚焦提示 */}
      {focusPhotoId !== null && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-20">
          <div className="bg-black/70 backdrop-blur-md px-6 py-3 rounded-full border border-[#D4AF37] text-[#D4AF37] font-serif">
            ✨ 新照片已添加！30秒后自动返回
          </div>
        </div>
      )}
    </div>
  );
}
