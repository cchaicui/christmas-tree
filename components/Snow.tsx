import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface SnowProps {
  count?: number;
}

// 雪花形状的着色器
const snowflakeVertexShader = `
  attribute float size;
  attribute float rotation;
  varying float vRotation;
  
  void main() {
    vRotation = rotation;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const snowflakeFragmentShader = `
  varying float vRotation;
  
  void main() {
    vec2 center = gl_PointCoord - 0.5;
    
    // 旋转坐标
    float c = cos(vRotation);
    float s = sin(vRotation);
    vec2 rotated = vec2(
      center.x * c - center.y * s,
      center.x * s + center.y * c
    );
    
    // 绘制六角雪花
    float dist = length(rotated);
    float angle = atan(rotated.y, rotated.x);
    
    // 六条主臂
    float arms = abs(sin(angle * 3.0));
    float armWidth = 0.08;
    float armPattern = smoothstep(armWidth, 0.0, abs(dist - 0.3) - arms * 0.15);
    
    // 中心圆点
    float centerDot = 1.0 - smoothstep(0.0, 0.1, dist);
    
    // 主臂线条
    float mainArms = 0.0;
    for (int i = 0; i < 6; i++) {
      float armAngle = float(i) * 3.14159 / 3.0;
      vec2 armDir = vec2(cos(armAngle), sin(armAngle));
      float projection = dot(rotated, armDir);
      float perpDist = length(rotated - armDir * projection);
      
      if (projection > 0.0 && projection < 0.45) {
        mainArms += smoothstep(0.03, 0.0, perpDist) * smoothstep(0.45, 0.1, projection);
        
        // 添加分支
        if (projection > 0.15 && projection < 0.35) {
          vec2 branchPoint = armDir * projection;
          vec2 toBranch = rotated - branchPoint;
          float branchAngle1 = armAngle + 0.5;
          float branchAngle2 = armAngle - 0.5;
          vec2 branch1Dir = vec2(cos(branchAngle1), sin(branchAngle1));
          vec2 branch2Dir = vec2(cos(branchAngle2), sin(branchAngle2));
          
          float b1Proj = dot(toBranch, branch1Dir);
          float b2Proj = dot(toBranch, branch2Dir);
          
          if (b1Proj > 0.0 && b1Proj < 0.12) {
            float b1Perp = length(toBranch - branch1Dir * b1Proj);
            mainArms += smoothstep(0.02, 0.0, b1Perp) * 0.7;
          }
          if (b2Proj > 0.0 && b2Proj < 0.12) {
            float b2Perp = length(toBranch - branch2Dir * b2Proj);
            mainArms += smoothstep(0.02, 0.0, b2Perp) * 0.7;
          }
        }
      }
    }
    
    float snowflake = centerDot + mainArms;
    snowflake = clamp(snowflake, 0.0, 1.0);
    
    // 边缘柔化
    float alpha = snowflake * (1.0 - smoothstep(0.4, 0.5, dist));
    
    if (alpha < 0.1) discard;
    
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha * 0.9);
  }
`;

export const Snow: React.FC<SnowProps> = ({ count = 1500 }) => {
  const meshRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  // 创建雪花位置和属性
  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    const sizes = new Float32Array(count);
    const rotations = new Float32Array(count);
    const rotationSpeeds = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 40 - 5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      
      velocities[i] = 0.3 + Math.random() * 1.0;
      sizes[i] = 0.8 + Math.random() * 1.2;
      rotations[i] = Math.random() * Math.PI * 2;
      rotationSpeeds[i] = (Math.random() - 0.5) * 2;
    }
    
    return { positions, velocities, sizes, rotations, rotationSpeeds };
  }, [count]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    const positions = meshRef.current.geometry.attributes.position.array as Float32Array;
    const rotations = meshRef.current.geometry.attributes.rotation.array as Float32Array;
    
    for (let i = 0; i < count; i++) {
      // 下落
      positions[i * 3 + 1] -= particles.velocities[i] * delta * 2;
      
      // 轻微的横向飘动
      positions[i * 3] += Math.sin(state.clock.elapsedTime * 0.5 + i) * delta * 0.5;
      positions[i * 3 + 2] += Math.cos(state.clock.elapsedTime * 0.3 + i) * delta * 0.3;
      
      // 旋转
      rotations[i] += particles.rotationSpeeds[i] * delta;
      
      // 如果雪花落到底部，重置到顶部
      if (positions[i * 3 + 1] < -10) {
        positions[i * 3 + 1] = 35;
        positions[i * 3] = (Math.random() - 0.5) * 60;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      }
    }
    
    meshRef.current.geometry.attributes.position.needsUpdate = true;
    meshRef.current.geometry.attributes.rotation.needsUpdate = true;
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
        <bufferAttribute
          attach="attributes-rotation"
          count={count}
          array={particles.rotations}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={snowflakeVertexShader}
        fragmentShader={snowflakeFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
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

