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
import { GUI } from 'dat.gui'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import main from '../assets/hdri/main.hdr';
import background from '../assets/images/background.png';

export default class ThreeJsDraft {
  constructor() {
    /**
     * Variables
    */

    this.scalingFactor = 1

    this.canvas = document.getElementById('bubbles');

    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width * this.scalingFactor;
    this.height = rect.height * this.scalingFactor;

    this.debug = true

    this.MAIN_COLOR = 0x007FFF;

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
    this.camera.position.z = 0.75

    /**
     * Renderer
     */
    this.renderTarget = new THREE.WebGLRenderTarget(this.width / 1, this.height / 1);

    // Setup for rendering the low-res result to screen
    this.fullscreenQuad = new THREE.Mesh(
      new THREE.PlaneBufferGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
        fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tDiffuse, vUv);
        }
      `,
        uniforms: {
          tDiffuse: { value: this.renderTarget.texture }
        }
      })
    );
    this.fullscreenScene = new THREE.Scene();
    this.fullscreenScene.add(this.fullscreenQuad);
    this.fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas
    })

    this.renderer.setSize(this.width, this.height)
    this.renderer.setPixelRatio(1)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.physicallyCorrectLights = true;

    this.backgroundColor = new THREE.Color(0x50a9df);
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
    this.numBalls = 10;
    this.balls = []
    this.textBalls = []

    this.radiusValues = {
      textSpheresRadius: { value: 0.025 },
      ballSpheresRadius: { value: 0.1 }
    }

    /**
     * Resize
     */
    window.addEventListener('resize', () => {
      const rect = this.canvas.getBoundingClientRect();
      this.width = rect.width * this.scalingFactor;
      this.height = rect.height * this.scalingFactor;

      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
      this.setRayMarchPlaneScale();
    }, false);

    this.canvas.addEventListener('mousemove', (event) => {
      this.mouseX = event.clientX
      this.mouseY = event.clientY

      const mousePosition = new THREE.Vector3(
        (this.mouseX / window.innerWidth) * 2 - 1,
        -(this.mouseY / window.innerHeight) * 2 + 1,
        0
      ).multiplyScalar(1 / this.scalingFactor)

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
  }

  getTextBall(gravitationCenter, radius) {
    // Adjust density inversely proportional to radius
    const density = radius;

    // Adjust damping based on radius (smaller balls have less damping)
    const damping = radius * 1000000;

    const initialPosition = gravitationCenter;

    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setLinearDamping(damping)
      .setTranslation(initialPosition.x, initialPosition.y, initialPosition.z)
      .setLinvel(0, 0, 0); // Set initial linear velocity to zero

    const rigid = this.world.createRigidBody(rigidBodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(radius)
      .setDensity(density)
      .setCollisionGroups(0b01 | (0b10 << 16));

    this.world.createCollider(colliderDesc, rigid);

    // Ball geometry and material
    const geometry = new THREE.IcosahedronGeometry(radius, 1);
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
      rigid.resetForces(true);

      const { x, y, z } = rigid.translation();

      const pos = new THREE.Vector3(x, y, z);

      const dir = gravitationCenter.clone().sub(pos);

      const baseForceMagnitude = 0.0001;

      const forceMagnitude = baseForceMagnitude * radius;

      const force = dir.normalize().multiplyScalar(forceMagnitude);
      rigid.addForce(force, true);

      mesh.position.set(x, y, z);

      return { pos, radius };
    }

    return { mesh, rigid, update: update.bind(this) };
  }

  getBall() {
    const minSize = 0.03;
    const maxSize = 0.05;
    const size = minSize + Math.random() * (maxSize - minSize);

    const baseDamping = 5;
    const baseForce = 0.005;

    const density = size;

    // physics
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic();

    const rigid = this.world.createRigidBody(rigidBodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(size)
      .setDensity(density)
      .setCollisionGroups(0b10 | ((0b01 | 0b10) << 16)); // Group 0b10, collides with 0b01 and 0b10

    this.world.createCollider(colliderDesc, rigid);

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

      // let falloff = index === 0 || index === 1 || index === 2 ? 1 : 1 * Math.exp(-distance * 0.5);

      let gravitationFieldFactor;

      gravitationFieldFactor = Math.exp(-distance);

      if (gravitationFieldFactor < 0.05) {
        gravitationFieldFactor = 0;
      }

      const forceValue = gravitationFieldFactor * baseForce * size

      // const dampingFactor = 1 / distance; // Increase damping as the distance decreases
      // console.log(dampingFactor);

      rigid.setLinearDamping(baseDamping);

      // Apply force based on direction and falloff (scaled force)
      const force = dir.normalize().multiplyScalar(forceValue); // Adjust the base force as needed
      rigid.addForce(force, true); // Apply the force at the center of the body

      mesh.position.set(x, y, z);

      return { pos, size };
    }

    return { mesh, rigid, update: update.bind(this) };
  }

  setRayMarchPlaneScale() {
    // Get the wdith and height of the near plane
    const nearPlaneWidth = this.camera.near * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect * 2;
    const nearPlaneHeight = nearPlaneWidth / this.camera.aspect;

    // Scale the ray marching plane
    this.rayMarchPlane.scale.set(nearPlaneWidth, nearPlaneHeight, 1);
  }

  loadAssets() {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    new RGBELoader(this.loadingManager)
      .setDataType(THREE.FloatType)
      .load(main, (hdrEquirect) => {
        // Apply environment map to the scene for lighting and reflections
        hdrEquirect.mapping = THREE.EquirectangularReflectionMapping;
        this.scene.environment = hdrEquirect; // Set HDRI as environment map
        this.scene.background = hdrEquirect; // Optional: Set HDRI as background

        this.bgTexture = new THREE.TextureLoader().load(background);

        this.createSphereTexture()

        // Create a ray marching plane
        const geometry = new THREE.PlaneGeometry();
        this.material = new THREE.ShaderMaterial();
        this.rayMarchPlane = new THREE.Mesh(geometry, this.material)

        this.setRayMarchPlaneScale();

        this.uniforms = {
          u_eps: { value: 0.001 },
          u_maxDis: { value: 2 },
          u_maxSteps: { value: 500 },
          u_envMap: { value: hdrEquirect },
          u_camPos: { value: this.camera.position },
          u_camToWorldMat: { value: this.camera.matrixWorld },
          u_camInvProjMat: { value: this.camera.projectionMatrixInverse },
          u_sphereKValues: { value: this.sphereKValues },
          u_sphereTexture: { value: this.sphereTexture },
          u_numSpheres: { value: this.sphereCoordinates.length + this.numBalls },
          u_backgroundTexture: { value: this.bgTexture },
          u_mainColor: { value: new THREE.Color(this.MAIN_COLOR) },

          u_roughness: { value: 0.7 },
          u_reflectionFactor: { value: 0.02 },
          u_transparency: { value: 0 },
          u_saturation: { value: 2 },
          u_ambientOcclusionAttenuation: { value: 0.8 }
        };

        this.addHelpers()

        // Set material properties
        this.material.uniforms = this.uniforms;
        this.material.vertexShader = Vertex;
        this.material.fragmentShader = Fragment;

        if (!this.debug) {
          this.scene.add(this.rayMarchPlane);
        }

        this.VECTOR3ZERO = new THREE.Vector3(0, 0, 0);
        this.cameraForwardPos = this.camera.position.clone().add(this.camera.getWorldDirection(this.VECTOR3ZERO).multiplyScalar(this.camera.near));

        this.rayMarchPlane.position.copy(this.cameraForwardPos);

        /**
         * Animation Loop
         */
        this.animate()
      });
  }

  addHelpers() {
    const axisHelper = new THREE.AxesHelper(3)
    this.scene.add(axisHelper)

    // use dat ui
    const gui = new GUI()

    const onChange = () => {
      for (let i = 0; i < this.sphereCoordinates.length; i++) {
        this.sphereKValues[i] = this.radiusValues.textSpheresRadius.value;
      }

      for (let i = 0; i < this.balls.length; i++) {
        this.sphereKValues[i + this.sphereCoordinates.length] = this.radiusValues.ballSpheresRadius.value;
      }
    }

    gui.add(this.radiusValues.textSpheresRadius, 'value', 0.005, 0.05).step(0.005).name('Logo Balls Radius').onChange(onChange)
    gui.add(this.radiusValues.ballSpheresRadius, 'value', 0.05, 0.2).step(0.01).name('Mouse Balls Radius').onChange(onChange)
    // gui.add(this.uniforms.u_reflectionFactor, 'value', 0, 1).step(0.01).name('Reflection');
    gui.add(this.uniforms.u_roughness, 'value', 0, 1).step(0.01).name('Roughness');
    gui.add(this.uniforms.u_saturation, 'value', 0, 5).step(0.01).name('Saturation');
    gui.add(this.uniforms.u_ambientOcclusionAttenuation, 'value', 0, 1).step(0.01).name('Ambient Occlusion');

    this.stats = Stats()
    document.body.appendChild(this.stats.dom)
  }

  createSphereTexture() {
    this.sphereKValues = [];
    this.sphereCoordinates = logoCoordinates.split('\n').filter(line => line.trim() !== '');
    this.sphereData = new Float32Array(this.sphereCoordinates.length * 4 + this.numBalls * 4); // reserve for balls

    this.sphereCoordinates.forEach((line) => {
      const values = line.split(',').map(Number);
      const textBall = this.getTextBall(new THREE.Vector3(values[1], values[2], values[3]), values[0])

      if (this.debug) {
        this.scene.add(textBall.mesh);
      }

      this.textBalls.push(textBall);
      this.sphereKValues.push(this.radiusValues.textSpheresRadius.value);
    });

    for (let i = 0; i < this.numBalls; i++) {
      const body = this.getBall();
      this.balls.push(body);

      if (this.debug) {
        this.scene.add(body.mesh);
      }

      this.sphereKValues.push(this.radiusValues.ballSpheresRadius.value);
    };

    this.sphereTexture = new THREE.DataTexture(
      this.sphereData,
      this.sphereCoordinates.length + this.numBalls, // width (number of spheres)
      1, // height
      THREE.RGBAFormat,
      THREE.FloatType
    );
  }

  animate() {
    window.requestAnimationFrame(this.animate.bind(this));

    this.world.step();

    // Update texture with current balls position
    this.balls.forEach((ball, index) => {
      const { pos, size } = ball.update(index);
      this.sphereTexture.source.data.data[this.sphereTexture.source.data.data.length - (4 * index) - 4] = pos.x;
      this.sphereTexture.source.data.data[this.sphereTexture.source.data.data.length - (4 * index) - 3] = pos.y;
      this.sphereTexture.source.data.data[this.sphereTexture.source.data.data.length - (4 * index) - 2] = pos.z;
      this.sphereTexture.source.data.data[this.sphereTexture.source.data.data.length - (4 * index) - 1] = size;
    });

    this.textBalls.forEach((ball, index) => {
      const { pos, radius } = ball.update(index);
      this.sphereTexture.source.data.data[4 * index] = pos.x;
      this.sphereTexture.source.data.data[4 * index + 1] = pos.y;
      this.sphereTexture.source.data.data[4 * index + 2] = pos.z;
      this.sphereTexture.source.data.data[4 * index + 3] = radius;
    });

    this.sphereTexture.needsUpdate = true;

    this.orbitControls.update()
    this.stats.update()
    // this.renderer.render(this.scene, this.camera)

    // Render to the low-resolution render target
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.camera);

    // Render the low-resolution result to the screen
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.fullscreenScene, this.fullscreenCamera);
  }
}

/**
 * Create ThreeJsDraft
 */
// eslint-disable-next-line no-new
window.ThreeJsDraft = new ThreeJsDraft()
