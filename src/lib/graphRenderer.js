/**
 * Il disegno della rete dei progetti in WebGL2, senza librerie: le bolle sono quadrati istanziati con l'icona presa da un atlante di texture
 * (maschera circolare, bordo e alone nello shader); le sinapsi sono curve quadratiche a nastro con un impulso luminoso che scorre lungo la linea.
 * Il canvas è trasparente (sotto c'è lo sfondo dell'app). Le etichette non si disegnano qui: sono testo HTML sopra il canvas.
 * Il chiamante tiene la fisica (graphLayout.js) e passa a `draw` le posizioni in coordinate del mondo (origine al centro) e la camera.
 */
const CELL = 128 // lato di una cella dell'atlante, in pixel
const COLUMNS = 8
// Ogni sinapsi si disegna a pezzi (PIECES), ognuno con la sua profondità: così passa davanti alle bolle che ha davanti e dietro a quelle che ha dietro (vedi `draw`).
const PIECES = 12
const PIECE_SEGMENTS = 4 // tratti di ogni pezzo

const BACKDROP_VERTEX = `#version 300 es
void main() {
  // Un triangolo che copre tutto lo schermo, senza buffer.
  vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
}`

// Lo sfondo: un piano grigio con vista d'orizzonte. Il cielo si schiarisce verso l'orizzonte, il piano è una griglia in prospettiva che svanisce nella foschia,
// i bordi si scuriscono. Sempre grigi neutri (indipendenti dal tema). Con la vista che si sposta la griglia scorre piano (parallasse: è lontana).
const BACKDROP_FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 canvasSize;
uniform vec2 pan;
uniform float zoom;
uniform float time;
out vec4 color;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = gl_FragCoord.xy / canvasSize;
  float t = 1.0 - uv.y;                 // 0 in alto, 1 in basso
  float aspect = canvasSize.x / canvasSize.y;
  float horizon = 0.34;
  vec3 skyTop = vec3(0.070, 0.070, 0.078);
  // All'orizzonte cielo e piano hanno lo STESSO grigio: nessun salto di colore, la linea si scioglie.
  vec3 skyLow = vec3(0.190, 0.190, 0.205);
  vec3 floorFar = skyLow;
  vec3 floorNear = vec3(0.078, 0.078, 0.086);
  vec3 col;
  if (t < horizon) {
    col = mix(skyTop, skyLow, pow(t / horizon, 1.9));
  } else {
    float d = (t - horizon) / (1.0 - horizon);          // 0 all'orizzonte, 1 in basso
    col = mix(floorFar, floorNear, pow(d, 0.5));
    float depth = 1.0 / max(d, 0.003);                  // 1 vicino, grande lontano
    float scale = 1.35 * pow(zoom, 0.5);
    vec2 plane = vec2((uv.x - 0.5) * aspect * depth, depth) * scale;
    plane += vec2(pan.x, pan.y + time * 14.0) * 0.0032;
    vec2 cell = abs(fract(plane - 0.5) - 0.5) / max(fwidth(plane), vec2(1e-5));
    float line = 1.0 - min(min(cell.x, cell.y), 1.0);
    float near = smoothstep(0.04, 0.5, d);              // lontano le linee si perdono nella foschia
    col += vec3(0.50, 0.50, 0.54) * line * 0.15 * near;
  }
  // Foschia all'orizzonte: una fascia chiara che unisce cielo e piano.
  // Più larga sopra che sotto (la luce si perde nel cielo) e più tenue: luminosità e foschia si fondono senza un bordo.
  float spread = t < horizon ? 0.16 : 0.10;
  float haze = exp(-pow((t - horizon) / spread, 2.0));
  col = mix(col, vec3(0.262, 0.262, 0.280), haze * 0.50);
  // Bordi più scuri: attira lo sguardo al centro.
  float vignette = smoothstep(1.05, 0.30, length((uv - 0.5) * vec2(aspect * 0.75, 1.0)));
  col *= mix(0.66, 1.0, vignette);
  // Un velo di rumore: niente "scalini" nelle sfumature scure.
  col += (hash(gl_FragCoord.xy + fract(time)) - 0.5) / 255.0;
  color = vec4(col, 1.0);
}`

const NODE_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 corner;
layout(location = 1) in vec4 body;   // centro (x, y), raggio, indice cella
layout(location = 2) in vec4 mood;   // evidenziata, attenuata, tipo (0 normale, 1 non connesso), peso (0-1: più è grande il progetto, più la bolla ha rilievo)
uniform vec2 resolution;
uniform vec2 pan;
uniform float zoom;
out vec2 local;
out float cell;
out vec4 moodOut;
void main() {
  float reach = body.z * 1.7;
  vec2 world = body.xy + corner * reach;
  vec2 screen = (world - pan) * zoom;
  gl_Position = vec4(screen.x / (resolution.x * 0.5), -screen.y / (resolution.y * 0.5), 0.0, 1.0);
  local = corner * 1.7;
  cell = body.w;
  moodOut = mood;
}`

const NODE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 local;
in float cell;
in vec4 moodOut;
uniform sampler2D atlas;
uniform vec2 atlasGrid;   // colonne, righe
uniform vec3 accent;
uniform vec3 border;
uniform float time;
out vec4 color;
void main() {
  float r = length(local);
  float edge = fwidth(r) * 1.2;
  float body = 1.0 - smoothstep(1.0 - edge, 1.0, r);
  // Rilievo: la bolla è una calotta sferica illuminata dall'alto a sinistra. Il peso (grandezza del progetto) decide quanto è marcata:
  // i progetti grandi sono sfere piene e nette, i piccoli quasi piatti.
  float weight = moodOut.w;
  float depth = 0.28 + 0.72 * weight;
  vec2 flat2 = clamp(local, vec2(-1.0), vec2(1.0));
  float z = sqrt(max(0.0, 1.0 - min(dot(flat2, flat2), 1.0)));
  vec3 normal = normalize(vec3(flat2, z));
  // L'icona si vede intera e non ingrandita, come nell'avatar dell'elenco: il rilievo viene solo dalla luce, mai da una deformazione dell'immagine.
  vec2 uv = local * 0.5 + 0.5;
  float column = mod(cell, atlasGrid.x);
  float row = floor(cell / atlasGrid.x);
  vec2 atlasUv = (vec2(column, row) + clamp(uv, 0.0, 1.0)) / atlasGrid;
  vec4 icon = texture(atlas, atlasUv);
  vec3 face = mix(border * 0.55, icon.rgb, icon.a);
  vec3 lightDir = normalize(vec3(-0.45, -0.62, 0.64));
  float diffuse = max(dot(normal, lightDir), 0.0);
  float specular = pow(max(dot(reflect(-lightDir, normal), vec3(0.0, 0.0, 1.0)), 0.0), 26.0);
  float rimLight = pow(1.0 - z, 3.0);
  face = face * mix(1.0, 0.50 + 0.66 * diffuse, depth)
       + vec3(1.0) * specular * (0.10 + 0.42 * depth)
       + accent * rimLight * 0.22 * depth;
  // Bordo sottile (circa il 3% del raggio, come nell'avatar dell'elenco): uno più largo copriva i margini dell'icona.
  float ring = smoothstep(0.95, 0.975, r) * body;
  float lit = moodOut.x;
  vec3 rim = mix(border, accent, lit);
  vec3 rgb = mix(face, rim, ring);
  // Alone: sempre leggero, forte quando la bolla è evidenziata; le bolle non connesse "respirano" piano.
  float glowShape = exp(-pow(max(r - 1.0, 0.0) * 2.6, 2.0));
  float breath = moodOut.z > 0.5 ? 0.5 + 0.5 * sin(time * 0.9 + cell * 1.7) : 0.0;
  float glow = glowShape * (0.12 + 0.18 * breath + 0.75 * lit) * (1.0 - body);
  float fade = 1.0 - 0.72 * moodOut.y;
  float alpha = (body + glow) * fade;
  vec3 mixed = (rgb * body + accent * glow) * fade;
  color = vec4(mixed, alpha);
}`

const EDGE_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec4 ends;    // a (x, y), b (x, y)
layout(location = 1) in vec4 style;   // peso, curva, fase, evidenziata
layout(location = 2) in vec2 reach;   // quanto si vede la sinapsi all'estremo a e all'estremo b (1 sempre; in una ricerca 0 per chi è escluso)
layout(location = 3) in vec2 range;   // il tratto della curva che questo pezzo disegna: da t0 a t1 (0-1)
uniform vec2 resolution;
uniform vec2 pan;
uniform float zoom;
out float along;
out float across;
out vec4 styleOut;
out vec2 reachOut;
out float lengthOut;
void main() {
  int id = gl_VertexID;
  float t = mix(range.x, range.y, float(id / 2) / float(${PIECE_SEGMENTS}));
  float side = float(id % 2) * 2.0 - 1.0;
  vec2 a = ends.xy;
  vec2 b = ends.zw;
  vec2 delta = b - a;
  float len = max(length(delta), 1.0);
  vec2 normal = vec2(-delta.y, delta.x) / len;
  vec2 control = (a + b) * 0.5 + normal * len * style.y;
  float u = 1.0 - t;
  vec2 point = u * u * a + 2.0 * u * t * control + t * t * b;
  vec2 tangent = normalize(2.0 * u * (control - a) + 2.0 * t * (b - control));
  vec2 offsetDir = vec2(-tangent.y, tangent.x);
  // Peso negativo = il filo che lega un satellite al padre: più sottile, tratteggiato (vedi il frammento).
  float tether = style.x < 0.0 ? 1.0 : 0.0;
  float width = mix(1.2 + 2.6 * style.x + 2.2 * style.w, 0.85 + 0.9 * style.w, tether) / zoom;
  vec2 world = point + offsetDir * side * width;
  vec2 screen = (world - pan) * zoom;
  gl_Position = vec4(screen.x / (resolution.x * 0.5), -screen.y / (resolution.y * 0.5), 0.0, 1.0);
  along = t;
  across = side;
  styleOut = style;
  reachOut = reach;
  lengthOut = len;
}`

const EDGE_FRAGMENT = `#version 300 es
precision highp float;
in float along;
in float across;
in vec4 styleOut;
in vec2 reachOut;
in float lengthOut;
uniform vec3 accent;
uniform float time;
uniform float dim;
out vec4 color;
void main() {
  float lit = styleOut.w;
  float core = 1.0 - smoothstep(0.35, 1.0, abs(across));
  if (styleOut.x < 0.0) {
    // Il filo del satellite: tratti e vuoti regolari (non pulsa come una sinapsi), sempre dello stesso colore accento.
    float dash = smoothstep(0.30, 0.42, abs(fract(along * lengthOut / 8.0) - 0.5) * 2.0);
    float seen = mix(reachOut.x, reachOut.y, smoothstep(0.25, 0.75, along));
    float a = core * dash * (0.62 + 0.38 * lit) * (1.0 - dim * (1.0 - lit)) * seen * seen;
    color = vec4(accent * a, a);
    return;
  }
  float weight = styleOut.x;
  // L'impulso: una piccola onda luminosa che percorre la sinapsi; le più forti pulsano più spesso.
  float speed = 0.18 + 0.22 * weight;
  float head = fract(time * speed + styleOut.z);
  float gap = abs(along - head);
  gap = min(gap, 1.0 - gap);
  float pulse = exp(-pow(gap * 9.0, 2.0));
  float base = 0.16 + 0.34 * weight + 0.35 * lit;
  // Durante una ricerca la sinapsi si interrompe verso un progetto escluso: svanisce dal lato di chi ha risultati, e sparisce se lo sono entrambi.
  float visible = mix(reachOut.x, reachOut.y, smoothstep(0.25, 0.75, along));
  float alpha = core * (base + pulse * (0.45 + 0.4 * weight)) * (1.0 - dim * (1.0 - lit)) * mix(0.0, 1.0, visible * visible);
  color = vec4(accent * alpha, alpha);
}`

function compile(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    // Senza messaggio, di solito il contesto è perso (canvas già usato o scheda video in difficoltà).
    throw new Error(`${type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment'} shader: ${log || (gl.isContextLost() ? 'the WebGL context was lost' : 'compile error')}`)
  }
  return shader
}

function program(gl, vertex, fragment) {
  const result = gl.createProgram()
  gl.attachShader(result, compile(gl, gl.VERTEX_SHADER, vertex))
  gl.attachShader(result, compile(gl, gl.FRAGMENT_SHADER, fragment))
  gl.linkProgram(result)
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result) || 'Program link error')
  return result
}

// Un colore delle variabili CSS del tema ("190 190 186") come tre numeri 0-1.
export function cssColor(name, fallback = [0.75, 0.75, 0.73], element = document.documentElement) {
  try {
    const parts = getComputedStyle(element).getPropertyValue(name).trim().split(/\s+/).map(Number)
    if (parts.length >= 3 && parts.every((value) => Number.isFinite(value))) return parts.slice(0, 3).map((value) => value / 255)
  } catch { /* si usa il colore di riserva */ }
  return fallback
}

export function webglAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2'))
  } catch { return false }
}

// L'atlante: una cella per progetto. L'icona (o, senza, un cerchio con l'iniziale) è disegnata a 128 px; il tondo lo fa lo shader.
function buildAtlas(entries) {
  const rows = Math.max(1, Math.ceil(entries.length / COLUMNS))
  const canvas = document.createElement('canvas')
  canvas.width = COLUMNS * CELL
  canvas.height = rows * CELL
  const context = canvas.getContext('2d')
  entries.forEach((entry, index) => drawCell(context, (index % COLUMNS) * CELL, Math.floor(index / COLUMNS) * CELL, entry))
  return { canvas, rows }
}

// Il carattere dell'interfaccia (quello del documento), per le iniziali dei progetti senza icona.
const interfaceFont = () => { try { return getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif' } catch { return 'system-ui, sans-serif' } }

// Disegna una cella dell'atlante: l'icona ritagliata al quadrato centrale o, senza immagine, un tondo sfumato con l'iniziale.
function drawCell(context, x, y, entry) {
  if (entry.image) {
    // Un'immagine (naturalWidth) o un fotogramma già decodificato (ImageBitmap: width).
    const imageWidth = entry.image.naturalWidth || entry.image.width || CELL
    const imageHeight = entry.image.naturalHeight || entry.image.height || CELL
    const side = Math.min(imageWidth, imageHeight) || CELL
    const sx = (imageWidth - side) / 2
    const sy = (imageHeight - side) / 2
    context.fillStyle = 'rgba(30,30,32,1)'
    context.fillRect(x, y, CELL, CELL)
    context.drawImage(entry.image, sx, sy, side, side, x, y, CELL, CELL)
  } else {
    const hue = entry.hue ?? 0
    const gradient = context.createLinearGradient(x, y, x + CELL, y + CELL)
    gradient.addColorStop(0, `hsl(${hue} 18% 26%)`)
    gradient.addColorStop(1, `hsl(${(hue + 40) % 360} 16% 17%)`)
    context.fillStyle = gradient
    context.fillRect(x, y, CELL, CELL)
    // L'iniziale è centrata come nell'avatar dell'elenco (ProjectIcon.jsx): stesso carattere dell'interfaccia, stessa proporzione (0,4 del lato) e centro
    // dell'area del carattere (ascendente e discendente del font) al centro, come fa CSS con `items-center`.
    context.fillStyle = 'rgba(235,235,230,0.92)'
    context.font = `600 ${Math.round(CELL * 0.4)}px ${interfaceFont()}`
    context.textAlign = 'center'
    context.textBaseline = 'alphabetic'
    const letter = entry.initial || '?'
    const metrics = context.measureText(letter)
    const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent
    const descent = metrics.fontBoundingBoxDescent ?? 0
    context.fillText(letter, x + CELL / 2, y + CELL / 2 + (ascent - descent) / 2)
  }
}

export function createGraphRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true })
  if (!gl) throw new Error('WebGL2 is not available')
  const backdropProgram = program(gl, BACKDROP_VERTEX, BACKDROP_FRAGMENT)
  const nodeProgram = program(gl, NODE_VERTEX, NODE_FRAGMENT)
  const edgeProgram = program(gl, EDGE_VERTEX, EDGE_FRAGMENT)
  const locations = (prog, names) => Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(prog, name)]))
  const backdropUniform = locations(backdropProgram, ['canvasSize', 'pan', 'zoom', 'time'])
  const nodeUniform = locations(nodeProgram, ['resolution', 'pan', 'zoom', 'atlas', 'atlasGrid', 'accent', 'border', 'time'])
  const edgeUniform = locations(edgeProgram, ['resolution', 'pan', 'zoom', 'accent', 'time', 'dim'])

  // Geometria condivisa: un quadrato da -1 a 1 (le bolle).
  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

  const nodeBuffer = gl.createBuffer()
  const nodeVao = gl.createVertexArray()
  gl.bindVertexArray(nodeVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ARRAY_BUFFER, nodeBuffer)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0)
  gl.vertexAttribDivisor(1, 1)
  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16)
  gl.vertexAttribDivisor(2, 1)

  const edgeBuffer = gl.createBuffer()
  const edgeVao = gl.createVertexArray()
  gl.bindVertexArray(edgeVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuffer)
  // I puntatori degli attributi si impostano a ogni tratto di `draw` (partono dal primo elemento del tratto).
  for (const location of [0, 1, 2, 3]) {
    gl.enableVertexAttribArray(location)
    gl.vertexAttribDivisor(location, 1)
  }
  gl.bindVertexArray(null)

  const texture = gl.createTexture()
  const emptyVao = gl.createVertexArray() // lo sfondo non ha attributi
  let atlasRows = 1
  let atlasEntries = []
  let cellCanvas = null
  let nodeData = new Float32Array(0)
  let edgeData = new Float32Array(0)
  let disposed = false

  // `entries`: [{ image: HTMLImageElement | null, initial, hue }] nell'ordine dei nodi.
  function setIcons(entries) {
    const { canvas: atlas, rows } = buildAtlas(entries)
    atlasRows = rows
    atlasEntries = entries
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  // Icone animate (GIF, WebP): si ridisegnano solo le loro celle (il fotogramma corrente dell'immagine) e si caricano nella texture senza rifare l'atlante.
  function refreshCells(indices) {
    if (disposed || !indices.length) return
    if (!cellCanvas) { cellCanvas = document.createElement('canvas'); cellCanvas.width = CELL; cellCanvas.height = CELL }
    const context = cellCanvas.getContext('2d')
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    for (const index of indices) {
      const entry = atlasEntries[index]
      if (!entry) continue
      context.clearRect(0, 0, CELL, CELL)
      drawCell(context, 0, 0, entry)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, (index % COLUMNS) * CELL, Math.floor(index / COLUMNS) * CELL, gl.RGBA, gl.UNSIGNED_BYTE, cellCanvas)
    }
    gl.generateMipmap(gl.TEXTURE_2D)
  }

  function resize() {
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
    return { width: canvas.clientWidth, height: canvas.clientHeight }
  }

  /**
   * frame: { time, still, pan: [x, y], zoom, colors: { accent, border },
   *          nodes: [{ x, y, r, cell, lit, dim, free, weight }], edges: [{ ax, ay, bx, by, weight, curve, phase, lit, reachA, reachB }], dim }
   */
  function draw(frame) {
    if (disposed) return
    const size = resize()
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    // Prima lo sfondo (opaco, senza miscelazione), poi sinapsi e bolle.
    gl.disable(gl.BLEND)
    gl.useProgram(backdropProgram)
    gl.uniform2f(backdropUniform.canvasSize, canvas.width, canvas.height)
    gl.uniform2f(backdropUniform.pan, frame.pan[0], frame.pan[1])
    gl.uniform1f(backdropUniform.zoom, frame.zoom)
    gl.uniform1f(backdropUniform.time, frame.still ? 0 : frame.time)
    gl.bindVertexArray(emptyVao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    // Profondità: le sinapsi e le bolle si disegnano insieme, dalle più lontane alle più vicine (algoritmo del pittore). Una sinapsi è a pezzi, ognuno alla sua
    // profondità, così passa sopra una bolla che ha dietro e sotto una che ha davanti. Una bolla conta dalla sua superficie più vicina (z − r): i pezzi che
    // la raggiungono dal suo stesso centro restano dietro di lei.
    const EDGE_FLOATS = 12
    const NODE_FLOATS = 8
    const items = []
    frame.edges.forEach((edge, index) => {
      const startZ = edge.az || 0
      const endZ = edge.bz || 0
      for (let piece = 0; piece < PIECES; piece += 1) items.push({ kind: 1, source: index, piece, z: startZ + (endZ - startZ) * ((piece + 0.5) / PIECES) })
    })
    frame.nodes.forEach((node, index) => items.push({ kind: 0, source: index, z: (node.z || 0) - node.r }))
    // I pareggi: la sinapsi prima della bolla (arriva al suo centro e vi finisce dietro).
    items.sort((x, y) => (y.z - x.z) || (y.kind - x.kind))

    if (edgeData.length < items.length * EDGE_FLOATS) edgeData = new Float32Array(items.length * EDGE_FLOATS * 2)
    if (nodeData.length < frame.nodes.length * NODE_FLOATS) nodeData = new Float32Array(frame.nodes.length * NODE_FLOATS * 2)
    let edgeCount = 0
    let nodeCount = 0
    const runs = []
    for (const item of items) {
      if (item.kind === 1) {
        const edge = frame.edges[item.source]
        const o = edgeCount * EDGE_FLOATS
        edgeData[o] = edge.ax; edgeData[o + 1] = edge.ay; edgeData[o + 2] = edge.bx; edgeData[o + 3] = edge.by
        edgeData[o + 4] = edge.weight; edgeData[o + 5] = edge.curve; edgeData[o + 6] = edge.phase; edgeData[o + 7] = edge.lit
        edgeData[o + 8] = edge.reachA; edgeData[o + 9] = edge.reachB
        edgeData[o + 10] = item.piece / PIECES; edgeData[o + 11] = (item.piece + 1) / PIECES
        const last = runs[runs.length - 1]
        if (last && last.kind === 1) last.count += 1; else runs.push({ kind: 1, start: edgeCount, count: 1 })
        edgeCount += 1
      } else {
        const node = frame.nodes[item.source]
        const o = nodeCount * NODE_FLOATS
        nodeData[o] = node.x; nodeData[o + 1] = node.y; nodeData[o + 2] = node.r; nodeData[o + 3] = node.cell
        nodeData[o + 4] = node.lit; nodeData[o + 5] = node.dim; nodeData[o + 6] = node.free ? 1 : 0; nodeData[o + 7] = node.weight || 0
        const last = runs[runs.length - 1]
        if (last && last.kind === 0) last.count += 1; else runs.push({ kind: 0, start: nodeCount, count: 1 })
        nodeCount += 1
      }
    }

    if (edgeCount) {
      gl.useProgram(edgeProgram)
      gl.uniform2f(edgeUniform.resolution, size.width, size.height)
      gl.uniform2f(edgeUniform.pan, frame.pan[0], frame.pan[1])
      gl.uniform1f(edgeUniform.zoom, frame.zoom)
      gl.uniform3fv(edgeUniform.accent, frame.colors.accent)
      gl.uniform1f(edgeUniform.time, frame.time)
      gl.uniform1f(edgeUniform.dim, frame.dim || 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, edgeData.subarray(0, edgeCount * EDGE_FLOATS), gl.DYNAMIC_DRAW)
    }
    if (nodeCount) {
      gl.useProgram(nodeProgram)
      gl.uniform2f(nodeUniform.resolution, size.width, size.height)
      gl.uniform2f(nodeUniform.pan, frame.pan[0], frame.pan[1])
      gl.uniform1f(nodeUniform.zoom, frame.zoom)
      gl.uniform2f(nodeUniform.atlasGrid, COLUMNS, atlasRows)
      gl.uniform3fv(nodeUniform.accent, frame.colors.accent)
      gl.uniform3fv(nodeUniform.border, frame.colors.border)
      gl.uniform1f(nodeUniform.time, frame.time)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(nodeUniform.atlas, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, nodeData.subarray(0, nodeCount * NODE_FLOATS), gl.DYNAMIC_DRAW)
    }
    // Ogni tratto di uno stesso tipo si disegna con una sola chiamata: i puntatori degli attributi partono dal primo elemento del tratto.
    for (const run of runs) {
      if (run.kind === 1) {
        const stride = EDGE_FLOATS * 4
        const base = run.start * stride
        gl.useProgram(edgeProgram)
        gl.bindVertexArray(edgeVao)
        gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuffer)
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, stride, base)
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, base + 16)
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, base + 32)
        gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, base + 40)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, (PIECE_SEGMENTS + 1) * 2, run.count)
      } else {
        const stride = NODE_FLOATS * 4
        const base = run.start * stride
        gl.useProgram(nodeProgram)
        gl.bindVertexArray(nodeVao)
        gl.bindBuffer(gl.ARRAY_BUFFER, nodeBuffer)
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, base)
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, base + 16)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, run.count)
      }
    }
    gl.bindVertexArray(null)
  }

  function dispose() {
    if (disposed) return
    disposed = true
    gl.deleteTexture(texture)
    gl.deleteBuffer(quad)
    gl.deleteBuffer(nodeBuffer)
    gl.deleteBuffer(edgeBuffer)
    gl.deleteVertexArray(nodeVao)
    gl.deleteVertexArray(edgeVao)
    gl.deleteVertexArray(emptyVao)
    gl.deleteProgram(backdropProgram)
    gl.deleteProgram(nodeProgram)
    gl.deleteProgram(edgeProgram)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  return { setIcons, refreshCells, draw, resize, dispose }
}
