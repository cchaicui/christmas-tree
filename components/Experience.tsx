import React, { useRef, useEffect, useState } from 'react';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { PMREMGenerator, Color, Scene as ThreeScene, Mesh, MeshBasicMaterial, SphereGeometry, BackSide } from 'three';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Foliage } from './Foliage';
import { Ornaments } from './Ornaments';
import { Polaroids, PolaroidsRef } from './Polaroids';
import { TreeStar } from './TreeStar';
import { Snow, Stars } from './Snow';
import { TreeMode } from '../types';
import { Photo } from '../hooks/usePhotoSync';

interface ExperienceProps {
  mode: TreeMode;
  photos: Photo[];
  focusPhotoId: number | null;
  onFocusComplete: () => void;
}

// 程序化环境贴图组件 - 让金属材质有反射效果
function ProgrammaticEnvironment() {
  const { gl, scene } = useThree();
  
  useEffect(() => {
    const pmremGenerator = new PMREMGenerator(gl);
    pmremGenerator.compileEquirectangularShader();
    
    // 创建一个简单的渐变环境场景
    const envScene = new ThreeScene();
    const geometry = new SphereGeometry(50, 32, 32);
    
    // 使用渐变材质
    const material = new MeshBasicMaterial({
      color: new Color('#1a1a2e'),
      side: BackSide,
    });
    
    const mesh = new Mesh(geometry, material);
    envScene.add(mesh);
    
    // 添加一些"光源"球体来模拟反射
    const lightColors = ['#ffffff', '#FFD700', '#ff6b6b', '#ffffff'];
    const lightPositions = [
      [20, 30, 20],
      [-25, 20, -15],
      [15, 10, -25],
      [-10, 25, 20]
    ];
    
    lightPositions.forEach((pos, i) => {
      const lightGeo = new SphereGeometry(3, 16, 16);
      const lightMat = new MeshBasicMaterial({ 
        color: new Color(lightColors[i]),
      });
      const lightMesh = new Mesh(lightGeo, lightMat);
      lightMesh.position.set(pos[0], pos[1], pos[2]);
      envScene.add(lightMesh);
    });
    
    const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
    scene.environment = envMap;
    
    pmremGenerator.dispose();
    
    return () => {
      envMap.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);
  
  return null;
}

// 聚焦状态
type FocusState = 'idle' | 'zooming_in' | 'focused' | 'zooming_out';

export const Experience: React.FC<ExperienceProps> = ({ 
  mode, 
  photos, 
  focusPhotoId,
  onFocusComplete 
}) => {
  const controlsRef = useRef<any>(null);
  const polaroidsRef = useRef<PolaroidsRef>(null);
  const treeGroupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  
  // 聚焦相关状态
  const [focusState, setFocusState] = useState<FocusState>('idle');
  const [highlightPhotoId, setHighlightPhotoId] = useState<number | null>(null);
  const focusTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // 相机目标位置
  const targetCameraPos = useRef(new THREE.Vector3(0, 4, 20));
  const targetLookAt = useRef(new THREE.Vector3(0, 4, 0));
  const originalCameraPos = useRef(new THREE.Vector3(0, 4, 20));
  const originalLookAt = useRef(new THREE.Vector3(0, 4, 0));

  // 处理点击照片
  const handlePhotoClick = (photoId: number) => {
    if (focusState !== 'idle') return; // 如果正在聚焦中，忽略点击
    
    // 保存原始相机位置
    originalCameraPos.current.copy(camera.position);
    if (controlsRef.current) {
      originalLookAt.current.copy(controlsRef.current.target);
    }
    
    // 照片会移动到屏幕中央
    const photoDisplayPos = new THREE.Vector3(0, 2, 12);
    targetCameraPos.current.set(0, 2, 17);
    targetLookAt.current.copy(photoDisplayPos);
    
    // 禁用控制器
    if (controlsRef.current) {
      controlsRef.current.enabled = false;
    }
    
    setHighlightPhotoId(photoId);
    setFocusState('zooming_in');
    
    // 5秒后自动返回（点击的照片显示时间短一些）
    focusTimerRef.current = setTimeout(() => {
      setFocusState('zooming_out');
    }, 5000);
  };

  // 处理新照片聚焦
  useEffect(() => {
    if (focusPhotoId !== null) {
      // 保存原始相机位置
      originalCameraPos.current.copy(camera.position);
      if (controlsRef.current) {
        originalLookAt.current.copy(controlsRef.current.target);
      }
      
      // 照片会移动到屏幕中央
      // 照片本地 (0, 8, 12) + treeGroup (0, -6, 0) = 世界 (0, 2, 12)
      const photoDisplayPos = new THREE.Vector3(0, 2, 12);
      
      // 相机位置：在照片正前方，距离 5 单位
      targetCameraPos.current.set(0, 2, 17);
      targetLookAt.current.copy(photoDisplayPos);
      
      // 开始聚焦
      setFocusState('zooming_in');
      setHighlightPhotoId(focusPhotoId);
      
      // 禁用手势控制
      if (controlsRef.current) {
        controlsRef.current.enabled = false;
      }
      
      // 30秒后回缩
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
      }
      focusTimerRef.current = setTimeout(() => {
        setFocusState('zooming_out');
      }, 30000);
    }
    
    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
      }
    };
  }, [focusPhotoId, camera]);

  // 相机动画和自动旋转
  useFrame((state, delta) => {
    // 圣诞树缓缓自动旋转（仅在空闲状态）
    if (treeGroupRef.current && focusState === 'idle') {
      treeGroupRef.current.rotation.y += delta * 0.1;
    }
    
    // 聚焦时，树慢慢转回正面
    if (treeGroupRef.current && focusState !== 'idle') {
      treeGroupRef.current.rotation.y *= 0.9; // 逐渐归零
    }
    
    if (!controlsRef.current) return;

    const lerpSpeed = 3; // 稍微加快动画速度

    // 聚焦动画逻辑
    if (focusState === 'zooming_in') {
      camera.position.lerp(targetCameraPos.current, delta * lerpSpeed);
      controlsRef.current.target.lerp(targetLookAt.current, delta * lerpSpeed);
      controlsRef.current.update();
      
      // 检查是否到达目标
      if (camera.position.distanceTo(targetCameraPos.current) < 0.3) {
        setFocusState('focused');
      }
    } else if (focusState === 'focused') {
      // 保持聚焦状态，相机固定看向照片
      controlsRef.current.target.lerp(targetLookAt.current, delta * lerpSpeed);
      controlsRef.current.update();
    } else if (focusState === 'zooming_out') {
      camera.position.lerp(originalCameraPos.current, delta * lerpSpeed);
      controlsRef.current.target.lerp(originalLookAt.current, delta * lerpSpeed);
      controlsRef.current.update();
      
      // 检查是否回到原位
      if (camera.position.distanceTo(originalCameraPos.current) < 0.5) {
        setFocusState('idle');
        setHighlightPhotoId(null);
        controlsRef.current.enabled = true;
        onFocusComplete();
      }
    }
  });

  return (
    <>
      <OrbitControls 
        ref={controlsRef}
        enablePan={false} 
        minPolarAngle={Math.PI / 4} 
        maxPolarAngle={Math.PI / 1.8}
        minDistance={12}
        maxDistance={25}
        enableDamping
        dampingFactor={0.05}
        enabled={focusState === 'idle'}
        target={[0, 0, 0]}
      />

      {/* 程序化环境光 - 不需要下载 */}
      <ProgrammaticEnvironment />
      
      <ambientLight intensity={0.4} color="#ffffff" />
      <directionalLight position={[10, 20, 10]} intensity={2} color="#ffffff" />
      <directionalLight position={[-10, 10, -10]} intensity={1} color="#FFD700" />
      <pointLight position={[0, 15, 0]} intensity={1.5} color="#ffffff" />

      <group position={[0, -6, 0]} ref={treeGroupRef}>
        <Foliage 
          mode={mode} 
          count={12000} 
          expandAmount={focusState !== 'idle' ? 1.0 : 0}
        />
        <Ornaments 
          mode={mode} 
          count={600} 
          expandAmount={focusState !== 'idle' ? 1.0 : 0}
        />
        <Polaroids 
          ref={polaroidsRef}
          mode={mode} 
          photos={photos}
          highlightPhotoId={highlightPhotoId}
          isFocusing={focusState !== 'idle'}
          expandAmount={focusState !== 'idle' ? 1.0 : 0}
          onPhotoClick={handlePhotoClick}
        />
        <TreeStar 
          mode={mode} 
          expandAmount={focusState !== 'idle' ? 1.0 : 0}
        />
        
        <ContactShadows 
          opacity={0.7} 
          scale={30} 
          blur={2} 
          far={4.5} 
          color="#000000" 
        />
      </group>

      {/* 下雪效果和星空 */}
      <Snow count={1500} />
      <Stars count={400} />

      <EffectComposer enableNormalPass={false}>
        <Bloom 
          luminanceThreshold={0.8} 
          mipmapBlur 
          intensity={1.5} 
          radius={0.6}
        />
        <Vignette eskil={false} offset={0.1} darkness={0.7} />
        <Noise opacity={0.02} blendFunction={BlendFunction.OVERLAY} />
      </EffectComposer>
    </>
  );
};
