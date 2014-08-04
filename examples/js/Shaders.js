THREE.ShaderLib[ "render_with_vt" ] = {
  uniforms: THREE.UniformsUtils.merge( [

    THREE.UniformsLib[ "vt" ],

    {
      "tDiffuse"     : { type: "t", value: null },
      "tNormal"    : { type: "t", value: null },
      "tSpecular"    : { type: "t", value: null },

      // light variables (from THREE)   
      ambientLightColor : { type: "fv", value: [] },

      directionalLightDirection : { type: "fv", value: [] },
      directionalLightColor : { type: "fv", value: [] },

      hemisphereLightDirection : { type: "fv", value: [] },
      hemisphereLightSkyColor : { type: "fv", value: [] },
      hemisphereLightGroundColor : { type: "fv", value: [] },

      pointLightColor : { type: "fv", value: [] },
      pointLightPosition : { type: "fv", value: [] },
      pointLightDistance : { type: "fv1", value: [] },

      spotLightColor : { type: "fv", value: [] },
      spotLightPosition : { type: "fv", value: [] },
      spotLightDirection : { type: "fv", value: [] },
      spotLightDistance : { type: "fv1", value: [] },
      spotLightAngleCos : { type: "fv1", value: [] },
      spotLightExponent : { type: "fv1", value: [] },       
    
      //
      enableDiffuse : { type: 'i', value: 0 },
      enableSpecular : { type: 'i', value: 0 },
      uNormalScale : { type: 'f', value: 1},

      //
      uDiffuseColor : { type: 'c', value: {r:1,g:1,b:1} },
      uSpecularColor : { type: 'c', value: {r:1,g:1,b:1} },
      uAmbientColor : { type: 'c', value: {r:1,g:1,b:1} },
    
      //
      uShininess : { type: 'f', value: 30.0 },
      uOpacity : { type: 'f', value: 1.0 },
      uOffset : { type: 'v2', value: {x:0,y:0} },
      uRepeat : { type: 'v2', value: {x:1,y:1} }

    }, // end of 
  ] ),
  //uniforms : 
  

  fragmentShader: [

    THREE.ShaderChunk["vt_pars_fragment"],
    
    "uniform sampler2D tDiffuse;",
    "uniform sampler2D tNormal;",
    "uniform sampler2D tSpecular;",

    "uniform vec3 uAmbientColor;",
    "uniform vec3 uDiffuseColor;",
    "uniform vec3 uSpecularColor;",
    "uniform float uShininess;",
    "uniform float uOpacity;",

    "uniform bool enableDiffuse;",
    "uniform bool enableSpecular;",
    "uniform float uNormalScale;",

    "varying vec3 vTangent;",
    "varying vec3 vBinormal;",
    "varying vec3 vNormal;",
    "varying vec2 vUv;",

    "uniform vec3 ambientLightColor;",

    "uniform vec3 pointLightColor[ MAX_POINT_LIGHTS ];",
    "varying vec4 vPointLight[ MAX_POINT_LIGHTS ];",
  
    "varying vec3 vViewPosition;",
  
    "void main() ",
    "{",
      "vec4 diffuseMap = texture2D(tDiffuse, vUv);",
      "vec4 normalMap = texture2D(tNormal, vUv);",
      "vec4 specularMap = texture2D(tSpecular, vUv);",

      "#ifdef VIRTUAL_TEXTURE",
        "vec2 UvCoords = computeUvCoords( vUv );",

        "diffuseMap = texture2D(tDiffuse, UvCoords);",
        "normalMap = texture2D(tNormal, UvCoords);",
        "specularMap = texture2D(tSpecular, UvCoords);",
      "#endif",

      "gl_FragColor = vec4( vec3( 1.0 ), uOpacity );",
      "gl_FragColor = gl_FragColor * diffuseMap * diffuseMap;",

      "vec3 specularTex = vec3( 1.0 );",
      "vec3 normalTex = normalMap.xyz * 2.0 - 1.0;",
      "normalTex = normalize( normalTex );",

      "specularTex = specularMap.xyz;",

      "mat3 tsb = mat3( normalize( vTangent ), normalize( vBinormal ), normalize( vNormal ) );",
      "vec3 finalNormal = tsb * normalTex;",
      "vec3 normal = normalize( finalNormal );",
      "vec3 viewPosition = normalize( vViewPosition );",

      // point lights

      "vec3 pointDiffuse = vec3( 0.0 );",
      "vec3 pointSpecular = vec3( 0.0 );",

      "for ( int i = 0; i < MAX_POINT_LIGHTS; i ++ ) {",

        "vec3 pointVector = normalize( vPointLight[ i ].xyz );",
        "float pointDistance = vPointLight[ i ].w;",

        // diffuse
        "float pointDiffuseWeight = max( dot( normal, pointVector ), 0.0 );",
        "pointDiffuse += pointDistance * pointLightColor[ i ] * uDiffuseColor * pointDiffuseWeight;",

        // specular
        "vec3 pointHalfVector = normalize( pointVector + viewPosition );",
        "float pointDotNormalHalf = max( dot( normal, pointHalfVector ), 0.0 );",
        "float pointSpecularWeight = specularTex.r * max( pow( pointDotNormalHalf, uShininess ), 0.0 );",
      
        // 2.0 => 2.0001 is hack to work around ANGLE bug
        "float specularNormalization = ( uShininess + 2.0001 ) / 8.0;",

        "vec3 schlick = uSpecularColor + vec3( 1.0 - uSpecularColor ) * pow( 1.0 - dot( pointVector, pointHalfVector ), 5.0 );",
        "pointSpecular += schlick * pointLightColor[ i ] * pointSpecularWeight * pointDiffuseWeight * pointDistance * specularNormalization;",
      "}",

      // all lights contribution summation
      "vec3 totalDiffuse = vec3( 0.0 );",
      "vec3 totalSpecular = vec3( 0.0 );",

      "totalDiffuse += pointDiffuse;",
      "totalSpecular += pointSpecular;",

      "gl_FragColor.xyz = gl_FragColor.xyz * ( totalDiffuse + ambientLightColor * uAmbientColor) + totalSpecular;",
      "gl_FragColor.xyz = sqrt( gl_FragColor.xyz );",
    "}"
          
  ].join("\n"), // end of fragment shader

  vertexShader: [
    "attribute vec4 tangent;",

    "uniform vec2 uOffset;",
    "uniform vec2 uRepeat;",

    "varying vec3 vTangent;",
    "varying vec3 vBinormal;",
    "varying vec3 vNormal;",
    "varying vec2 vUv;",

    "uniform vec3 pointLightPosition[ MAX_POINT_LIGHTS ];",
    "uniform float pointLightDistance[ MAX_POINT_LIGHTS ];",

    "varying vec4 vPointLight[ MAX_POINT_LIGHTS ];",
    "varying vec3 vViewPosition;",

    "void main() {",
    
      "vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );",
      "vViewPosition = -mvPosition.xyz;",

      // normal, tangent and binormal vectors
      "vNormal = normalMatrix * (normal);",
      "vTangent = normalMatrix * (tangent.xyz+0.000001);",
      "vBinormal = cross( vNormal, vTangent ) * tangent.w;",

      "vUv = uv * uRepeat + uOffset;",

      // point lights
      "for( int i = 0; i < MAX_POINT_LIGHTS; i++ ) {",

        "vec4 lPosition = viewMatrix * vec4( pointLightPosition[ i ], 1.0 );",
        "vec3 lVector = lPosition.xyz - mvPosition.xyz;",

        "float lDistance = 1.0;",
        "if ( pointLightDistance[ i ] > 0.0 )",
          "lDistance = 1.0 - min( ( length( lVector ) / pointLightDistance[ i ] ), 1.0 );",

        "lVector = normalize( lVector );",

        "vPointLight[ i ] = vec4( lVector, lDistance );", 

      "}",


      "gl_Position = projectionMatrix * mvPosition;",       
    "}"

  ].join("\n") // end of vertex shader
}