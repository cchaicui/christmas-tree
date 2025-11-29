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

  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col justify-between p-8 z-10">
      
      {/* Header */}
      <header className="flex flex-col items-center">
        <h1 className="text-4xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#D4AF37] via-[#F5E6BF] to-[#D4AF37] font-serif drop-shadow-lg tracking-wider text-center">
          Merry Christmas
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
              <span className="text-sm font-serif tracking-wider flex items-center gap-2">
                📱 扫码上传照片
                {isConnected && (
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="已连接"></span>
                )}
              </span>
              <span className="text-lg">{showQR ? '−' : '+'}</span>
            </button>

            {/* QR Code */}
            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${showQR ? 'max-h-[200px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="bg-white p-3 rounded-lg">
                <QRCodeSVG 
                  value={uploadUrl}
                  size={140}
                  level="M"
                  includeMargin={false}
                  fgColor="#0a1f0a"
                  bgColor="#ffffff"
                />
              </div>
              <p className="text-[10px] text-[#8B7355] mt-2 text-center font-mono break-all">
                {uploadUrl.replace('http://', '')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Decorative Corners */}
      <div className="absolute top-8 left-8 w-16 h-16 border-t-2 border-l-2 border-[#D4AF37] opacity-50"></div>
      <div className="absolute top-8 right-8 w-16 h-16 border-t-2 border-r-2 border-[#D4AF37] opacity-50"></div>
      <div className="absolute bottom-8 left-8 w-16 h-16 border-b-2 border-l-2 border-[#D4AF37] opacity-50"></div>
      <div className="absolute bottom-8 right-8 w-16 h-16 border-b-2 border-r-2 border-[#D4AF37] opacity-50"></div>
    </div>
  );
};
