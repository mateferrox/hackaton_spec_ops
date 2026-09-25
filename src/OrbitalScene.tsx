import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import * as THREE from 'three';
import { ArrowUpRight, WarningCircle } from '@phosphor-icons/react';
import type { Task, TaskResolution } from './contracts';

interface Props {
  tasks: Task[];
  states: TaskResolution[];
  highlightedIds: string[];
  previewRevise: boolean;
  answered: number;
  pulse: number;
  onTask: (id: string) => void;
}

export default function OrbitalScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const latest = useRef(props);
  latest.current = props;
  const reducedMotion = useReducedMotion();
  const [fallback, setFallback] = useState(false);
  const taskSignature = props.tasks.map(t => t.id).join(',');

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
    catch { setFallback(true); return; }
    setFallback(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    container.prepend(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
    camera.position.set(0, 4.8, 8.8);
    camera.lookAt(0, .15, 0);
    const green = new THREE.Color('#bdf567');
    const amber = new THREE.Color('#ffc183');
    const gray = new THREE.Color('#58634e');
    const assembly = new THREE.Group();
    scene.add(assembly);
    scene.add(new THREE.AmbientLight(0xa2b28e, 2));
    const key = new THREE.DirectionalLight(0xd6ffc2, 4);
    key.position.set(3, 5, 2); scene.add(key);
    const rim = new THREE.PointLight(0xb5ff44, 18, 12);
    rim.position.set(-1, 1, -2); scene.add(rim);

    const core = new THREE.Group();
    core.position.y = .28;
    assembly.add(core);
    const shellGeo = new THREE.IcosahedronGeometry(.93, 0);
    const shellMat = new THREE.MeshPhysicalMaterial({ color: '#364a25', metalness: .65, roughness: .22, transparent: true, opacity: .78, flatShading: true, side: THREE.DoubleSide });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.scale.set(1, 1.38, 1);
    core.add(shell);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(shellGeo), new THREE.LineBasicMaterial({ color: green, transparent: true, opacity: .7 }));
    edges.scale.copy(shell.scale); core.add(edges);
    const inner = new THREE.Mesh(new THREE.OctahedronGeometry(.49), new THREE.MeshBasicMaterial({ color: '#d0ff8a', transparent: true, opacity: .68, wireframe: true }));
    inner.scale.y = 1.7; core.add(inner);
    const innerSolid = new THREE.Mesh(new THREE.OctahedronGeometry(.2), new THREE.MeshBasicMaterial({ color: '#d8ffb0' }));
    innerSolid.scale.y = 1.9; core.add(innerSolid);

    const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.35, 0)), new THREE.LineBasicMaterial({ color: '#789954', transparent: true, opacity: .21 }));
    cage.scale.y = 1.07; assembly.add(cage);

    const makeRing = (radius: number, color: THREE.ColorRepresentation, opacity: number, y: number, start = 0, arc = Math.PI * 2) => {
      const geometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 180 }, (_, i) => new THREE.Vector3(Math.cos(start + i / 179 * arc) * radius, y, Math.sin(start + i / 179 * arc) * radius)));
      const ring = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
      assembly.add(ring); return ring;
    };
    makeRing(1.7, '#71805f', .30, -.75);
    makeRing(2.55, '#61704f', .22, -.75);
    makeRing(2.62, '#526145', .13, -.75);
    makeRing(3.3, '#566348', .15, -.75);
    const arc = makeRing(1.73, green, .9, -.75, .2, 1.1);
    const scanner = makeRing(2.55, green, .5, -.74, 0, .6);

    const ticks = new THREE.BufferGeometry();
    const tickPoints: number[] = [];
    for (let i = 0; i < 96; i++) {
      const theta = i / 96 * Math.PI * 2;
      const length = i % 8 === 0 ? .15 : .06;
      tickPoints.push(Math.cos(theta) * 3.3, -.75, Math.sin(theta) * 3.3, Math.cos(theta) * (3.3 + length), -.75, Math.sin(theta) * (3.3 + length));
    }
    ticks.setAttribute('position', new THREE.Float32BufferAttribute(tickPoints, 3));
    assembly.add(new THREE.LineSegments(ticks, new THREE.LineBasicMaterial({ color: '#9baa82', transparent: true, opacity: .28 })));

    const grid = new THREE.GridHelper(18, 36, '#343b2e', '#252a21');
    grid.position.y = -.78;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = .2;
    assembly.add(grid);

    const pointPositions: number[] = [];
    let seed = 52;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 210; i++) pointPositions.push((random() - .5) * 18, (random() - .5) * 10, (random() - .5) * 14);
    const pointsGeo = new THREE.BufferGeometry();
    pointsGeo.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3));
    const particles = new THREE.Points(pointsGeo, new THREE.PointsMaterial({ color: '#b0bd99', size: .018, transparent: true, opacity: .55, sizeAttenuation: true }));
    scene.add(particles);

    const positions = latest.current.tasks.map((_, i, all) => {
      const theta = -.82 + i / Math.max(all.length, 1) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(theta) * 2.65, -.25, Math.sin(theta) * 2.65);
    });
    const satellites = latest.current.tasks.map((task, i) => {
      const group = new THREE.Group();
      group.position.copy(positions[i]);
      const geo = new THREE.OctahedronGeometry(.12);
      const material = new THREE.MeshBasicMaterial({ color: gray });
      const dot = new THREE.Mesh(geo, material);
      group.add(dot);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(.22, .006, 4, 48), new THREE.MeshBasicMaterial({ color: gray, transparent: true, opacity: .5 }));
      halo.rotation.x = -Math.PI / 2;
      group.add(halo);
      const linkGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), positions[i]]);
      const link = new THREE.Line(linkGeo, new THREE.LineDashedMaterial({ color: gray, dashSize: .035, gapSize: .07, transparent: true, opacity: .3 }));
      link.computeLineDistances();
      assembly.add(link, group);
      return { taskId: task.id, group, dot, halo, link };
    });
    // Draw actual task dependencies, not decorative edges.
    const dependencyLines: THREE.Line[] = [];
    latest.current.tasks.forEach((task, i) => task.dependsOnTaskIds.forEach(id => {
      const from = latest.current.tasks.findIndex(t => t.id === id);
      if (from < 0) return;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([positions[from], positions[i]]), new THREE.LineBasicMaterial({ color: '#7c8966', transparent: true, opacity: .14 }));
      assembly.add(line); dependencyLines.push(line);
    }));

    const ripple = makeRing(1, green, 0, -.72);
    let width = 1, height = 1;
    const resize = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      width = rect.width; height = rect.height;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.position.z = width / height < 1.1 ? 11 : 8.8;
      camera.updateProjectionMatrix();
    });
    resize.observe(container);
    let frame = 0, lastDraw = 0, lastPulse = -1, pulseStart = 0;
    const start = performance.now();
    const project = new THREE.Vector3();
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      if (document.hidden || now - lastDraw < (reducedMotion ? 200 : 1000 / 40)) return;
      lastDraw = now;
      const time = reducedMotion ? 0 : (now - start) / 1000;
      const current = latest.current;
      const target = current.previewRevise ? amber : green;
      (edges.material as THREE.LineBasicMaterial).color.lerp(target, .08);
      (inner.material as THREE.MeshBasicMaterial).color.lerp(target, .08);
      shell.rotation.y = time * .13;
      edges.rotation.copy(shell.rotation);
      inner.rotation.y = -time * .3;
      core.position.y = .28 + Math.sin(time * .8) * .055;
      cage.rotation.y = -.22 + time * .035;
      cage.rotation.z = .18;
      arc.rotation.y = time * .13;
      scanner.rotation.y = -time * .18;
      if (current.pulse !== lastPulse) { lastPulse = current.pulse; pulseStart = now; }
      const age = (now - pulseStart) / 1400;
      ripple.scale.setScalar(1 + age * 3.5);
      (ripple.material as THREE.LineBasicMaterial).opacity = reducedMotion || age > 1 ? 0 : (1 - age) * .65;
      for (const satellite of satellites) {
        const state = current.states.find(s => s.taskId === satellite.taskId);
        const highlighted = current.highlightedIds.includes(satellite.taskId);
        const color = state?.status === 'needs_review' ? amber : highlighted ? green : gray;
        satellite.dot.material.color.lerp(color, .15);
        satellite.halo.material.color.lerp(color, .15);
        (satellite.link.material as THREE.LineDashedMaterial).color.lerp(color, .15);
        (satellite.link.material as THREE.LineDashedMaterial).opacity = highlighted ? .7 : .2;
        satellite.dot.rotation.y = time * .5;
        satellite.dot.scale.setScalar(highlighted ? 1.5 : 1);
        const label = labels.current.get(satellite.taskId);
        if (label) {
          project.copy(satellite.group.position).project(camera);
          label.style.left = `${(project.x * .5 + .5) * width}px`;
          label.style.top = `${(-project.y * .5 + .5) * height + 22}px`;
        }
      }
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => material.dispose());
        }
      });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [taskSignature, reducedMotion]);

  return <div className={`orbital-scene ${fallback ? 'scene-fallback' : ''}`} ref={host}>
    {fallback && <div className="fallback-core"><span /><span /><span /></div>}
    <div className="orbital-vignette" aria-hidden="true" />
    <div className="scene-axis axis-north" aria-hidden="true">N</div>
    <div className="scene-axis axis-west" aria-hidden="true">270</div>
    <div className="core-caption"><span className="core-caption-line" /><span>SPEC CORE</span><small>{props.answered ? `${props.answered} decisioni acquisite` : 'In attesa delle tue decisioni'}</small></div>
    {props.tasks.map((task, i) => {
      const state = props.states.find(s => s.taskId === task.id);
      const warning = state?.status === 'needs_review';
      return <button key={task.id} ref={el => { if (el) labels.current.set(task.id, el); else labels.current.delete(task.id); }}
        className={`orbital-node ${warning ? 'node-warning' : ''} ${props.highlightedIds.includes(task.id) ? 'node-highlighted' : ''}`}
        style={fallback ? { left: `${20 + (i % 2) * 58}%`, top: `${25 + Math.floor(i / 2) * 36}%` } : undefined}
        onClick={() => props.onTask(task.id)} aria-label={`Esamina ${task.title}${warning ? ', da rivalutare' : ''}`}>
        <span className="node-id">{String(i + 1).padStart(2, '0')}{warning ? <WarningCircle size={12} /> : <ArrowUpRight size={12} />}</span>
        <span>{task.title}</span>
      </button>;
    })}
  </div>;
}
