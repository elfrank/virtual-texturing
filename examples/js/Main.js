/**
 * @author Francico Avila - http://franciscoavila.mx
 */

var APP = {};

(function () {
  "use strict";

  /*global VT,THREE,Detector,requestAnimationFrame*/
  /*jslint browser: true*/

  /***************************************************************************
   * Global Variables
   */

  // three.js variables
  var scene = null;
  var renderer = null;
  var camera = null;
  var controls = null;
  var mesh = null;
  var clock = new THREE.Clock();

  var domContainer = null;
  var virtualTexture = null;

  /***************************************************************************
   * Initialiaze application
   */

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  function onKeyDown(e) {
    //1
    var uniforms = mesh.material.uniforms;

    if (49 === e.keyCode) {
      uniforms.bVirtualTextureDebugUvs.value = 0;
      uniforms.bVirtualTextureDebugDiscontinuities.value = 0;
      uniforms.bVirtualTextureDebugMipMapLevel.value = 0;

      uniforms.bVirtualTextureDebugUvs.needsUpdate = true;
      uniforms.bVirtualTextureDebugDiscontinuities.needsUpdate = true;
      uniforms.bVirtualTextureDebugMipMapLevel.needsUpdate = true;

    } else if (50 === e.keyCode) { //2
      uniforms.bVirtualTextureDebugUvs.value = 0;
      uniforms.bVirtualTextureDebugDiscontinuities.value = 0;
      uniforms.bVirtualTextureDebugMipMapLevel.value = 1;

      uniforms.bVirtualTextureDebugUvs.needsUpdate = true;
      uniforms.bVirtualTextureDebugDiscontinuities.needsUpdate = true;
      uniforms.bVirtualTextureDebugMipMapLevel.needsUpdate = true;

    } else if (51 === e.keyCode) { //3
      uniforms.bVirtualTextureDebugUvs.value = 1;
      uniforms.bVirtualTextureDebugDiscontinuities.value = 0;
      uniforms.bVirtualTextureDebugMipMapLevel.value = 0;

      uniforms.bVirtualTextureDebugUvs.needsUpdate = true;
      uniforms.bVirtualTextureDebugDiscontinuities.needsUpdate = true;
      uniforms.bVirtualTextureDebugMipMapLevel.needsUpdate = true;

    } else if (52 === e.keyCode) { //4
      uniforms.bVirtualTextureDebugUvs.value = 0;
      uniforms.bVirtualTextureDebugDiscontinuities.value = 1;
      uniforms.bVirtualTextureDebugMipMapLevel.value = 0;

      uniforms.bVirtualTextureDebugUvs.needsUpdate = true;
      uniforms.bVirtualTextureDebugDiscontinuities.needsUpdate = true;
      uniforms.bVirtualTextureDebugMipMapLevel.needsUpdate = true;

    }
  }

  function render() {
    if (virtualTexture && renderer.renderCount > 0) {
      virtualTexture.render(renderer, camera);
    }

    ++renderer.renderCount;
    renderer.render(scene, camera);
  }

  APP.run = function () {
    var delta = clock.getDelta();

    controls.update(delta);
    requestAnimationFrame(APP.run);

    render();
  };

  APP.start = function () {

    domContainer = document.getElementById("canvas_container");

  /*********************************************************************************/
    // if browsers supports webgl   
    if (Detector.webgl) {

      var width = window.innerWidth;
      var height = window.innerHeight;
      console.log("width:" + width + " height:" + height);

      renderer = new THREE.WebGLRenderer();
      renderer.gammaInput = true;
      renderer.gammaOutput = true;
      renderer.physicallyBasedShading = true;
      renderer.renderCount = 0;
      renderer.setSize(width, height);

      // OES_standard_derivaties used to compute mip level on virtual texturing
      renderer.context.getExtension("OES_standard_derivatives");
      renderer.context.getExtension("OES_texture_float");
      renderer.context.getExtension("OES_texture_float_linear");

      domContainer.appendChild(renderer.domElement);

      // create a scene
      scene = new THREE.Scene();

    /**********************************************************************************/

      // create lights and add them to the scene
      var lightFront = new THREE.PointLight(0xffffff, 1.5, 200); // light in front of model
      lightFront.position.set(-25, -25, 100);
      scene.add(lightFront);

      var lightBack = new THREE.PointLight(0xffffff, 1.5, 200); // light behind of model
      lightBack.position.set(-25, -25, -100);
      scene.add(lightBack);

    /**********************************************************************************/

      // put a camera in the scene
      camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 1000);
      camera.position.set(0.0, 0.0, 80.0);

      scene.add(camera);

    /**********************************************************************************/

      controls = new THREE.FlyControls(camera, renderer.domElement);
      controls.movementSpeed = 50;
      controls.domElement = renderer.domElement;
      controls.rollSpeed = Math.PI / 12;
      controls.autoForward = false;
      controls.dragToLook = true;

      /*controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.rotateSpeed = 1.0;
      controls.zoomSpeed = 5.0;
      controls.panSpeed = 0.8;
      controls.noZoom = false;
      controls.noPan = false;
      controls.staticMoving = false;
      controls.dynamicDampingFactor = 0.3;
      controls.keys = [65, 83, 68];*/

      window.addEventListener('keydown', onKeyDown, false);
      window.addEventListener('resize', resize, false);

      /**********************************************************************************/

      // start animation frame and rendering
      return true;
    }

    // if browser doesn't support webgl, load this instead
    console.error('There was a problem loading WebGL');
    return false;
  };

  APP.load = function (geometry, config) {

    // create virtual texture
    geometry.computeTangents();
    geometry.computeVertexNormals();

    virtualTexture = new THREE.VirtualTexture(renderer.context, config);
    var material = THREE.createVirtualTextureMaterial(virtualTexture);

    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    THREE.duplicateGeometryForVirtualTexturing(geometry, virtualTexture);
  };

}());
