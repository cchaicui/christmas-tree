import React, { useMemo, useRef, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TreeMode } from '../types';

interface OrnamentsProps {
  mode: TreeMode;
  count: number;
  expandAmount?: number; // 0-1, 控制散开程度
}

type OrnamentType = 'ball' | 'gift' | 'light';

interface InstanceData {
  chaosPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  type: OrnamentType;
  color: THREE.Color;
  scale: number;
  speed: number;
  rotationOffset: THREE.Euler;
}

export const Ornaments: React.FC<OrnamentsProps> = ({ mode, count, expandAmount = 0 }) => {
  // We use 3 separate InstancedMeshes for different geometries/materials to reduce draw calls
  // but allow unique shapes.
  const ballsRef = useRef<THREE.InstancedMesh>(null);
  const giftsRef = useRef<THREE.InstancedMesh>(null);
  const lightsRef = useRef<THREE.InstancedMesh>(null);
  
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Generate data once
  const { ballsData, giftsData, lightsData } = useMemo(() => {
    const _balls: InstanceData[] = [];
    const _gifts: InstanceData[] = [];
    const _lights: InstanceData[] = [];

    const height = 11; // Slightly smaller than foliage
    const maxRadius = 4.5;
    
    // 少女粉 + 深绿配色
    const babyPink = new THREE.Color("#FFB6C1");      // 浅粉红
    const sakuraPink = new THREE.Color("#FFB7C5");    // 樱花粉
    const cottonCandy = new THREE.Color("#FFBCD9");   // 棉花糖粉
    const petalPink = new THREE.Color("#FFC0CB");     // 花瓣粉
    const darkForest = new THREE.Color("#1B4332");    // 深森林绿
    const pineGreen = new THREE.Color("#2D5A3D");     // 松树绿
    const emeraldDark = new THREE.Color("#1E5631");   // 深翡翠绿
    const ivyGreen = new THREE.Color("#254D32");      // 常春藤绿
    
    // 少女粉 + 深绿调色板
    const palette = [babyPink, darkForest, sakuraPink, pineGreen, cottonCandy, emeraldDark, petalPink, ivyGreen];

    for (let i = 0; i < count; i++) {
      const rnd = Math.random();
      let type: OrnamentType = 'ball';
      if (rnd > 0.8) type = 'gift';
      if (rnd > 0.9) type = 'light'; // Less lights as geometry, more via bloom

      // 1. Target Position (Spiral with heavy density at bottom)
      // Use power function to bias distribution toward bottom (lower yNorm values)
      const yNorm = Math.pow(Math.random(), 2.5); // Heavy concentration at bottom
      const y = yNorm * height + 0.5;
      const rScale = (1 - yNorm);
      const theta = y * 10 + Math.random() * Math.PI * 2; // Wind around
      
      // Push ornaments slightly outside the foliage radius
      const r = maxRadius * rScale + (Math.random() * 0.5);
      
      const targetPos = new THREE.Vector3(
        r * Math.cos(theta),
        y,
        r * Math.sin(theta)
      );

      // 2. Chaos Position - 散开但不要太远，保持在视野内
      const cR = 8 + Math.random() * 7; // 8~15 范围
      const cTheta = Math.random() * Math.PI * 2;
      const cPhi = Math.acos(2 * Math.random() - 1);
      const chaosPos = new THREE.Vector3(
        cR * Math.sin(cPhi) * Math.cos(cTheta),
        cR * Math.sin(cPhi) * Math.sin(cTheta) + 3,
        cR * Math.cos(cPhi) - 5 // 稍微往后，不遮挡照片
      );

      const scale = type === 'light' ? 0.15 : (0.22 + Math.random() * 0.28) * 1.1; // 放大1.1倍
      const color = type === 'light' ? new THREE.Color("#FFFFAA") : palette[Math.floor(Math.random() * palette.length)];

      const data: InstanceData = {
        chaosPos,
        targetPos,
        type,
        color,
        scale,
        speed: 0.5 + Math.random() * 1.5, // Random speed for physics feel
        rotationOffset: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, 0)
      };

      if (type === 'ball') _balls.push(data);
      else if (type === 'gift') _gifts.push(data);
      else _lights.push(data);
    }

    return { ballsData: _balls, giftsData: _gifts, lightsData: _lights };
  }, [count]);

  useLayoutEffect(() => {
    // Set initial colors
    [
      { ref: ballsRef, data: ballsData },
      { ref: giftsRef, data: giftsData },
      { ref: lightsRef, data: lightsData }
    ].forEach(({ ref, data }) => {
      if (ref.current) {
        data.forEach((d, i) => {
          ref.current!.setColorAt(i, d.color);
        });
        ref.current.instanceColor!.needsUpdate = true;
      }
    });
  }, [ballsData, giftsData, lightsData]);

  // 用于平滑过渡散开效果
  const expandRef = useRef(0);

  useFrame((state, delta) => {
    const isFormed = mode === TreeMode.FORMED;
    const time = state.clock.elapsedTime;
    
    // 平滑过渡散开值
    expandRef.current = THREE.MathUtils.lerp(expandRef.current, expandAmount, delta * 2);
    const currentExpand = expandRef.current;

    // Helper to update a mesh ref
    const updateMesh = (ref: React.RefObject<THREE.InstancedMesh>, data: InstanceData[]) => {
      if (!ref.current) return;

      let needsUpdate = false;

      data.forEach((d, i) => {
        // 散开时移动到混沌位置
        let dest: THREE.Vector3;
        if (currentExpand > 0.1) {
          // 散开时向外扩散
          const expandedPos = d.chaosPos.clone().multiplyScalar(1 + currentExpand * 0.5);
          dest = d.targetPos.clone().lerp(expandedPos, currentExpand);
        } else {
          dest = isFormed ? d.targetPos : d.chaosPos;
        }
        
        // We actually want to lerp the CURRENT position to the DESTINATION
        // But extracting current position from matrix is expensive every frame for all.
        // Instead, we calculate "current" based on a virtual progress 0-1 driven by state.
        
        // To simulate "physics" (heavy/light), we don't store state per particle here (too complex for this snippet).
        // Instead, we calculate position based on a time-dependent lerp factor.
        
        // However, a simple way to make it feel organic is:
        // Position = Mix(Chaos, Target, SmoothStep(GlobalProgress * speed))
        
        // Let's use a sin wave derived from time for hover, but the main transition is driven by a hidden 'progress' value
        // Since we don't have a global store for animation progress per particle, we approximate using the mode switch time.
        // For a robust system, we'd use a spring library, but here we do manual lerping.

        // Get current matrix position to lerp from? Too expensive.
        // Let's assume a global transition variable `t` that goes 0->1 or 1->0.
        // We will misuse the object's userdata or just calculate purely functional.
        
        // Functional approach:
        // We need an accumulated value. Let's create a visual wobble.
        
        // NOTE: For true interactive physics, we'd use useSprings from react-spring/three, 
        // but for 1000 instances, manual matrix manipulation is better.
        // Here we will simply interpolate between the two static positions based on a "progress" variable
        // that we track manually or approximate.
        
        // Let's read a custom progress from the dataset. 
        // We'll augment the data object with a mutable `currentProgress` property in a closure if possible,
        // but `data` is static.
        
        // Let's just use the `MathUtils.lerp` on the vectors directly inside the loop 
        // by reading the matrix, lerping, writing back.
        ref.current!.getMatrixAt(i, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
        
        const step = delta * d.speed;
        dummy.position.lerp(dest, step);

        // Add wobble when formed
        if (isFormed && dummy.position.distanceTo(d.targetPos) < 0.5) {
          dummy.position.y += Math.sin(time * 2 + d.chaosPos.x) * 0.002;
        }

        // Rotation
        if (d.type === 'gift') {
           dummy.rotation.x += delta * 0.5;
           dummy.rotation.y += delta * 0.2;
        } else {
           // Balls face out
           dummy.lookAt(0, dummy.position.y, 0);
        }

        dummy.scale.setScalar(d.scale);
        if (d.type === 'light') {
           // Pulsate lights
           const pulse = 1 + Math.sin(time * 5 + d.chaosPos.y) * 0.3;
           dummy.scale.multiplyScalar(pulse);
        }

        dummy.updateMatrix();
        ref.current!.setMatrixAt(i, dummy.matrix);
        needsUpdate = true;
      });

      if (needsUpdate) ref.current.instanceMatrix.needsUpdate = true;
    };

    updateMesh(ballsRef, ballsData);
    updateMesh(giftsRef, giftsData);
    updateMesh(lightsRef, lightsData);
  });

  return (
    <>
      {/* Balls: 粉绿色球 - 高光泽 */}
      <instancedMesh ref={ballsRef} args={[undefined, undefined, ballsData.length]}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial 
          metalness={0.9}
          roughness={0.1}
          envMapIntensity={2.0}
        />
      </instancedMesh>

      {/* Gifts: 粉绿色礼物盒 */}
      <instancedMesh ref={giftsRef} args={[undefined, undefined, giftsData.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial 
          metalness={0.9}
          roughness={0.15}
          envMapIntensity={1.2}
        />
      </instancedMesh>

      {/* Lights: Emissive small spheres */}
      <instancedMesh ref={lightsRef} args={[undefined, undefined, lightsData.length]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshStandardMaterial 
          emissive="white"
          emissiveIntensity={2}
          toneMapped={false}
          color="white" // Tinted by instance color (yellowish)
        />
      </instancedMesh>
    </>
  );
};