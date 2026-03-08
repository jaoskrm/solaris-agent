import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function ThreatGlobe() {
    const meshRef = useRef<THREE.Mesh>(null);
    const glowRef = useRef<THREE.Mesh>(null);

    // Rotate the globe slowly
    useFrame((state) => {
        if (meshRef.current) {
            meshRef.current.rotation.y += 0.002;
        }
        if (glowRef.current) {
            glowRef.current.rotation.y += 0.002;
        }
    });

    const geometry = useMemo(() => new THREE.IcosahedronGeometry(2, 6), []);
    const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

    return (
        <group>
            {/* Core Planet (Solid back to hide reverse side lines slightly) */}
            <mesh>
                <sphereGeometry args={[1.95, 32, 32]} />
                <meshBasicMaterial color="#000000" />
            </mesh>

            {/* Wireframe shell */}
            <lineSegments ref={meshRef} geometry={edgesGeometry}>
                <lineBasicMaterial color="#2dffb3" transparent opacity={0.2} />
            </lineSegments>

            {/* Scattered node blips */}
            <mesh ref={glowRef}>
                <icosahedronGeometry args={[2.02, 1]} />
                <pointsMaterial color="#ff3b3b" size={0.05} transparent opacity={0.8} />
            </mesh>
        </group>
    );
}
