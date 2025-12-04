import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TreeMode } from '../types';

interface TreeStarProps {
  mode: TreeMode;
  expandAmount?: number; // 0-1, 控制散开程度
}

export const TreeStar: React.FC<TreeStarProps> = ({ mode, expandAmount = 0 }) => {
  const starRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const expandRef = useRef(0);

  // Create a 5-pointed star shape
  const starShape = React.useMemo(() => {
    const shape = new THREE.Shape();
    const outerRadius = 0.8; // Larger star
    const innerRadius = 0.32;
    const points = 5;

    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    shape.closePath();

    return shape;
  }, []);

  const extrudeSettings = {
    depth: 0.15,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 3,
  };

  // Target positions
  const formedPos = new THREE.Vector3(0, 13, 0); // Higher above tree (height ~11)
  const chaosPos = new THREE.Vector3(
    Math.random() * 20 - 10,
    15 + Math.random() * 10,
    Math.random() * 20 - 10
  );

  // 散开时星星飞到的位置
  const expandedPos = new THREE.Vector3(0, 25, 0);

  useFrame((state, delta) => {
    if (!starRef.current) return;

    const isFormed = mode === TreeMode.FORMED;
    const time = state.clock.elapsedTime;
    
    // 平滑过渡散开值
    expandRef.current = THREE.MathUtils.lerp(expandRef.current, expandAmount, delta * 2);
    const currentExpand = expandRef.current;

    // Position animation - 散开时飞到上方
    let targetPos: THREE.Vector3;
    if (currentExpand > 0.1) {
      targetPos = formedPos.clone().lerp(expandedPos, currentExpand);
    } else {
      targetPos = isFormed ? formedPos : chaosPos;
    }
    starRef.current.position.lerp(targetPos, delta * 1.5);

    // Rotation animation
    if (currentExpand > 0.1) {
      // 散开时快速旋转
      starRef.current.rotation.z += delta * 3;
      starRef.current.rotation.y += delta * 2;
    } else if (isFormed) {
      // Gentle rotation and floating when formed
      starRef.current.rotation.z = time * 0.5;
      starRef.current.position.y = formedPos.y + Math.sin(time * 2) * 0.1;
    } else {
      // Spinning in chaos mode
      starRef.current.rotation.x += delta * 2;
      starRef.current.rotation.y += delta * 3;
    }

    // Pulsating light - 散开时更亮
    if (lightRef.current) {
      const basePulse = 2 + Math.sin(time * 3) * 0.5;
      lightRef.current.intensity = basePulse + currentExpand * 3;
    }
  });

  return (
    <group ref={starRef} position={[0, 13, 0]}>
      {/* Star Mesh */}
      <mesh rotation={[0, 0, 0]}>
        <extrudeGeometry args={[starShape, extrudeSettings]} />
        <meshStandardMaterial
          color="#D4AF37"
          emissive="#FFD700"
          emissiveIntensity={2}
          metalness={0.9}
          roughness={0.1}
          toneMapped={false}
        />
      </mesh>

      {/* Point Light for glow effect */}
      <pointLight
        ref={lightRef}
        color="#FFD700"
        intensity={2}
        distance={5}
        decay={2}
      />
    </group>
  );
};

