import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface SnowProps {
  count?: number;
}

export const Snow: React.FC<SnowProps> = ({ count = 2000 }) => {
  const meshRef = useRef<THREE.Points>(null);
  
  // 创建雪花位置
  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    const sizes = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      // 在一个大的区域内随机分布
      positions[i * 3] = (Math.random() - 0.5) * 60;      // x
      positions[i * 3 + 1] = Math.random() * 40 - 5;       // y
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;   // z
      
      // 随机下落速度
      velocities[i] = 0.5 + Math.random() * 1.5;
      
      // 随机大小
      sizes[i] = 0.1 + Math.random() * 0.2;
    }
    
    return { positions, velocities, sizes };
  }, [count]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    const positions = meshRef.current.geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < count; i++) {
      // 下落
      positions[i * 3 + 1] -= particles.velocities[i] * delta * 3;
      
      // 轻微的横向飘动
      positions[i * 3] += Math.sin(state.clock.elapsedTime + i) * delta * 0.3;
      positions[i * 3 + 2] += Math.cos(state.clock.elapsedTime * 0.7 + i) * delta * 0.2;
      
      // 如果雪花落到底部，重置到顶部
      if (positions[i * 3 + 1] < -10) {
        positions[i * 3 + 1] = 35;
        positions[i * 3] = (Math.random() - 0.5) * 60;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      }
    }
    
    meshRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={particles.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={count}
          array={particles.sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        color="#ffffff"
        transparent
        opacity={0.8}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
};

// 星空背景
export const Stars: React.FC<{ count?: number }> = ({ count = 500 }) => {
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // 在一个大球体表面分布星星
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 80 + Math.random() * 20;
      
      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.5 + 20; // 偏向上方
      pos[i * 3 + 2] = radius * Math.cos(phi);
    }
    return pos;
  }, [count]);

  const sizes = useMemo(() => {
    const s = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      s[i] = 0.1 + Math.random() * 0.3;
    }
    return s;
  }, [count]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.3}
        color="#ffffcc"
        transparent
        opacity={0.6}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
};

