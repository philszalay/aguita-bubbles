/* eslint-disable semi */
/* eslint-disable space-before-function-paren */
import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Stats from 'three/examples/jsm/libs/stats.module'
import Vertex from './vertex.glsl'
import Fragment from './fragment.glsl'
import logoCoordinates from './logoCoordinates.txt'
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

    /**
     * Scene
     */
    this.scene = new THREE.Scene()

    this.mouseX = 0
    this.mouseY = 0

    this.mousePosition = new THREE.Vector3(0, 0, 0)

    /**
     * Camera
     */
    this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 10)
    this.camera.position.z = 1

    /**
     * Renderer
     */
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas
    })
    this.renderer.setSize(this.width, this.height)
    this.renderer.setPixelRatio(Math.min(this.devicePixelRatio, 2))

    this.backgroundColor = new THREE.Color(0x3399ee);
    this.renderer.setClearColor(this.backgroundColor, 1);

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
    this.createSphereTexture()

    /**
     * Lights
     */
    this.addLight()

    // Create a ray marching plane
    const geometry = new THREE.PlaneGeometry();
    this.material = new THREE.ShaderMaterial();
    this.rayMarchPlane = new THREE.Mesh(geometry, this.material);

    // Get the wdith and height of the near plane
    const nearPlaneWidth = this.camera.near * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect * 2;
    const nearPlaneHeight = nearPlaneWidth / this.camera.aspect;

    // Scale the ray marching plane
    this.rayMarchPlane.scale.set(nearPlaneWidth, nearPlaneHeight, 1);

    this.uniforms = {
      u_eps: { value: 0.00001 },
      u_maxDis: { value: 2 },
      u_maxSteps: { value: 50 },

      u_clearColor: { value: this.backgroundColor },

      u_camPos: { value: this.camera.position },
      u_camToWorldMat: { value: this.camera.matrixWorld },
      u_camInvProjMat: { value: this.camera.projectionMatrixInverse },

      u_lightDir: { value: this.light.position },
      u_lightColor: { value: this.light.color },

      u_diffIntensity: { value: 0.5 },
      u_specIntensity: { value: 3 },
      u_ambientIntensity: { value: 0.15 },
      u_shininess: { value: 16 },

      u_sphereTexture: { value: this.sphereTexture },
      u_numSpheres: { value: this.sphereCoordinates.length + this.numBodies }
    };

    // Set material properties
    this.material.uniforms = this.uniforms;
    this.material.vertexShader = Vertex;
    this.material.fragmentShader = Fragment;

    this.scene.add(this.rayMarchPlane);

    this.VECTOR3ZERO = new THREE.Vector3(0, 0, 0);
    this.cameraForwardPos = this.camera.position.clone().add(this.camera.getWorldDirection(this.VECTOR3ZERO).multiplyScalar(this.camera.near));

    this.rayMarchPlane.position.copy(this.cameraForwardPos);

    /**
     * Animation Loop
     */
    this.animate()
  }

  addBalls() {
    for (let i = 0; i < this.numBodies; i++) {
      const body = this.getBall(RAPIER, this.world);
      this.bodies.push(body);
      // this.scene.add(body.mesh); // debug
    }
  }

  getBall(RAPIER, world) {
    const minSize = 0.04;
    const maxSize = 0.02;
    const size = minSize + Math.random() * (maxSize - minSize);
    const density = 100;

    // physics
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setLinearDamping(2);

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
      const force = dir.normalize().multiplyScalar(falloff * 0.05); // Adjust the base force as needed
      rigid.addForce(force, true); // Apply the force at the center of the body

      mesh.position.set(x, y, z);

      return { pos, size };
    }

    return { mesh, rigid, update: update.bind(this) };
  }

  loadAssets() {
    // const textureLoader = new THREE.TextureLoader(this.loadingManager)
  }

  addLight() {
    // add ambient light
    this.light = new THREE.DirectionalLight(0xffffff, 1);
    this.light.position.set(1, 1, 1);
    this.scene.add(this.light);
  }

  addHelpers() {
    const axisHelper = new THREE.AxesHelper(3)
    this.scene.add(axisHelper)

    this.stats = Stats()
    document.body.appendChild(this.stats.dom)
  }

  createSphereTexture() {
    this.addBalls();

    this.sphereCoordinates = logoCoordinates.split('\n').filter(line => line.trim() !== '');

    this.sphereData = new Float32Array(this.sphereCoordinates.length * 4 + this.numBodies * 4); // reserve for balls

    this.sphereCoordinates.forEach((line, index) => {
      const values = line.split(',').map(Number);

      this.sphereData[index * 4] = values[1];
      this.sphereData[index * 4 + 1] = values[2];
      this.sphereData[index * 4 + 2] = 0;
      this.sphereData[index * 4 + 3] = values[0];
    });

    this.sphereTexture = new THREE.DataTexture(
      this.sphereData,
      this.sphereCoordinates.length + this.numBodies, // width (number of spheres)
      1, // height
      THREE.RGBAFormat,
      THREE.FloatType
    );
  }

  animate() {
    this.world.step();

    // Update texture with current balls position
    this.bodies.forEach((body, index) => {
      const { pos, size } = body.update(index);
      this.sphereTexture.source.data.data[this.sphereTexture.source.data.data.length - (4 * index) - 4] = pos.x;
      this.sphereTexture.source.data.data[this.sphereTexture.source.data.data.length - (4 * index) - 3] = pos.y;
      this.sphereTexture.source.data.data[this.sphereTexture.source.data.data.length - (4 * index) - 2] = 0.02;
      this.sphereTexture.source.data.data[this.sphereTexture.source.data.data.length - (4 * index) - 1] = size;
    });

    this.sphereTexture.needsUpdate = true;

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
