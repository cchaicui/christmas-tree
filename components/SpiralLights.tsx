import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface SpiralLightsProps {
  turns?: number;      // 螺旋圈数
  height?: number;     // 高度
  baseRadius?: number; // 底部半径
  topRadius?: number;  // 顶部半径
  color?: string;      // 灯条颜色
}

export const SpiralLights: React.FC<SpiralLightsProps> = ({
  turns = 6,
  height = 10,
  baseRadius = 5.5,
  topRadius = 0.8,
  color = '#ffffff'
}) => {
  const tubeRef = useRef<THREE.Mesh>(null);
  
  // 创建螺旋曲线
  const { curve, tubeGeometry } = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const segments = turns * 60; // 每圈60个点
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * turns * Math.PI * 2;
      const y = t * height;
      // 半径从底部到顶部递减
      const radius = baseRadius * (1 - t * 0.85) + topRadius * t;
      
      points.push(new THREE.Vector3(
        radius * Math.cos(angle),
        y,
        radius * Math.sin(angle)
      ));
    }
    
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeometry = new THREE.TubeGeometry(curve, segments * 2, 0.08, 8, false);
    
    return { curve, tubeGeometry };
  }, [turns, height, baseRadius, topRadius]);

  // 灯条发光动画
  useFrame((state) => {
    if (tubeRef.current) {
      const material = tubeRef.current.material as THREE.MeshBasicMaterial;
      const pulse = 0.7 + Math.sin(state.clock.elapsedTime * 2) * 0.3;
      material.opacity = pulse;
    }
  });

  return (
    <group>
      {/* 主灯条 */}
      <mesh ref={tubeRef} geometry={tubeGeometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      
      {/* 外发光效果 */}
      <mesh geometry={new THREE.TubeGeometry(curve, turns * 120, 0.2, 8, false)}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      
      {/* 最外层光晕 */}
      <mesh geometry={new THREE.TubeGeometry(curve, turns * 120, 0.4, 8, false)}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.1}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
};


