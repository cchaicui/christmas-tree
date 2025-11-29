import React, { useMemo, useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { TreeMode } from '../types';
import { Photo } from '../hooks/usePhotoSync';

interface PolaroidsProps {
  mode: TreeMode;
  photos: Photo[];
  highlightPhotoId?: number | null;
  isFocusing?: boolean;
  expandAmount?: number; // 控制所有照片散开程度
}

interface PhotoData {
  id: number;
  url: string;
  chaosPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  speed: number;
  isNew?: boolean;
}

export interface PolaroidsRef {
  getPhotoPosition: (photoId: number) => THREE.Vector3 | null;
}

// 计算照片在树上的目标位置 - 紧贴球的外侧
function calculateTargetPosition(index: number, total: number): THREE.Vector3 {
  const height = 9;
  const maxRadius = 4.8; // 稍微靠近树
  
  // 使用螺旋分布，确保所有照片都能均匀分布
  const yNorm = 0.12 + (index / Math.max(total, 1)) * 0.78;
  const y = yNorm * height;
  // 半径随高度递减（树是锥形的）
  const r = maxRadius * (1 - yNorm * 0.6) + 0.8;
  const theta = index * 2.39996; // Golden angle
  
  return new THREE.Vector3(
    r * Math.cos(theta),
    y,
    r * Math.sin(theta)
  );
}

// 根据照片数量计算卡片缩放比例
function calculateScale(totalPhotos: number): number {
  if (totalPhotos <= 5) return 1.5;
  if (totalPhotos <= 10) return 1.3;
  if (totalPhotos <= 15) return 1.1;
  if (totalPhotos <= 20) return 0.95;
  if (totalPhotos <= 30) return 0.8;
  if (totalPhotos <= 50) return 0.65;
  return 0.5; // 50+ 照片
}

// 计算混沌模式下的位置
function calculateChaosPosition(index: number, total: number): THREE.Vector3 {
  const relativeY = 5;
  const relativeZ = 20;
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const distance = 3 + Math.random() * 4;
  const heightSpread = (Math.random() - 0.5) * 8;
  
  return new THREE.Vector3(
    distance * Math.cos(angle) * 1.2,
    relativeY + heightSpread,
    relativeZ - 4 + distance * Math.sin(angle) * 0.5
  );
}

interface PolaroidItemProps {
  data: PhotoData;
  mode: TreeMode;
  isHighlighted: boolean;
  totalPhotos: number;
  groupRef?: React.RefObject<THREE.Group>;
  isFocusing?: boolean; // 是否正在聚焦状态
  expandAmount?: number; // 控制散开程度
}

const PolaroidItem: React.FC<PolaroidItemProps> = ({ data, mode, isHighlighted, totalPhotos, groupRef: externalRef, isFocusing = false, expandAmount = 0 }) => {
  const internalRef = useRef<THREE.Group>(null);
  const groupRef = externalRef || internalRef;
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const glowRef = useRef<THREE.Mesh>(null);
  const initialized = useRef(false);
  
  // 跟踪是否已经开始聚焦动画
  const hasStartedFocus = useRef(false);
  
  // 设置初始位置
  useEffect(() => {
    if (groupRef.current && !initialized.current) {
      groupRef.current.position.copy(data.targetPos);
      initialized.current = true;
    }
  }, [data.targetPos]);
  
  // 当被选中聚焦时，立即移到底部开始动画
  useEffect(() => {
    if (isHighlighted && isFocusing && !hasStartedFocus.current) {
      hasStartedFocus.current = true;
      if (groupRef.current) {
        // 从屏幕下方开始：世界 y=-8 → 本地 y = -8 + 6 = -2
        // z=12 在相机前面
        groupRef.current.position.set(0, -2, 12);
        console.log('🎯 照片开始从底部弹出', data.id);
      }
    }
    // 聚焦结束后重置
    if (!isFocusing) {
      hasStartedFocus.current = false;
    }
  }, [isHighlighted, isFocusing, data.id]);

  // 图片宽高比
  const [aspectRatio, setAspectRatio] = useState(1);
  
  // 加载纹理
  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError(false);
    
    const loader = new THREE.TextureLoader();
    loader.load(
      data.url,
      (loadedTex) => {
        if (!mounted) return;
        try {
          loadedTex.colorSpace = THREE.SRGBColorSpace;
          setTexture(loadedTex);
          setError(false);
          // 获取图片原始宽高比
          if (loadedTex.image) {
            const ratio = loadedTex.image.width / loadedTex.image.height;
            setAspectRatio(ratio);
          }
        } catch (e) {
          console.warn(`纹理处理失败: ${data.url}`, e);
          setError(true);
        }
        setIsLoading(false);
      },
      undefined,
      (err) => {
        if (!mounted) return;
        console.warn(`图片加载失败: ${data.url}`, err);
        setError(true);
        setIsLoading(false);
      }
    );
    
    return () => { mounted = false; };
  }, [data.url]);
  
  const swayOffset = useMemo(() => Math.random() * 100, []);

  // 聚焦时照片展示的位置 - 相机在 (0, 2, 19)，照片在 (0, 2, 12) 世界坐标
  // treeGroup 在 (0, -6, 0)，本地坐标 = (0, 2+6, 12) = (0, 8, 12)
  const focusDisplayPos = useMemo(() => new THREE.Vector3(0, 8, 12), []);
  
  // 每张照片散开时的随机位置
  const scatterPos = useMemo(() => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 15 + Math.random() * 15;
    const height = Math.random() * 20 - 5;
    return new THREE.Vector3(
      Math.cos(angle) * radius,
      height,
      Math.sin(angle) * radius
    );
  }, []);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const isFormed = mode === TreeMode.FORMED;
    const time = state.clock.elapsedTime;
    
    // 决定目标位置
    let targetPos: THREE.Vector3;
    
    // 新上传的照片 && 正在聚焦
    const shouldFocus = isHighlighted && isFocusing;
    
    if (shouldFocus) {
      // 被选中的照片：移到屏幕中央（世界坐标 z=15，在相机前面）
      targetPos = focusDisplayPos;
    } else if (isFocusing && !isHighlighted) {
      // 聚焦期间，其他照片散开
      targetPos = scatterPos;
    } else if (isFormed) {
      targetPos = data.targetPos;
    } else {
      targetPos = data.chaosPos;
    }
    
    // 聚焦的照片弹出时速度更快
    const step = (isHighlighted && isFocusing) ? delta * 6 : delta * data.speed * 2;
    
    groupRef.current.position.lerp(targetPos, step);

    if (isHighlighted && isFocusing) {
        // 聚焦时完全平面，正对相机（无透视）
        // 目标旋转为 (0, 0, 0)，即照片平面正对 z 轴
        const targetQuat = new THREE.Quaternion();
        targetQuat.setFromEuler(new THREE.Euler(0, 0, 0));
        groupRef.current.quaternion.slerp(targetQuat, delta * 5);
    } else if (expandAmount > 0.1 && !isHighlighted) {
        // 散开时随机旋转
        groupRef.current.rotation.x += delta * 0.5;
        groupRef.current.rotation.y += delta * 0.3;
    } else if (isFormed) {
        const dummy = new THREE.Object3D();
        dummy.position.copy(groupRef.current.position);
        dummy.lookAt(0, groupRef.current.position.y, 0); 
      dummy.rotateY(Math.PI);
        
        groupRef.current.quaternion.slerp(dummy.quaternion, step);
        
        const swayAngle = Math.sin(time * 2.0 + swayOffset) * 0.08;
        const tiltAngle = Math.cos(time * 1.5 + swayOffset) * 0.05;
        
        const currentRot = new THREE.Euler().setFromQuaternion(groupRef.current.quaternion);
        groupRef.current.rotation.z = currentRot.z + swayAngle * 0.05; 
        groupRef.current.rotation.x = currentRot.x + tiltAngle * 0.05;
    } else {
        const cameraPos = new THREE.Vector3(0, 9, 20);
        const dummy = new THREE.Object3D();
        dummy.position.copy(groupRef.current.position);
        dummy.lookAt(cameraPos);
        
        groupRef.current.quaternion.slerp(dummy.quaternion, delta * 3);
        
        const wobbleX = Math.sin(time * 1.5 + swayOffset) * 0.03;
        const wobbleZ = Math.cos(time * 1.2 + swayOffset) * 0.03;
        
        const currentRot = new THREE.Euler().setFromQuaternion(groupRef.current.quaternion);
        groupRef.current.rotation.x = currentRot.x + wobbleX;
        groupRef.current.rotation.z = currentRot.z + wobbleZ;
    }

    // 高亮动画
    if (glowRef.current) {
      const glowIntensity = isHighlighted 
        ? 0.5 + Math.sin(time * 4) * 0.3 
        : 0;
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = glowIntensity;
    }
  });

  // 根据照片总数自适应缩放，聚焦时大幅放大
  const baseScale = calculateScale(totalPhotos);
  const scale = (isHighlighted && isFocusing) ? 5 : baseScale; // 聚焦时固定大小

  // 根据宽高比计算照片和卡片尺寸
  const maxPhotoSize = 1.2;
  const photoWidth = aspectRatio >= 1 ? maxPhotoSize : maxPhotoSize * aspectRatio;
  const photoHeight = aspectRatio >= 1 ? maxPhotoSize / aspectRatio : maxPhotoSize;
  
  // 卡片尺寸 = 照片尺寸 + 边距
  const cardPadding = 0.2;
  const cardWidth = photoWidth + cardPadding;
  const cardHeight = photoHeight + cardPadding + 0.35; // 底部多留空间给标签
  
  // 夹子和标签位置
  const clipY = photoHeight / 2 + 0.15;
  const labelY = -photoHeight / 2 - 0.15;

  return (
    <group ref={groupRef} scale={[scale, scale, scale]}>
      <group position={[0, 0, 0]}>
        {/* 高亮光晕 */}
        {isHighlighted && (
          <mesh ref={glowRef} position={[0, 0, -0.05]}>
            <planeGeometry args={[cardWidth + 0.4, cardHeight + 0.4]} />
            <meshBasicMaterial color="#D4AF37" transparent opacity={0.5} />
          </mesh>
        )}

        {/* 浅绿色底板 */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[cardWidth, cardHeight, 0.03]} />
          <meshStandardMaterial 
            color="#3CB371"
            metalness={0.3}
            roughness={0.4}
            emissive="#2E8B57"
            emissiveIntensity={0.15}
          />
        </mesh>

        {/* 照片区域 - 保持原始宽高比 */}
        <mesh position={[0, 0.1, 0.025]}>
          <planeGeometry args={[photoWidth, photoHeight]} />
          {texture && !error ? (
            <meshBasicMaterial map={texture} />
          ) : (
            <meshStandardMaterial 
              color={error ? "#ff4444" : isLoading ? "#666666" : "#aaaaaa"} 
              emissive={error ? "#ff0000" : "#333333"}
              emissiveIntensity={0.2}
            />
          )}
        </mesh>
        
        {/* 金色夹子 - 保持金色作为点缀 */}
        <mesh position={[0, clipY, 0.03]}>
          <boxGeometry args={[0.2, 0.1, 0.08]} />
          <meshStandardMaterial 
            color="#FFD700" 
            metalness={1} 
            roughness={0.15}
            emissive="#FFD700"
            emissiveIntensity={0.3}
          />
        </mesh>

        {/* 标签 - 深绿色文字 */}
        <Text
          position={[0, labelY, 0.03]}
          fontSize={0.12}
          color="#1a472a"
          anchorX="center"
          anchorY="middle"
        >
          {error ? "⚠️" : `#${data.id}`}
        </Text>
      </group>
    </group>
  );
};

export const Polaroids = forwardRef<PolaroidsRef, PolaroidsProps>(({ mode, photos, highlightPhotoId, isFocusing = false, expandAmount = 0 }, ref) => {
  const photoRefs = useRef<Map<number, THREE.Group>>(new Map());

  // 计算所有照片数据
  const photoDataList = useMemo(() => {
    console.log('🖼️ Polaroids 收到照片:', photos.length);
    return photos.map((photo, index) => {
      // 使用相对路径，让 Vite 代理处理
      const url = photo.url.startsWith('http') ? photo.url : `http://localhost:3011${photo.url}`;
      console.log(`  照片 ${index + 1}: ${url}`);
      return {
        id: photo.id,
        url,
        chaosPos: calculateChaosPosition(index, photos.length),
        targetPos: calculateTargetPosition(index, photos.length),
        speed: 0.8 + Math.random() * 1.5,
        isNew: photo.isNew
      };
    });
  }, [photos]);

  // 暴露获取照片位置的方法
  useImperativeHandle(ref, () => ({
    getPhotoPosition: (photoId: number) => {
      const photoData = photoDataList.find(p => p.id === photoId);
      if (photoData) {
        // 返回照片在树形态下的目标位置
        return photoData.targetPos.clone();
      }
      return null;
    }
  }), [photoDataList]);

  // 为每个照片创建 ref
  const getRefForPhoto = (id: number) => {
    if (!photoRefs.current.has(id)) {
      const newRef = { current: null as THREE.Group | null };
      return newRef;
    }
    return { current: photoRefs.current.get(id)! };
  };

  return (
    <group>
      {photoDataList.map((data) => (
        <PolaroidItem
          key={data.id}
          data={data}
          mode={mode}
          isHighlighted={highlightPhotoId === data.id}
          totalPhotos={photos.length}
          isFocusing={isFocusing && highlightPhotoId === data.id}
          expandAmount={expandAmount}
        />
      ))}
    </group>
  );
});

Polaroids.displayName = 'Polaroids';
