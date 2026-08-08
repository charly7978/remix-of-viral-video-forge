// Plantillas de guion y edición para maximizar gancho, ritmo y CTA.
// Rotan por corrida para evitar repetición estructural entre videos.
// Pensadas para producción de ALTA CALIDAD: cámara en movimiento, audio nítido,
// subtítulos animados, cortes dinámicos y alcance transgeneracional (18 a 50+).

export interface ScriptTemplate {
  id: string;
  nombre: string;
  /** Estructura del gancho en los primeros 3 segundos. */
  gancho: string;
  /** Arquitectura del primer tercio (0-15s), donde se pierde la audiencia. */
  primerTercio: string;
  /** Patrón de corte y ritmo de edición cinematográfico. */
  edicion: string;
  /** Cierre + disparador de comentarios. */
  cierre: string;
  /** Estilo visual sugerido (cámara, lente, iluminación, grade). */
  estiloVisual: string;
  /** Tratamiento de audio y subtítulos. */
  audioSubs: string;
}

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: "contradiccion",
    nombre: "Contradicción frontal",
    gancho:
      "Afirmación que contradice lo que casi todos creen, dicha sin preámbulo, con el dato duro adelante ('El 90% de… está mal').",
    primerTercio:
      "0-3s contradicción · 3-7s prueba concreta (número, fecha, estudio) · 7-11s por qué te lo ocultaron o por qué nadie lo vio · 11-15s primera micro-revelación que obliga a seguir.",
    edicion:
      "Corte cada 1,2-2s, push-in progresivo sobre el rostro/objeto en el gancho, whip-pan en cada dato nuevo, texto en pantalla de 3-5 palabras con una palabra resaltada en color. Cámara always moving.",
    cierre:
      "Afirmación discutible + pregunta binaria ('¿Vos de qué lado estás?') que fuerza el comentario, con loop visual al plano del gancho.",
    estiloVisual:
      "Lente 35mm, profundidad de campo corta, key light cálida + rim light fría, grade contrastado tipo documental de investigación.",
    audioSubs:
      "Voz en off cálida y cercana, casi susurro en el gancho; música minimalista con pulso que crece; subtítulos animados palabra por palabra, sans-serif gigante.",
  },
  {
    id: "cuenta_regresiva",
    nombre: "Cuenta regresiva de tensión",
    gancho:
      "Anuncio de que algo va a pasar en X segundos y hay que verlo, con el reloj visible desde el frame 1.",
    primerTercio:
      "0-2s promesa temporal · 2-6s contexto mínimo indispensable · 6-10s primer giro que adelanta la recompensa · 10-15s obstáculo o dato que sube la apuesta.",
    edicion:
      "Corte cada 1,5s sincronizado con un tick sonoro, contador en pantalla arriba, flashes blancos de 2 frames en cada cambio de bloque, cámara siempre en leve movimiento (handheld orgánico).",
    cierre:
      "Se cumple la promesa, pero se abre una segunda pregunta sin responder y se invita a definirla en comentarios.",
    estiloVisual:
      "Lente 24mm gran angular para sensación de inmersión, iluminación de neón o led de acento, grade saturado y vibrante.",
    audioSubs:
      "Beat de cuenta regresiva enérgico, SFX de tick en cada corte, voz con urgencia controlada; subtítulos con contador integrado y resaltado por beat.",
  },
  {
    id: "misterio_inverso",
    nombre: "Misterio inverso",
    gancho:
      "Se muestra primero el resultado imposible o la imagen final desconcertante, y se pregunta cómo se llegó ahí.",
    primerTercio:
      "0-3s imagen imposible · 3-6s negación de la explicación obvia · 6-11s pista real verificable · 11-15s segunda pista que reordena todo lo anterior.",
    edicion:
      "Corte cada 1,3-2,2s, reverse-reveal (plano detalle → plano general), congelado de 0,3s con texto sobre cada pista, paleta fría con un solo acento cálido. Parallax lento en los planos fijos.",
    cierre:
      "Se revela el mecanismo y se plantea el caso hermano sin resolver: '¿Y este cómo se explica?'.",
    estiloVisual:
      "Lente 50mm, paleta azul/teal con un acento ámbar, niebla o grano leve, grade misterioso tipo true crime.",
    audioSubs:
      "Música de suspenso con cuerda grave, silencios de 0,4s antes de cada revelación; subtítulos tipo declaración con la palabra clave en mayúsculas.",
  },
  {
    id: "costo_oculto",
    nombre: "Costo oculto",
    gancho:
      "Se nombra algo cotidiano y se dice exactamente cuánto cuesta en plata, tiempo o salud, con la cifra en pantalla.",
    primerTercio:
      "0-3s cifra brutal · 3-7s cómo se calcula (fuente concreta) · 7-11s comparación tangible · 11-15s el detalle que lo empeora.",
    edicion:
      "Corte cada 1,5-2,5s, números animados que suben (count-up), split-screen de comparación, texto en pantalla con la unidad siempre visible. Cámara en leve push-in sobre los datos.",
    cierre:
      "Cálculo aplicado al espectador + pedido de que aporte su propio número en comentarios.",
    estiloVisual:
      "Lente 35mm, fondo desenfocado con bokeh, iluminación limpia tipo finanzas, grade neutro con acento en rojo para las cifras.",
    audioSubs:
      "Voz clara y pausada, SFX de 'ding' en cada cifra, música corporativa moderna; subtítulos con la cifra resaltada en rojo.",
  },
  {
    id: "testigo",
    nombre: "Testigo en primera persona",
    gancho:
      "Frase de alguien que estuvo ahí, cortada en el medio de la acción, sin presentación ('Cuando abrieron la puerta ya no estaba').",
    primerTercio:
      "0-3s cita en crudo · 3-7s quién habla y por qué importa · 7-11s el hecho verificable detrás · 11-15s la contradicción con la versión oficial.",
    edicion:
      "Corte cada 1,4-2s, textura de archivo y grano leve en los planos de contexto, subtítulos tipo declaración, silencio de 0,4s antes del dato clave. Cámara handheld para tensión.",
    cierre: "Pregunta sobre a quién creerle, con dos opciones concretas para votar en comentarios.",
    estiloVisual:
      "Lente 50mm, iluminación natural con un key cálido, grano 16mm, grade sepia/nostálgico para planos de archivo.",
    audioSubs:
      "Voz en off con timbre de testimonio, música ambiental con piano, subtítulos tipo transcripción con la frase clave resaltada.",
  },
  {
    id: "demostracion",
    nombre: "Demostración en vivo",
    gancho:
      "Se hace algo físico y visible que parece que va a fallar, sin explicar todavía qué es.",
    primerTercio:
      "0-3s acción en marcha · 3-6s apuesta explícita ('esto no debería funcionar') · 6-11s primer resultado parcial · 11-15s complicación inesperada.",
    edicion:
      "Corte cada 1,2-1,8s, macro del detalle crítico, cámara lenta de 0,5s en el momento de riesgo, sonido diegético al frente y música por debajo. Push-in en el clímax.",
    cierre:
      "Resultado final + desafío directo al espectador para que lo pruebe y cuente cómo le fue.",
    estiloVisual:
      "Lente macro 100mm, iluminación de estudio con dos luces, grade limpio y brillante tipo tutorial premium.",
    audioSubs:
      "Sonido diegético amplificado, música con drop en el clímax, voz entusiasmada; subtítulos cortos y dinámicos.",
  },
  {
    id: "horoscopo_golpe",
    nombre: "Horóscopo de golpe",
    gancho:
      "Se nombra un signo y se dice la verdad incómoda que nadie se anima a admitir sobre él, con la palabra en pantalla.",
    primerTercio:
      "0-3s signo + afirmación polémica · 3-7s la prueba conductual (patrón real) · 7-11s por qué funciona así · 11-15s el contraste con lo que dicen los diarios.",
    edicion:
      "Corte cada 1,3-2s, planos con estética mística (nebulosa, luces, cristales) alternados con texto gigante del signo, parallax suave. Cámara lenta en transiciones.",
    cierre:
      "Predicción atrevida para la semana + pregunta de si se identifican, para llenar comentarios.",
    estiloVisual:
      "Lente 35mm, iluminación con gel violáceo/dorado, profecía type grade con glow, partículas en cámara.",
    audioSubs:
      "Música etérea con pad, voz en off susurrada y misteriosa, SFX de shimmer; subtítulos en tipografía astral con brillo.",
  },
  {
    id: "mito_caido",
    nombre: "Mito que cae",
    gancho:
      "Se dice una creencia que 'todos saben' y se afirma de frente que es mentira, con la imagen del mito en pantalla.",
    primerTercio:
      "0-3s creencia popular · 3-7s el origen real (de dónde salió) · 7-11s la evidencia que la destruye · 11-15s qué decir en su lugar.",
    edicion:
      "Corte cada 1,4-2,2s, plano de archivo del mito (desenfocado, con vignette) vs plano nítido de la realidad, zoom punch en cada dato. Whip-pan de transición.",
    cierre:
      "Pregunta de qué otro mito quieren que rompa la próxima vez, para generar guardados y comentarios.",
    estiloVisual:
      "Lente 40mm, contraste mito (sepia) vs realidad (nítido frío), grade type 'mythbusters' moderno.",
    audioSubs:
      "Música con gancho pop, voz irónica y divertida, SFX de 'error' en el mito; subtítulos con el mito tachado.",
  },
  {
    id: "descubrimiento_brutal",
    nombre: "Descubrimiento brutal",
    gancho:
      "Se anuncia un hallazgo reciente que cambia algo que creías sabido, con la imagen del descubrimiento.",
    primerTercio:
      "0-3s 'Científicos acaban de descubrir…' · 3-7s qué es y por qué importa · 7-11s la implicancia para vos · 11-15s lo que antes creíamos y estaba mal.",
    edicion:
      "Corte cada 1,2-2s, planos de laboratorio/espacio con movimiento, gráficos animados simples, texto de datos en pantalla. Push-in en reveals.",
    cierre:
      "Afirmación de que el conocimiento cambió hoy + invitación a compartir si les voló la cabeza.",
    estiloVisual:
      "Lente 35mm, iluminación fría de laboratorio, grade azul tecnológico, gráficos con glow.",
    audioSubs:
      "Música cinematográfica con orquesta, voz asombrada y clara, SFX de 'whoosh' en transiciones; subtítulos limpios con datos resaltados.",
  },
  {
    id: "efemeride_impacto",
    nombre: "Efeméride de impacto",
    gancho:
      "Un día como hoy pasó algo que todavía te afecta, dicho como si fuera noticia de último momento.",
    primerTercio:
      "0-3s fecha + hecho · 3-7s por qué fue enorme · 7-11s la consecuencia que llega hasta hoy · 11-15s el detalle que nadie cuenta.",
    edicion:
      "Corte cada 1,5-2,3s, archivo histórico con tratamiento (grano, viñeta) vs plano actual nítido, línea de tiempo animada. Cámara lenta en momentos clave.",
    cierre: "Pregunta de si conocían la historia, para que comenten y compartan.",
    estiloVisual:
      "Lente 35mm, tratamiento sepia para archivo, grade actual frío, mezcla de épocas con transición suave.",
    audioSubs:
      "Música épica con percusión, voz de narrador, SFX de archivo (radios, ambiente); subtítulos tipo teleprompter.",
  },
];

/** Elige plantilla y variación evitando las usadas recientemente. */
export function pickTemplate(usadas: string[]): ScriptTemplate {
  const disponibles = SCRIPT_TEMPLATES.filter((t) => !usadas.includes(t.id));
  const pool = disponibles.length > 0 ? disponibles : SCRIPT_TEMPLATES;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index]!;
}

const VARIACIONES_CTA = [
  "pregunta binaria que obliga a elegir un bando",
  "pedido de un dato propio del espectador (cifra, experiencia, ciudad)",
  "afirmación discutible que invita a corregirte en comentarios",
  "desafío de repetir la prueba y reportar el resultado",
  "segunda incógnita abierta que promete continuación",
];

const VARIACIONES_TEXTO = [
  "3 palabras por placa, una resaltada en color",
  "placas de 4-6 palabras con la cifra siempre en pantalla",
  "subtítulo tipo declaración con la palabra clave en mayúsculas",
  "una sola palabra por corte en los primeros 5 segundos",
];

/** Bloque de instrucciones inyectable en el prompt de escritura. */
export function templateBriefing(template: ScriptTemplate, semilla: number): string {
  const cta = VARIACIONES_CTA[semilla % VARIACIONES_CTA.length]!;
  const texto = VARIACIONES_TEXTO[semilla % VARIACIONES_TEXTO.length]!;
  return `Plantilla obligatoria de guion y edición: "${template.nombre}" (id ${template.id}).
- Gancho: ${template.gancho}
- Arquitectura del primer tercio (0-15s, donde se decide la retención): ${template.primerTercio}
- Ritmo y edición: ${template.edicion}
- Cierre: ${template.cierre}
- Estilo visual (cámara/lente/luz/grade): ${template.estiloVisual}
- Audio y subtítulos: ${template.audioSubs}
- Variación de CTA de esta corrida: ${cta}.
- Variación de texto en pantalla de esta corrida: ${texto}.
Aplicá la plantilla sin nombrarla en el contenido. Ninguna frase, imagen ni estructura puede repetirse dentro del short. El video debe sentirse cinematográfico y dinámico, no un PowerPoint con audio.`;
}
