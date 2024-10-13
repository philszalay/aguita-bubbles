/* eslint-disable semi */
/* eslint-disable space-before-function-paren */
import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Stats from 'three/examples/jsm/libs/stats.module'
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js'
import Vertex from './vertex.glsl'
import Fragment from './fragment.glsl'
import { createNoise2D } from 'simplex-noise'
import RAPIER from '@dimforge/rapier3d-compat';

export default class ThreeJsDraft {
  constructor() {
    /**
     * Variables
    */
    this.canvas = document.querySelector('canvas.webgl')
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.devicePixelRatio = window.devicePixelRatio

    this.noise2D = createNoise2D()

    /**
     * Scene
     */
    this.scene = new THREE.Scene()

    this.resolution = 40

    this.mouseX = 0
    this.mouseY = 0

    this.mousePosition = new THREE.Vector3(0, 0, 0)

    /**
     * Camera
     */
    this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000)
    this.camera.position.z = 5

    this.clock = new THREE.Clock()

    this.time = 0.0

    /**
     * Renderer
     */
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas
    })
    this.renderer.setSize(this.width, this.height)
    this.renderer.setPixelRatio(Math.min(this.devicePixelRatio, 2))

    /**
     * Controls
     */
    this.orbitControls = new OrbitControls(this.camera, this.canvas)
    this.orbitControls.enabled = false

    /**
     * Rapier
     */
    this.initRapier()
    this.numBodies = 20;
    this.bodies = []

    /**
     * Resize
     */
    window.addEventListener('resize', () => {
      this.width = window.innerWidth
      this.height = window.innerHeight
      this.camera.aspect = this.width / this.height
      this.camera.updateProjectionMatrix()

      this.devicePixelRatio = window.devicePixelRatio

      this.renderer.setSize(this.width, this.height)
      this.renderer.setPixelRatio(Math.min(this.devicePixelRatio, 2))
    }, false)

    document.addEventListener('mousemove', (event) => {
      this.mouseX = event.clientX
      this.mouseY = event.clientY

      const mousePosition = new THREE.Vector3(
        (this.mouseX / window.innerWidth) * 2 - 1,
        -(this.mouseY / window.innerHeight) * 2 + 1,
        0
      )

      mousePosition.unproject(this.camera);
      const dir = mousePosition.sub(this.camera.position).normalize();
      const distance = -this.camera.position.z / dir.z;
      this.mousePosition = this.camera.position.clone().add(dir.multiplyScalar(distance));
    })

    /**
     * Loading Manager
     */
    this.loadingManager = new THREE.LoadingManager()

    this.loadingManager.onStart = function (url, itemsLoaded, itemsTotal) {
      console.log('Started loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.')
    }

    this.loadingManager.onLoad = function () {
      console.log('Loading complete!')
    }

    this.loadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
      console.log('Loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.')
    }

    this.loadingManager.onError = function (url) {
      console.log('There was an error loading ' + url)
    }
  }

  loadAssets() {
    // const textureLoader = new THREE.TextureLoader(this.loadingManager)
  }

  async initRapier() {
    await RAPIER.init();
    const gravity = { x: 0.0, y: 0, z: 0.0 };
    this.world = new RAPIER.World(gravity);

    /**
     * Load Assets
     */
    this.loadAssets()

    /**
     * Helpers
     */
    this.addHelpers()

    /**
     * Objects
     */
    this.addObjects()

    this.renderer.render(this.scene, this.camera)
    /**
     * Animation Loop
     */
    this.animate()
  }

  getBody(RAPIER, world) {
    const minSize = 0.2;
    const maxSize = 0.25;
    const size = minSize + Math.random() * (maxSize - minSize);
    const range = 6;
    const density = size * 0.5;
    const x = Math.random() * range - range * 0.5;
    const y = Math.random() * range - range * 0.5 + 3;
    const z = Math.random() * range - range * 0.5;
    // physics
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(5)
      .setAngularDamping(5);

    const rigid = world.createRigidBody(rigidBodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.ball(size).setDensity(density);
    world.createCollider(colliderDesc, rigid);

    const geometry = new THREE.IcosahedronGeometry(size, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      flatShading: true
    });
    const mesh = new THREE.Mesh(geometry, material);

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x990000,
      wireframe: true
    });
    const wireMesh = new THREE.Mesh(geometry, wireMat);
    wireMesh.scale.setScalar(1.01);
    mesh.add(wireMesh);

    function update() {
      const metaOffset = new THREE.Vector3(0.5, 0.5, 0.5);

      rigid.resetForces(true);
      const { x, y, z } = rigid.translation();
      const pos = new THREE.Vector3(x, y, z);
      const dir = this.mousePosition.clone().sub(pos).normalize();
      rigid.addForce(dir.multiplyScalar(0.45), true);
      // mesh.position.set(x, y, z); // debug

      pos.multiplyScalar(0.1).add(metaOffset);
      return pos;
    }

    return { mesh, rigid, update: update.bind(this) };
  }

  addHelpers() {
    const axisHelper = new THREE.AxesHelper(3)
    this.scene.add(axisHelper)

    this.stats = Stats()
    document.body.appendChild(this.stats.dom)
  }

  addObjects() {
    for (let i = 0; i < this.numBodies; i++) {
      const body = this.getBody(RAPIER, this.world);
      this.bodies.push(body);
      // this.scene.add(body.mesh); // debug
    }

    /**
 * Metaballs
 */
    this.metaMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uTime: { value: 1.0 },
        uColor: { value: new THREE.Color(0x42a9f1) },
        viewVector: { value: new THREE.Vector3(0, 0, 20) }
      },
      vertexShader: Vertex,
      fragmentShader: Fragment,
      side: THREE.DoubleSide,
      transparent: true,
      wireframe: false
    })

    this.metaBalls = new MarchingCubes(
      96,
      this.metaMaterial,
      true, // enable UVs
      true, // enable colors
      9000 // max poly count
    );

    // this.metaBalls.se(5);
    this.metaBalls.isolation = 500; // blobbiness /size
    this.metaBalls.scale.setScalar(5);

    this.metaBalls.userData = {
      update: () => {
        this.metaBalls.reset()
        const strength = 0.5; // size-y
        const subtract = 10 // lighness / smoothness

        this.bodies.forEach((b, i) => {
          const { x, y, z } = b.update()

          const ballx = x + this.noise2D(i * 1.85 + this.time * 0.25, i * 1.85 + this.time * 0.25) * 0.1
          const bally = y + this.noise2D(i * 1.8 + this.time * 0.25, i * 1.8 + this.time * 0.25) * 0.1
          const ballz = z + this.noise2D(i * 1.9 + this.time * 0.25, i * 1.9 + this.time * 0.25) * 0.1

          this.metaBalls.addBall(ballx, bally, ballz, strength, subtract);
        });

        this.metaBalls.update();
      }
    }

    this.scene.add(this.metaBalls)
  }

  animate() {
    const delta = this.clock.getDelta()
    this.time += delta * 0.5

    this.world.step();
    // this.bodies.forEach(b => b.update()); // debug

    this.metaBalls.userData.update();

    this.orbitControls.update()
    this.stats.update()
    this.renderer.render(this.scene, this.camera)
    window.requestAnimationFrame(this.animate.bind(this))
  }
}

/**
 * Create ThreeJsDraft
 */
// eslint-disable-next-line no-new
new ThreeJsDraft()
