import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { TreeMode } from '../types';

interface UIOverlayProps {
  mode: TreeMode;
  onToggle: () => void;
  uploadUrl?: string;
  isConnected?: boolean;
}

export const UIOverlay: React.FC<UIOverlayProps> = ({ 
  mode, 
  onToggle, 
  uploadUrl = '',
  isConnected = false 
}) => {
  const isFormed = mode === TreeMode.FORMED;
  const [showQR, setShowQR] = useState(true);

  // 加载 Google Fonts 复古手写体
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col justify-between p-8 z-10">
      
      {/* Header with gradient overlay */}
      <header className="relative flex flex-col items-center">
        {/* 黑色渐变遮罩 */}
        <div 
          className="absolute -top-8 left-1/2 -translate-x-1/2 w-[150%] h-40 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 40%, rgba(0,0,0,0) 100%)',
          }}
        />
        <h1 
          className="relative z-10 text-5xl md:text-7xl text-transparent bg-clip-text bg-gradient-to-r from-[#D4AF37] via-[#F5E6BF] to-[#D4AF37] drop-shadow-lg tracking-wide text-center"
          style={{ fontFamily: "'Great Vibes', cursive" }}
        >
          Forever Begins Here
        </h1>
      </header>

      {/* QR Code Panel - 左下角 */}
      {uploadUrl && (
        <div className="absolute bottom-8 left-8 pointer-events-auto">
          <div 
            className={`
              bg-black/70 backdrop-blur-md rounded-xl border-2 border-[#D4AF37] 
              overflow-hidden transition-all duration-500 ease-in-out
              ${showQR ? 'p-4' : 'p-2'}
              shadow-[0_0_30px_rgba(212,175,55,0.2)]
            `}
          >
            {/* 折叠/展开按钮 */}
            <button
              onClick={() => setShowQR(!showQR)}
              className="w-full flex items-center justify-between text-[#D4AF37] hover:text-[#F5E6BF] transition-colors mb-2"
            >
              <span className="text-sm font-bold tracking-wider flex items-center gap-2" style={{ fontFamily: '"PingFang SC", "Heiti SC", "Microsoft YaHei", sans-serif' }}>
                📱 扫码上树照片
                {isConnected && (
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="已连接"></span>
                )}
              </span>
              <span className="text-lg">{showQR ? '−' : '+'}</span>
            </button>

            {/* QR Code */}
            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${showQR ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="bg-white p-3 rounded-lg inline-block">
                <QRCodeSVG 
                  value={uploadUrl}
                  size={210}
                  level="M"
                  includeMargin={false}
                  fgColor="#0a1f0a"
                  bgColor="#ffffff"
                />
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
