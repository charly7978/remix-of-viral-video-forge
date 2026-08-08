// Plantillas de guion y edición para maximizar gancho, ritmo y CTA.
// Rotan por corrida para evitar repetición estructural entre videos.

export interface ScriptTemplate {
  id: string;
  nombre: string;
  /** Estructura del gancho en los primeros 3 segundos. */
  gancho: string;
  /** Arquitectura del primer tercio (0-15s), donde se pierde la audiencia. */
  primerTercio: string;
  /** Patrón de corte y ritmo de edición. */
  edicion: string;
  /** Cierre + disparador de comentarios. */
  cierre: string;
}

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: "contradiccion",
    nombre: "Contradicción frontal",
    gancho:
      "Afirmación que contradice lo que casi todos creen, dicha sin preámbulo, con el dato duro adelante ('El 90% de… está mal').",
    primerTercio:
      "0-3s contradicción · 3-7s prueba concreta (número, fecha, nombre) · 7-11s por qué te lo ocultaron o por qué nadie lo vio · 11-15s primera micro-revelación que obliga a seguir.",
    edicion:
      "Corte cada 1,2-2s, zoom-in progresivo sobre el rostro/objeto en el gancho, whip-pan en cada dato nuevo, texto en pantalla de 3-5 palabras con una palabra resaltada en color.",
    cierre:
      "Afirmación discutible + pregunta binaria ('¿Vos de qué lado estás?') que fuerza el comentario, con loop visual al plano del gancho.",
  },
  {
    id: "cuenta_regresiva",
    nombre: "Cuenta regresiva de tensión",
    gancho:
      "Anuncio de que algo va a pasar en X segundos y hay que verlo, con el reloj visible desde el frame 1.",
    primerTercio:
      "0-2s promesa temporal · 2-6s contexto mínimo indispensable · 6-10s primer giro que adelanta la recompensa · 10-15s obstáculo o dato que sube la apuesta.",
    edicion:
      "Corte cada 1,5s sincronizado con un tick sonoro, contador en pantalla arriba, flashes blancos de 2 frames en cada cambio de bloque, cámara siempre en leve movimiento.",
    cierre:
      "Se cumple la promesa, pero se abre una segunda pregunta sin responder y se invita a definirla en comentarios.",
  },
  {
    id: "misterio_inverso",
    nombre: "Misterio inverso",
    gancho:
      "Se muestra primero el resultado imposible o la imagen final desconcertante, y se pregunta cómo se llegó ahí.",
    primerTercio:
      "0-3s imagen imposible · 3-6s negación de la explicación obvia · 6-11s pista real verificable · 11-15s segunda pista que reordena todo lo anterior.",
    edicion:
      "Corte cada 1,3-2,2s, reverse-reveal (plano detalle → plano general), congelado de 0,3s con texto sobre cada pista, paleta fría con un solo acento cálido.",
    cierre:
      "Se revela el mecanismo y se plantea el caso hermano sin resolver: '¿Y este cómo se explica?'.",
  },
  {
    id: "costo_oculto",
    nombre: "Costo oculto",
    gancho:
      "Se nombra algo cotidiano y se dice exactamente cuánto cuesta en plata, tiempo o salud, con la cifra en pantalla.",
    primerTercio:
      "0-3s cifra brutal · 3-7s cómo se calcula (fuente concreta) · 7-11s comparación tangible y argentina · 11-15s el detalle que lo empeora.",
    edicion:
      "Corte cada 1,5-2,5s, números animados que suben, split-screen de comparación, texto en pantalla con la unidad siempre visible.",
    cierre:
      "Cálculo aplicado al espectador + pedido de que aporte su propio número en comentarios.",
  },
  {
    id: "testigo",
    nombre: "Testigo en primera persona",
    gancho:
      "Frase de alguien que estuvo ahí, cortada en el medio de la acción, sin presentación ('Cuando abrieron la puerta ya no estaba').",
    primerTercio:
      "0-3s cita en crudo · 3-7s quién habla y por qué importa · 7-11s el hecho verificable detrás · 11-15s la contradicción con la versión oficial.",
    edicion:
      "Corte cada 1,4-2s, textura de archivo y grano leve en los planos de contexto, subtítulos tipo declaración, silencio de 0,4s antes del dato clave.",
    cierre:
      "Pregunta sobre a quién creerle, con dos opciones concretas para votar en comentarios.",
  },
  {
    id: "demostracion",
    nombre: "Demostración en vivo",
    gancho:
      "Se hace algo físico y visible que parece que va a fallar, sin explicar todavía qué es.",
    primerTercio:
      "0-3s acción en marcha · 3-6s apuesta explícita ('esto no debería funcionar') · 6-11s primer resultado parcial · 11-15s complicación inesperada.",
    edicion:
      "Corte cada 1,2-1,8s, macro del detalle crítico, cámara lenta de 0,5s en el momento de riesgo, sonido diegético al frente y música por debajo.",
    cierre:
      "Resultado final + desafío directo al espectador para que lo pruebe y cuente cómo le fue.",
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
- Variación de CTA de esta corrida: ${cta}.
- Variación de texto en pantalla de esta corrida: ${texto}.
Aplicá la plantilla sin nombrarla en el contenido. Ninguna frase, imagen ni estructura puede repetirse dentro del short.`;
}
