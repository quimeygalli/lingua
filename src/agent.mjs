import { Agent, BedrockModel, tool } from "@strands-agents/sdk";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrock = new BedrockRuntimeClient({});
const MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

async function bedrockText(systemPrompt, userMessage) {
  const res = await bedrock.send(new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  }));
  const body = JSON.parse(Buffer.from(res.body).toString());
  return body.content[0].text;
}

const model = new BedrockModel({
  modelId: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
});

// ---------- Conversation history (DynamoDB) ----------

async function loadHistory(sessionId) {
  const resp = await ddb.send(new GetCommand({
    TableName: process.env.SESSIONS_TABLE,
    Key: { sessionId },
  }));
  return resp.Item ? JSON.parse(resp.Item.messages) : [];
}

async function saveHistory(sessionId, messages) {
  await ddb.send(new PutCommand({
    TableName: process.env.SESSIONS_TABLE,
    Item: {
      sessionId,
      messages: JSON.stringify(messages),
      expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    },
  }));
}

// ---------- Student profile helpers (stored under sessionId = "profile#<userId>") ----------

const profileKey = (userId) => ({ sessionId: `profile#${userId}` });

async function loadProfile(userId) {
  const resp = await ddb.send(new GetCommand({
    TableName: process.env.SESSIONS_TABLE,
    Key: profileKey(userId),
  }));
  return resp.Item ?? null;
}

async function saveProfile(userId, data) {
  await ddb.send(new PutCommand({
    TableName: process.env.SESSIONS_TABLE,
    Item: {
      ...data,
      ...profileKey(userId),
      updatedAt: new Date().toISOString(),
    },
  }));
}

// ---------- Lingua tools ----------

// getUserProfile and getLearningHistory need userId at call time;
// we inject it via a factory so tools stay stateless objects.
function makeStudentTools(userId) {

const getUserProfile = tool({
  name: "get_user_profile",
  description:
    "Obtiene el perfil del estudiante: idioma nativo, idioma objetivo, nivel, objetivos y días sin practicar.",
  inputSchema: z.object({}),
  callback: async () => {
    const profile = await loadProfile(userId);
    if (!profile) {
      // First visit — create a default profile
      const defaults = {
        nombre: "Estudiante",
        idioma_nativo: "Español",
        idioma_objetivo: "Inglés",
        nivel: "Principiante (A2)",
        objetivos: ["Conversación cotidiana"],
        ultima_sesion: null,
        sesiones_totales: 0,
      };
      await saveProfile(userId, defaults);
      return JSON.stringify({ ...defaults, dias_sin_practicar: 0, primera_vez: true });
    }
    const dias_sin_practicar = profile.ultima_sesion
      ? Math.floor((Date.now() - new Date(profile.ultima_sesion).getTime()) / 86400000)
      : 0;
    return JSON.stringify({ ...profile, dias_sin_practicar });
  },
});

const getLearningHistory = tool({
  name: "get_learning_history",
  description:
    "Obtiene el historial de aprendizaje: errores frecuentes, vocabulario aprendido y puntuaciones anteriores.",
  inputSchema: z.object({}),
  callback: async () => {
    const profile = await loadProfile(userId);
    if (!profile) return JSON.stringify({ errores_frecuentes: [], vocabulario_aprendido: [], puntuaciones_anteriores: [], sesiones_totales: 0 });
    return JSON.stringify({
      errores_frecuentes: profile.errores_frecuentes ?? [],
      vocabulario_aprendido: profile.vocabulario_aprendido ?? [],
      puntuaciones_anteriores: profile.puntuaciones_anteriores ?? [],
      sesiones_totales: profile.sesiones_totales ?? 0,
    });
  },
});

const saveSession = tool({
  name: "save_session",
  description: "Guarda el resumen de la sesión: nuevos errores, nuevas palabras, nivel actualizado, puntuación y duración.",
  inputSchema: z.object({
    nuevos_errores: z.array(z.string()).describe("Lista de errores detectados en esta sesión"),
    nuevas_palabras: z.array(z.string()).describe("Vocabulario nuevo introducido"),
    nivel_actualizado: z.string().describe("Nivel del estudiante tras la sesión"),
    puntuacion: z.number().min(0).max(100).describe("Puntuación de 0 a 100"),
    duracion_minutos: z.number().describe("Duración de la sesión en minutos"),
  }),
  callback: async ({ nuevos_errores, nuevas_palabras, nivel_actualizado, puntuacion, duracion_minutos }) => {
    const profile = (await loadProfile(userId)) ?? {};

    // Merge errors: keep unique entries, cap at 20 most recent
    const errores_prev = profile.errores_frecuentes ?? [];
    const errores_merged = [...new Set([...errores_prev, ...nuevos_errores])].slice(-20);

    // Merge vocabulary: keep unique words, cap at 200
    const vocab_prev = profile.vocabulario_aprendido ?? [];
    const vocab_merged = [...new Set([...vocab_prev, ...nuevas_palabras])].slice(-200);

    // Keep last 10 scores
    const scores_prev = profile.puntuaciones_anteriores ?? [];
    const scores_merged = [...scores_prev, puntuacion].slice(-10);

    await saveProfile(userId, {
      ...profile,
      nivel: nivel_actualizado,
      errores_frecuentes: errores_merged,
      vocabulario_aprendido: vocab_merged,
      puntuaciones_anteriores: scores_merged,
      sesiones_totales: (profile.sesiones_totales ?? 0) + 1,
      ultima_sesion: new Date().toISOString(),
    });

    return JSON.stringify({ guardado: true, nivel_actualizado, puntuacion, palabras_totales: vocab_merged.length });
  },
});

  return { getUserProfile, getLearningHistory, saveSession };
}

const analyzePronunciation = tool({
  name: "analyze_pronunciation",
  description: "Analiza la pronunciación del usuario a partir de un audio o transcripción fonética.",
  inputSchema: z.object({
    texto: z.string().describe("El texto o transcripción fonética que el usuario intentó pronunciar"),
  }),
  callback: ({ texto }) => JSON.stringify({
    precision: "74%",
    fonemas_incorrectos: [
      { fonema: "/θ/", ejemplo: "think → se pronunció como 'tink'", correccion: "Coloca la lengua entre los dientes" },
      { fonema: "/æ/", ejemplo: "cat → sonó como 'cet'", correccion: "Abre más la mandíbula, boca más ancha" },
    ],
    fluidez: "Aceptable, con pausas largas entre palabras",
    velocidad: "Lenta (92 palabras/min, ideal: 120-150)",
    texto_analizado: texto,
    recomendaciones: ["Practica los sonidos /θ/ y /ð/ con trabalenguas", "Escucha podcasts lentos en inglés"],
  }),
});

const textToSpeech = tool({
  name: "text_to_speech",
  description: "Convierte texto a voz para que el usuario escuche la pronunciación correcta.",
  inputSchema: z.object({
    texto: z.string().describe("Texto que se debe pronunciar en voz alta"),
    idioma: z.string().default("en-US").describe("Código de idioma, p.ej. 'en-US', 'fr-FR'"),
  }),
  callback: ({ texto, idioma }) => JSON.stringify({
    reproducido: true,
    texto,
    idioma,
    nota: `🔊 [Pronunciación de "${texto}" en ${idioma}] — En una integración real, aquí se reproduciría el audio.`,
  }),
});

const generateLesson = tool({
  name: "generate_lesson",
  description:
    "Genera una clase personalizada adaptada al nivel, objetivos y errores del estudiante. " +
    "Úsala cuando el estudiante pida empezar una clase, quiera aprender algo nuevo, o al iniciar una sesión estructurada.",
  inputSchema: z.object({
    nivel: z.string().describe("Nivel del estudiante, p.ej. 'B1'"),
    tema: z.string().describe("Tema de la clase, p.ej. 'present perfect', 'vocabulario de viajes'"),
    errores_previos: z.array(z.string()).optional().describe("Errores que el estudiante ha tenido antes"),
    objetivos: z.array(z.string()).optional().describe("Objetivos del estudiante"),
  }),
  callback: async ({ nivel, tema, errores_previos = [], objetivos = [] }) => {
    const text = await bedrockText(
      "Eres un experto en didáctica de idiomas. Genera una clase de inglés concisa y práctica en español. " +
      "Responde SOLO con JSON válido, sin texto adicional, con esta estructura exacta: " +
      '{"objetivo":"","conceptoClave":"","explicacion":"","ejemplos":[],"vocabulario":[],"error_comun":"","tip":""}',
      `Nivel: ${nivel}. Tema: ${tema}. ` +
      (errores_previos.length ? `Errores previos del estudiante: ${errores_previos.join(", ")}. ` : "") +
      (objetivos.length ? `Objetivos: ${objetivos.join(", ")}.` : "")
    );
    try { return text; } catch { return text; }
  },
});

const generateExercise = tool({
  name: "generate_exercise",
  description:
    "Genera ejercicios interactivos personalizados según el error o tema a practicar. " +
    "Úsala cuando el estudiante pida ejercicios, cuando detectes errores repetidos, o para reforzar lo enseñado.",
  inputSchema: z.object({
    nivel: z.string().describe("Nivel del estudiante"),
    tipo_error: z.string().describe("Concepto a practicar, p.ej. 'present perfect', 'preposiciones de tiempo'"),
    tipo_ejercicio: z.enum(["fill-in", "error-correction", "translation", "role-play", "multiple-choice"])
      .describe("Tipo de ejercicio"),
    contexto: z.string().optional().describe("Contexto del estudiante, p.ej. 'viajes', 'trabajo'"),
  }),
  callback: async ({ nivel, tipo_error, tipo_ejercicio, contexto = "cotidiano" }) => {
    const text = await bedrockText(
      "Eres un experto en ejercicios de idiomas. Genera exactamente 4 ítems de práctica de inglés. " +
      "Responde SOLO con JSON válido, sin texto adicional, con esta estructura exacta: " +
      '{"instruccion":"","items":[],"respuestas":[],"explicacion":"","tip_pronunciacion":""}',
      `Nivel: ${nivel}. Error/tema: ${tipo_error}. Tipo: ${tipo_ejercicio}. Contexto: ${contexto}. ` +
      "Los ítems deben ser variados, prácticos y usar vocabulario del contexto dado."
    );
    try { return text; } catch { return text; }
  },
});

const generateReview = tool({
  name: "generate_review",
  description:
    "Genera una revisión intensiva cuando el estudiante ha cometido el mismo error tres o más veces. " +
    "Combina explicación, ejercicios y un mini-test final.",
  inputSchema: z.object({
    tipo_error: z.string().describe("El error repetido a reforzar"),
    ejemplos_del_estudiante: z.array(z.string()).optional().describe("Frases incorrectas que dijo el estudiante"),
  }),
  callback: async ({ tipo_error, ejemplos_del_estudiante = [] }) => {
    const text = await bedrockText(
      "Eres un tutor de inglés. Crea una revisión intensiva en español para corregir un error frecuente. " +
      "Responde SOLO con JSON válido, sin texto adicional, con esta estructura: " +
      '{"regla":"","por_que_ocurre":"","ejercicios":[{"tipo":"","instruccion":"","items":[],"respuestas":[]}],"mini_test":[],"frase_motivadora":""}',
      `Error frecuente: ${tipo_error}. ` +
      (ejemplos_del_estudiante.length ? `El estudiante dijo: ${ejemplos_del_estudiante.join("; ")}` : "")
    );
    try { return text; } catch { return text; }
  },
});

const scheduleReminder = tool({
  name: "schedule_reminder",
  description: "Programa un recordatorio de práctica futura para el usuario.",
  inputSchema: z.object({
    cuando: z.string().describe("Cuándo recordar, p.ej. 'mañana a las 18:00', 'en 2 días'"),
    motivo: z.string().optional().describe("Motivo del recordatorio"),
  }),
  callback: ({ cuando, motivo }) => JSON.stringify({
    programado: true,
    cuando,
    motivo: motivo ?? "Práctica diaria de inglés",
    mensaje: `Te recordaré que practiques inglés ${cuando}.`,
  }),
});

const translate = tool({
  name: "translate",
  description:
    "Traduce palabras o frases cortas con contexto y ejemplo de uso. No traduce conversaciones completas.",
  inputSchema: z.object({
    texto: z.string().describe("Palabra o frase corta a traducir"),
    de: z.string().default("en").describe("Idioma de origen"),
    a: z.string().default("es").describe("Idioma de destino"),
  }),
  callback: async ({ texto, de, a }) => {
    const text = await bedrockText(
      "Eres un diccionario bilingüe experto. Responde SOLO con JSON válido, sin texto adicional, con esta estructura: " +
      '{"traduccion":"","ejemplo_en":"","ejemplo_traducido":"","sinonimos":[],"nivel":""}',
      `Traduce del ${de} al ${a}: "${texto}". Incluye un ejemplo de uso natural.`
    );
    try { return text; } catch { return JSON.stringify({ traduccion: text }); }
  },
});

// ---------- Prompts ----------

const GREET_PROMPT =
  "Eres Lingua, un tutor de idiomas amable y motivador. " +
  "Usa get_user_profile() y get_learning_history() para conocer al estudiante. " +
  "Luego salúdalo por su nombre si está disponible, muestra un breve resumen de su progreso " +
  "(nivel, racha, errores frecuentes) y pregúntale qué le gustaría practicar hoy. " +
  "Sé cálido, breve y entusiasta.";

const SYSTEM_PROMPT =
  "Eres Lingua, un agente inteligente especializado en el aprendizaje personalizado de idiomas. " +
  "Tu misión es ayudar al usuario a aprender un idioma mediante conversaciones naturales, " +
  "ejercicios adaptativos y análisis de progreso. " +

  "Dispones de herramientas que debes usar cuando sean necesarias. " +
  "Nunca inventes información que una herramienta pueda proporcionar. " +
  "Nunca menciones el nombre interno de las herramientas al usuario. " +

  "Durante la conversación: " +
  "haz una sola pregunta o actividad por vez; " +
  "corrige únicamente los errores importantes; " +
  "adapta automáticamente la dificultad; " +
  "introduce vocabulario útil en contexto. " +

  "Cuando el usuario pida una clase o quiera aprender algo nuevo, usa generate_lesson() con su nivel y el tema detectado. " +
  "Cuando el usuario pida ejercicios o quiera practicar, usa generate_exercise() con el tipo apropiado. " +
  "Cuando el usuario no entienda una palabra, usa translate() para dar la traducción con ejemplo. " +
  "Cuando el mensaje empiece con '[🎤 audio:' es una transcripción de voz: llama a analyze_pronunciation(), " +
  "explica los errores fonéticos con amabilidad y ofrece un ejercicio con generate_exercise(). " +
  "Si detectas el mismo error tres veces, usa generate_review() para refuerzo intensivo. " +
  "Si el usuario lleva varios días sin practicar, usa schedule_reminder() al finalizar. " +
  "Al terminar la sesión, resume el progreso y llama a save_session().";

// ---------- Handler ----------

export async function* answerWith(message, sessionId, userId = "anonymous") {
  const [history] = await Promise.all([loadHistory(sessionId)]);
  const isGreet = message === "__greet__";
  const { getUserProfile, getLearningHistory, saveSession } = makeStudentTools(userId);
  const agent = new Agent({
    model,
    systemPrompt: isGreet ? GREET_PROMPT : SYSTEM_PROMPT,
    messages: history,
    tools: [
      getUserProfile,
      getLearningHistory,
      saveSession,
      analyzePronunciation,
      textToSpeech,
      generateLesson,
      generateExercise,
      generateReview,
      scheduleReminder,
      translate,
    ],
    printer: false,
  });

  for await (const ev of agent.stream(isGreet ? "Inicia la sesión." : message)) {
    if (ev.type === "modelStreamUpdateEvent" &&
        ev.event.type === "modelContentBlockDeltaEvent" &&
        ev.event.delta?.type === "textDelta") {
      yield { type: "token", text: ev.event.delta.text };
    } else if (ev.type === "beforeToolCallEvent") {
      yield { type: "tool", name: ev.toolUse?.name ?? "tool" };
    }
  }

  await saveHistory(sessionId, agent.messages);
}
