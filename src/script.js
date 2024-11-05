/* eslint-disable semi */
/* eslint-disable space-before-function-paren */
import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Stats from 'three/examples/jsm/libs/stats.module'
import Vertex from './vertex.glsl'
import Fragment from './fragment.glsl'
import { createNoise2D } from 'simplex-noise'
import logoCoordinates from './logoCoordinates.txt'

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
    this.camera.position.z = 1

    this.clock = new THREE.Clock()

    this.time = Date.now()

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
      u_eps: { value: 0.001 },
      u_maxDis: { value: 1000 },
      u_maxSteps: { value: 1000 },

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

      u_time: { value: 0 },

      u_sphereTexture: { value: this.sphereTexture },
      u_numSpheres: { value: this.sphereCoordinates.length }
    };

    // Set material properties
    this.material.uniforms = this.uniforms;
    this.material.vertexShader = Vertex;
    this.material.fragmentShader = Fragment;

    this.scene.add(this.rayMarchPlane);

    this.cameraForwardPos = new THREE.Vector3(0, 0, -1);
    this.VECTOR3ZERO = new THREE.Vector3(0, 0, 0);

    /**
     * Animation Loop
     */
    this.animate()
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
    this.sphereCoordinates = logoCoordinates.split('\n').filter(line => line.trim() !== '');

    const sphereData = new Float32Array(this.sphereCoordinates.length * 4);

    this.sphereCoordinates.forEach((line, index) => {
      const values = line.split(',').map(Number);

      sphereData[index * 4] = values[1];
      sphereData[index * 4 + 1] = values[2];
      sphereData[index * 4 + 2] = values[3];
      sphereData[index * 4 + 3] = values[0];
    });

    this.sphereTexture = new THREE.DataTexture(
      sphereData,
      this.sphereCoordinates.length, // width (number of spheres)
      1, // height
      THREE.RGBAFormat,
      THREE.FloatType
    );

    this.sphereTexture.needsUpdate = true;
  }

  calculateStrength(radius, subtract) {
    // Calculate the strength based on the desired radius and subtract value
    const strength = subtract * (radius * radius);
    return strength;
  }

  animate() {
    const delta = this.clock.getDelta()
    this.time += delta * 0.5

    this.cameraForwardPos = this.camera.position.clone().add(this.camera.getWorldDirection(this.VECTOR3ZERO).multiplyScalar(this.camera.near));
    this.rayMarchPlane.position.copy(this.cameraForwardPos);
    this.rayMarchPlane.rotation.copy(this.camera.rotation);

    this.uniforms.u_time.value = (Date.now() - this.time) / 1000;

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
