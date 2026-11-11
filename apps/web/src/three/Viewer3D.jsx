// Salle 3D et déplacement à la première personne.
import { useEffect, useImperativeHandle, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { wallColorHex } from '@expospace/shared/limits.js';
import {
  CAMERA_START,
  DOOR_HEIGHT,
  DOOR_WIDTH,
  EYE_HEIGHT,
  FRAME_BORDER,
  MAX_DELTA,
  PITCH_LIMIT,
  ROOM,
  arrivalAtDoor,
  getSlot,
  pictureSize,
  stepMovement,
  viewpointForSlot,
} from '@expospace/shared/roomLayout.js';
import { useArtworkTexture } from './useArtworkTexture.js';
import { useLabelTexture } from './useLabelTexture.js';

const TURN_SPEED = 1.8;
const LOOK_SPEED = 0.0022;

// Touches physiques (WASD = ZQSD en AZERTY).
const KEYS = {
  ArrowUp: ['forward', 1],
  KeyW: ['forward', 1],
  ArrowDown: ['forward', -1],
  KeyS: ['forward', -1],
  KeyA: ['strafe', -1],
  KeyD: ['strafe', 1],
  ArrowLeft: ['turn', 1],
  ArrowRight: ['turn', -1],
};

const NOOP = () => {};
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const isTyping = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

function RoomShell({ wallColor }) {
  const { width: W, depth: D, height: H } = ROOM;
  const color = wallColorHex(wallColor);
  const walls = [
    { key: 'N', position: [0, H / 2, -D / 2], rotation: [0, 0, 0], size: [W, H] },
    { key: 'S', position: [0, H / 2, D / 2], rotation: [0, Math.PI, 0], size: [W, H] },
    { key: 'E', position: [W / 2, H / 2, 0], rotation: [0, -Math.PI / 2, 0], size: [D, H] },
    { key: 'W', position: [-W / 2, H / 2, 0], rotation: [0, Math.PI / 2, 0], size: [D, H] },
  ];
  return (
    <group>
      <ambientLight intensity={1.1} />
      <hemisphereLight args={['#ffffff', '#8c7b69', 1.2]} />
      <directionalLight position={[2, H, 3]} intensity={0.8} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#9b7a5a" roughness={0.85} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#f4f2ee" roughness={1} />
      </mesh>
      {walls.map((w) => (
        <group key={w.key} position={w.position} rotation={w.rotation}>
          <mesh>
            <planeGeometry args={w.size} />
            <meshStandardMaterial color={color} roughness={0.95} />
          </mesh>
          <mesh position={[0, -H / 2 + 0.05, 0.01]}>
            <planeGeometry args={[w.size[0], 0.1]} />
            <meshStandardMaterial color="#3b332c" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Painting({ item, onSelect }) {
  const slot = getSlot(item.slotCode);
  const { width, height } = pictureSize(item.widthPx, item.heightPx);
  const { texture, failed } = useArtworkTexture(item.thumbnailUrl, item.imageUrl);
  if (!slot) return null;
  return (
    <group position={[slot.x, slot.y, slot.z]} rotation={[0, slot.rotationY, 0]}>
      <mesh position={[0, 0, -0.0225]}>
        <boxGeometry args={[width + 2 * FRAME_BORDER, height + 2 * FRAME_BORDER, 0.035]} />
        <meshStandardMaterial color="#2b2420" roughness={0.6} />
      </mesh>
      <mesh
        userData={{ artworkId: item.id }}
        onClick={(e) => {
          if (document.pointerLockElement) return;
          e.stopPropagation();
          onSelect(item.id);
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <planeGeometry args={[width, height]} />
        {/* Nouveau matériau à chaque texture. */}
        {texture ? (
          <meshBasicMaterial key={texture.uuid} map={texture} toneMapped={false} />
        ) : (
          <meshBasicMaterial key="placeholder" color={failed ? '#c9c4bb' : '#e8e4dc'} />
        )}
      </mesh>
    </group>
  );
}

// Porte cliquable vers une autre salle.
function Door({ door, onDoor }) {
  const slot = getSlot(door.slotCode);
  const label = useLabelTexture(door.target);
  if (!slot) return null;
  const frame = 0.08;
  return (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rotationY, 0]}>
      <mesh position={[0, DOOR_HEIGHT / 2, 0.02]}>
        <boxGeometry args={[DOOR_WIDTH + 2 * frame, DOOR_HEIGHT + frame, 0.04]} />
        <meshStandardMaterial color="#5a4632" roughness={0.7} />
      </mesh>
      <mesh
        position={[0, DOOR_HEIGHT / 2, 0.045]}
        userData={{ doorTarget: door.targetRoomId }}
        onClick={(e) => {
          if (document.pointerLockElement) return;
          e.stopPropagation();
          onDoor(door.targetRoomId);
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <planeGeometry args={[DOOR_WIDTH, DOOR_HEIGHT]} />
        <meshBasicMaterial color="#14110f" />
      </mesh>
      {label && (
        <mesh position={[0, DOOR_HEIGHT + 0.32, 0.03]}>
          <planeGeometry args={[1.6, 0.4]} />
          <meshBasicMaterial key={label.uuid} map={label} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function Controls({ cam, input, paused, onSelect, onDoor, onLockChange, reportRef }) {
  const { camera, gl, scene, raycaster } = useThree();
  const center = useRef(new THREE.Vector2(0, 0));
  const lastReport = useRef(0);

  useEffect(() => {
    const el = gl.domElement;
    const onMove = (e) => {
      if (document.pointerLockElement !== el) return;
      const c = cam.current;
      c.yaw -= e.movementX * LOOK_SPEED;
      c.pitch = clamp(c.pitch - e.movementY * LOOK_SPEED, -PITCH_LIMIT, PITCH_LIMIT);
    };
    // Souris verrouillée : visée au centre.
    const onClick = () => {
      if (document.pointerLockElement !== el) return;
      raycaster.setFromCamera(center.current, camera);
      const hit = raycaster.intersectObjects(scene.children, true).find((h) => h.object.userData.artworkId || h.object.userData.doorTarget);
      if (hit?.object.userData.doorTarget) {
        onDoor(hit.object.userData.doorTarget);
      } else if (hit) {
        document.exitPointerLock();
        onSelect(hit.object.userData.artworkId);
      }
    };
    const onLock = () => onLockChange(document.pointerLockElement === el);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('pointerlockchange', onLock);
    el.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('pointerlockchange', onLock);
      el.removeEventListener('click', onClick);
    };
  }, [cam, camera, gl, scene, raycaster, onSelect, onDoor, onLockChange]);

  useFrame((state, delta) => {
    const c = cam.current;
    const i = input.current;
    if (!paused) {
      const dt = Math.min(delta, MAX_DELTA);
      if (i.turn) c.yaw += i.turn * TURN_SPEED * dt;
      if (i.forward || i.strafe) Object.assign(c, stepMovement(c, i, c.yaw, delta));
    }
    camera.position.set(c.x, EYE_HEIGHT, c.z);
    camera.rotation.set(c.pitch, c.yaw, 0, 'YXZ');
    if (reportRef.current && state.clock.elapsedTime - lastReport.current > 0.2) {
      lastReport.current = state.clock.elapsedTime;
      reportRef.current.dataset.camera = `${c.x.toFixed(2)},${c.z.toFixed(2)},${c.yaw.toFixed(2)}`;
    }
  });
  return null;
}

export default function Viewer3D({ ref, room, arrivalSlot, paused, onSelect, onDoor, onLockChange, onContextLost }) {
  const wrapRef = useRef(null);
  const cam = useRef({ ...CAMERA_START });
  const input = useRef({ forward: 0, strafe: 0, turn: 0 });
  const pressed = useRef(new Set());

  useImperativeHandle(ref, () => ({
    recenter() {
      cam.current = { ...CAMERA_START };
    },
    viewSlot(code) {
      const view = viewpointForSlot(code);
      if (view) cam.current = { ...cam.current, ...view };
    },
    focus() {
      wrapRef.current?.focus();
    },
  }));

  // Arrivée devant la porte de retour, sinon à l'entrée.
  useEffect(() => {
    const arrival = arrivalSlot ? arrivalAtDoor(arrivalSlot) : null;
    cam.current = arrival ? { ...CAMERA_START, ...arrival } : { ...CAMERA_START };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  useEffect(() => {
    const recompute = () => {
      const next = { forward: 0, strafe: 0, turn: 0 };
      for (const code of pressed.current) {
        const [axis, sign] = KEYS[code];
        next[axis] = clamp(next[axis] + sign, -1, 1);
      }
      input.current = next;
    };
    const onDown = (e) => {
      if (!KEYS[e.code] || paused || isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      pressed.current.add(e.code);
      recompute();
    };
    const onUp = (e) => {
      if (pressed.current.delete(e.code)) recompute();
    };
    const reset = () => {
      pressed.current.clear();
      recompute();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', reset);
    if (paused) reset();
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', reset);
    };
  }, [paused]);

  return (
    <div ref={wrapRef} className="viewer" tabIndex={0} aria-label={`Salle en 3D : ${room.name}. Utilisez les flèches pour vous déplacer.`} data-testid="viewer-3d">
      <Canvas
        camera={{ fov: 70, near: 0.05, far: 40, position: [CAMERA_START.x, EYE_HEIGHT, CAMERA_START.z] }}
        dpr={[1, 1.5]}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            onContextLost?.();
          });
        }}
        onPointerMissed={(e) => {
          if (e.type === 'click' && !paused && !document.pointerLockElement) e.target?.requestPointerLock?.()?.catch?.(() => {});
        }}
      >
        <group key={room.id}>
          <RoomShell wallColor={room.wallColor} />
          {room.items.map((item) => (
            <Painting key={item.id} item={item} onSelect={onSelect} />
          ))}
          {(room.doors ?? []).map((door) => (
            <Door key={door.slotCode} door={door} onDoor={onDoor ?? NOOP} />
          ))}
        </group>
        <Controls cam={cam} input={input} paused={paused} onSelect={onSelect} onDoor={onDoor ?? NOOP} onLockChange={onLockChange ?? NOOP} reportRef={wrapRef} />
      </Canvas>
    </div>
  );
}
