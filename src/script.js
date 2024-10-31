/* eslint-disable semi */
/* eslint-disable space-before-function-paren */
import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Stats from 'three/examples/jsm/libs/stats.module'
import Vertex from './vertex.glsl'
import Fragment from './fragment.glsl'
import { createNoise2D } from 'simplex-noise'
import RAPIER from '@dimforge/rapier3d-compat';
import { MarchingCubes } from './MarchingCubes'
import logoCoordinates from './logoCoordinates.txt'

const SETUP = true;

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
    this.camera.position.z = 6

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
    this.numBodies = 10;
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

    /**
     * Animation Loop
     */
    this.animate()
  }

  getBody(RAPIER, world) {
    const minSize = 0.25;
    const maxSize = 0.25;
    const size = minSize + Math.random() * (maxSize - minSize);
    const range = 4;
    const density = 0.2;
    const x = Math.random() * range - range * 0.5;
    const y = Math.random() * range - range * 0.5 + 3;
    const z = Math.random() * range - range * 0.5 + 1;

    // physics
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(5);

    const rigid = world.createRigidBody(rigidBodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.ball(size).setDensity(density);
    world.createCollider(colliderDesc, rigid);

    // Ball geometry and material
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

    function update(index) {
      const metaOffset = new THREE.Vector3(0.5, 0.5, 0.5);

      rigid.resetForces(true);

      const { x, y, z } = rigid.translation();

      // Set gravitation center to mouse position
      const pos = new THREE.Vector3(x, y, z);

      const dir = this.mousePosition.clone().sub(pos);

      const distance = dir.length(); // Calculate the distance

      // let falloff = index === 0 || index === 1 || index === 2 ? 1 : 3 * Math.exp(-distance);

      let falloff = index === 0 || index === 1 || index === 2 ? 1 : 1 * Math.exp(-distance * 0.5);

      if (falloff < 0.05) {
        falloff = 0;
      }

      // Apply force based on direction and falloff (scaled force)
      const force = dir.normalize().multiplyScalar(falloff * 1.0); // Adjust the base force as needed
      rigid.addForce(force, true); // Apply the force at the center of the body

      pos.multiplyScalar(0.1).add(metaOffset);

      mesh.position.set(x, y, z);

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
      this.scene.add(body.mesh); // debug
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
      96, // resolution
      new THREE.MeshBasicMaterial({
        color: 'green',
        wireframe: true
      }),
      // this.metaMaterial,
      true, // enable UVs
      10000 // max poly count
    );

    this.metaBalls.isolation = 0.75; // blobbiness /size

    this.metaBalls.scale.setScalar(5);

    if (SETUP) {
      // Read logo txt file
      const factor = 1;

      const lines = logoCoordinates.split('\n').filter(line => line.trim() !== '');
      lines.forEach((line, index) => {
        if (index % 1 !== 0) {
          return;
        }

        const values = line.split(',').map(Number);
        if (values.length === 4) {
          // Usage example:
          // const subtractValue = 2500; // Adjust for softer or sharper edges
          // const strengthValue = 50 * values[0];

          // console.log('Desired Radius:', desiredRadius);
          // console.log('Calculated Strength:', strengthValue);
          // console.log('Subtract Value:', subtractValue);

          // this.metaBalls.addBall(factor * values[1] + 0.5, factor * values[2] + 0.5, factor * values[3] + 0.5, strengthValue, subtractValue);
          this.metaBalls.addBallWithRadius(factor * values[1] + 0.5, factor * values[2] + 0.5, factor * values[3] + 0.5, 2 * values[0]);
        } else {
          console.warn(`Skipping line: ${line}`);
        }
      });
      this.metaBalls.update();
      console.log(Object.values(this.metaBalls.getNormalCache()));
      console.log(Object.values(this.metaBalls.getField()));
    }

    this.metaBalls.userData = {
      update: () => {
        if (!SETUP) {
          this.metaBalls.reset();
          const strength = 0.5; // size-y
          const subtract = 10; // lighness / smoothness

          this.bodies.forEach((b, i) => {
            const { x, y, z } = b.update(i);
            this.metaBalls.addBall(x, y, z, strength, subtract);
          });

          this.metaBalls.update();
        } else {
          this.bodies.forEach((b, i) => {
            b.update(i);
          });
        }
      }
    }

    this.scene.add(this.metaBalls);
  }

  calculateStrength(radius, subtract) {
    // Calculate the strength based on the desired radius and subtract value
    const strength = subtract * (radius * radius);
    return strength;
  }

  animate() {
    const delta = this.clock.getDelta()
    this.time += delta * 0.5

    this.world.step();

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
