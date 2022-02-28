const Shader = ({
  antialias,
  depthTest,
  vertex,
  fragment,
  onResize,
  children,
  style,
  className
}) => {
  const canvas = React.useRef(null)
  const wrapper = React.useRef(null)
  const [gl, setGl] = React.useState(null)
  const [program, setProgram] = React.useState(null)
  const [count, setCount] = React.useState(0)
  const [stage, setStage] = React.useState({ width: 0, height: 0 })

  React.useEffect(() => {
    const gl = canvas.current.getContext('webgl', { antialias })

    gl.enable(gl.BLEND)
    gl.enable(gl.CULL_FACE)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    gl[depthTest ? 'enable' : 'disable'](gl.DEPTH_TEST)

    const createShader = (type, source) => {
      const shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
      else {
        console.log(gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
      }
    }

    const program = gl.createProgram()
    gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertex))
    gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragment))
    gl.linkProgram(program)

    if (gl.getProgramParameter(program, gl.LINK_STATUS)) gl.useProgram(program)
    else {
      console.log(gl.getProgramInfoLog(program))
      gl.deleteProgram(program)
    }

    setGl(gl)
    setProgram(program)
  }, [])

  React.useEffect(() => {
    if (!gl || !program) return

    const onShaderResize = () => {
      const dpi = window.devicePixelRatio
      const { offsetWidth, offsetHeight } = wrapper.current
      const width = offsetWidth * dpi
      const height = offsetHeight * dpi

      canvas.current.width = width
      canvas.current.height = height

      gl.viewport(0, 0, width, height)
      gl.clearColor(0, 0, 0, 0)

      onResize(offsetWidth, offsetHeight, dpi)
      setStage({ width, height })
    }
    onShaderResize()

    window.addEventListener('resize', onShaderResize)
    return () => window.removeEventListener('resize', onShaderResize)
  }, [gl, program])

  React.useEffect(() => {
    if (count) gl.drawArrays(gl.POINTS, 0, count)
  })

  return (
    <div ref={wrapper} style={{ ...style }} className={className}>
      <canvas ref={canvas} style={{ display: 'block', width: '100%', height: '100%' }} />
      {gl !== null && program !== null && React.Children.map(children, child =>
        React.cloneElement(child, { gl, program, stage, setCount })
      )}
    </div>
  )
}

const Uniform = ({
  name,
  type,
  value,
  gl,
  program
}) => {
  const data = React.useRef({ update: () => {} })

  React.useEffect(() => {
    const location = gl.getUniformLocation(program, name)
    const update = ({
      'int': value => gl.uniform1i(location, value),
      'float': value => gl.uniform1f(location, value),
      'vec2': value => gl.uniform2f(location, ...value),
      'vec3': value => gl.uniform3f(location, ...value),
      'vec4': value => gl.uniform4f(location, ...value),
      'mat2': value => gl.uniformMatrix2fv(location, false, value),
      'mat3': value => gl.uniformMatrix3fv(location, false, value),
      'mat4': value => gl.uniformMatrix4fv(location, false, value)
    })[type]

    data.current = { update }
  }, [])

  React.useEffect(() => {
    const { update } = data.current
    update(value)
  }, [value])

  return null
}

const Attribute = ({
  name = '',
  size = 3,
  value = [],
  main = false,
  gl,
  program,
  setCount
}) => {
  const data = React.useRef({ update: () => {} })

  React.useEffect(() => {
    const index = gl.getAttribLocation(program, name)
    const buffer = gl.createBuffer()

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.enableVertexAttribArray(index)
    gl.vertexAttribPointer(index, size, gl.FLOAT, false, 0, 0)

    const update = value => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(value), gl.STATIC_DRAW)
    }

    data.current = { update }
  }, [])

  React.useEffect(() => {
    const { update } = data.current
    if (main === true) setCount(value.length / size)
    update(value)
  }, [value])

  return null
}

const Texture = ({
  src = null,
  gl
}) => {
  React.useEffect(() => {
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))

    const img = new Image()
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }
    img.src = src
  }, [])

  return null
}

const Camera = ({
  fov,
  near,
  far,
  position,
  target,
  perspective,
  gl,
  program,
  stage: { width, height }
}) => {
  const [projection, setProjection] = React.useState(Array.from({ length: 16 }))

  React.useEffect(() => {
    setProjection(createProjection({
      width,
      height,
      perspective,
      fov,
      near,
      far,
      position,
      target
    }))
  }, [fov, near, far, position, perspective, width, height])

  return (
    <Uniform name="u_projection" type="mat4" value={projection} gl={gl} program={program} />
  )
}

const createProjection = ({
  width,
  height,
  fov = 60,
  near = 1,
  far = 10000,
  position = [0, 0, 100],
  target = [0, 0, 0],
  perspective = true
}) => {
  if (perspective) {
    const aspect = width / height

    const fovRad = fov * (Math.PI / 180)
    const f = Math.tan(Math.PI / 2 - fovRad / 2)
    const rangeInv = 1.0 / (near - far)

    const projectionMatrix = [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (near + far) * rangeInv, -1,
      0, 0, near * far * rangeInv * 2, 0
    ]

    const normalize = v => {
      const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
      return (length > 0) ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 0]
    }

    const cross = (a, b) => ([
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ])

    const subtract = (a, b) => ([
      a[0] - b[0], a[1] - b[1], a[2] - b[2]
    ])

    const multiply = (a, b) => {
      return a.reduce((acc, val, idx) => {
        const i = Math.floor(idx / 4) * 4
        const j = idx % 4
        acc[idx] = b[i] * a[j] + b[i + 1] * a[j + 4] + b[i + 2] * a[j + 8] + b[i + 3] * a[j + 12]
        return acc
      }, [])
    }

    const inverse = a => {
      const b = [
        a[0] * a[5] - a[1] * a[4], a[0] * a[6] - a[2] * a[4],
        a[0] * a[7] - a[3] * a[4], a[1] * a[6] - a[2] * a[5],
        a[1] * a[7] - a[3] * a[5], a[2] * a[7] - a[3] * a[6],
        a[8] * a[13] - a[9] * a[12], a[8] * a[14] - a[10] * a[12],
        a[8] * a[15] - a[11] * a[12], a[9] * a[14] - a[10] * a[13],
        a[9] * a[15] - a[11] * a[13], a[10] * a[15] - a[11] * a[14]
      ]

      const det = 1.0 / (b[0] * b[11] - b[1] * b[10] + b[2] * b[9] + b[3] * b[8] - b[4] * b[7] + b[5] * b[6])

      return [
        (a[5] * b[11] - a[6] * b[10] + a[7] * b[9]) * det,
        (a[2] * b[10] - a[1] * b[11] - a[3] * b[9]) * det,
        (a[13] * b[5] - a[14] * b[4] + a[15] * b[3]) * det,
        (a[10] * b[4] - a[9] * b[5] - a[11] * b[3]) * det,
        (a[6] * b[8] - a[4] * b[11] - a[7] * b[7]) * det,
        (a[0] * b[11] - a[2] * b[8] + a[3] * b[7]) * det,
        (a[14] * b[2] - a[12] * b[5] - a[15] * b[1]) * det,
        (a[8] * b[5] - a[10] * b[2] + a[11] * b[1]) * det,
        (a[4] * b[10] - a[5] * b[8] + a[7] * b[6]) * det,
        (a[1] * b[8] - a[0] * b[10] - a[3] * b[6]) * det,
        (a[12] * b[4] - a[13] * b[2] + a[15] * b[0]) * det,
        (a[9] * b[2] - a[8] * b[4] - a[11] * b[0]) * det,
        (a[5] * b[7] - a[4] * b[9] - a[6] * b[6]) * det,
        (a[0] * b[9] - a[1] * b[7] + a[2] * b[6]) * det,
        (a[13] * b[1] - a[12] * b[3] - a[14] * b[0]) * det,
        (a[8] * b[3] - a[9] * b[1] + a[10] * b[0]) * det
      ]
    }

    const z = normalize(subtract(position, target))
    const x = normalize(cross([0, 1, 0], z))
    const y = normalize(cross(z, x))

    const cameraMatrix = [
      x[0], x[1], x[2], 0,
      y[0], y[1], y[2], 0,
      z[0], z[1], z[2], 0,
      position[0], position[1], position[2], 1
    ]

    return multiply(projectionMatrix, inverse(cameraMatrix))
  } else {
    return [
      2 / width, 0, 0, 0,
      0, -2 / height, 0, 0,
      0, 0, 1, 0,
      -1, 1, 0, 1
    ]
  }
}

const useAnimationFrame = cb => {
  const [, setRefresh] = React.useState(false)

  React.useEffect(() => {
    const start = performance.now()
    let old = start
    let raf = null

    const frame = () => {
      raf = requestAnimationFrame(frame)

      const now = performance.now()
      const delta = (now - old)
      const elapsed = (now - start) / 5000
      old = now

      setRefresh(f => !f)
      cb(delta, elapsed)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])
}
