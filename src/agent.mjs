import { Agent, BedrockModel, tool } from "@strands-agents/sdk";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrock = new BedrockRuntimeClient({});

const model = new BedrockModel({
  modelId: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
});

// ---------- Conversation history ----------

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

// ---------- Student profile (stored as "profile#<userId>" in sessions table) ----------

async function loadProfile(userId) {
  const resp = await ddb.send(new GetCommand({
    TableName: process.env.SESSIONS_TABLE,
    Key: { sessionId: "profile#" + userId },
  }));
  return resp.Item ?? null;
}

async function saveProfile(userId, data) {
  await ddb.send(new PutCommand({
    TableName: process.env.SESSIONS_TABLE,
    Item: {
      ...data,
      sessionId: "profile#" + userId,
      updatedAt: new Date().toISOString(),
    },
  }));
}

// ---------- Bedrock direct call for lesson/exercise generation ----------

async function bedrockText(systemPrompt, userMessage) {
  const res = await bedrock.send(new InvokeModelCommand({
    modelId: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
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

// ---------- Tools that need userId injected at request time ----------

function makeStudentTools(userId) {

  const getUserProfile = tool({
    name: "get_user_profile",
    description: "Obtiene el perfil del estudiante: idioma nativo, idioma objetivo, nivel, objetivos y dias sin practicar.",
    inputSchema: z.object({}),
    callback: async () => {
      const profile = await loadProfile(userId);
      if (!profile) {
        const defaults = {
          nombre: "Estudiante",
          idiomaObjetivo: "Ingles",
          nivel: null,
          objetivos: ["Conversacion cotidiana"],
          sesionesTotales: 0,
          ultimaSesion: null,
        };
        await saveProfile(userId, defaults);
        return JSON.stringify({ ...defaults, diasSinPracticar: 0, primeraVez: true });
      }
      const diasSinPracticar = profile.ultimaSesion
        ? Math.floor((Date.now() - new Date(profile.ultimaSesion).getTime()) / 86400000)
        : 0;
      const primeraVez = !profile.nivel || profile.sesionesTotales === 0;
      return JSON.stringify({ ...profile, diasSinPracticar, primeraVez });
    },
  });

  const getLearningHistory = tool({
    name: "get_learning_history",
    description: "Obtiene el historial: errores frecuentes, vocabulario aprendido y puntuaciones anteriores.",
    inputSchema: z.object({}),
    callback: async () => {
      const profile = await loadProfile(userId);
      if (!profile) return JSON.stringify({
        erroresFrecuentes: [],
        vocabularioAprendido: [],
        puntuacionesAnteriores: [],
        sesionesTotales: 0,
      });
      return JSON.stringify({
        erroresFrecuentes: profile.erroresFrecuentes ?? [],
        vocabularioAprendido: profile.vocabularioAprendido ?? [],
        puntuacionesAnteriores: profile.puntuacionesAnteriores ?? [],
        sesionesTotales: profile.sesionesTotales ?? 0,
      });
    },
  });

  const saveProgress = tool({
    name: "save_progress",
    description: "Guarda el progreso de la sesion: errores, palabras nuevas, nivel actualizado y puntuacion.",
    inputSchema: z.object({
      errores: z.array(z.string()).describe("Errores cometidos en esta sesion"),
      palabrasNuevas: z.array(z.string()).describe("Vocabulario nuevo introducido"),
      nivelActualizado: z.string().describe("Nivel del estudiante tras la sesion"),
      puntuacion: z.number().min(0).max(100),
      duracionMin: z.number(),
    }),
    callback: async ({ errores, palabrasNuevas, nivelActualizado, puntuacion, duracionMin }) => {
      const prev = (await loadProfile(userId)) ?? {};
      const nombreEntry = palabrasNuevas.find(p => p.startsWith("nombre:"));
      const nombreGuardado = nombreEntry ? nombreEntry.replace("nombre:", "").trim() : null;
      const vocabSinNombre = palabrasNuevas.filter(p => !p.startsWith("nombre:"));
      const erroresMerged = [...new Set([...(prev.erroresFrecuentes ?? []), ...errores])].slice(-20);
      const vocabMerged = [...new Set([...(prev.vocabularioAprendido ?? []), ...vocabSinNombre])].slice(-200);
      const scoresMerged = [...(prev.puntuacionesAnteriores ?? []), puntuacion].slice(-10);
      await saveProfile(userId, {
        ...prev,
        ...(nombreGuardado ? { nombre: nombreGuardado } : {}),
        nivel: nivelActualizado,
        erroresFrecuentes: erroresMerged,
        vocabularioAprendido: vocabMerged,
        puntuacionesAnteriores: scoresMerged,
        sesionesTotales: (prev.sesionesTotales ?? 0) + 1,
        ultimaSesion: new Date().toISOString(),
      });
      return JSON.stringify({ guardado: true, nivel: nivelActualizado, puntuacion, vocabTotal: vocabMerged.length });
    },
  });

  return { getUserProfile, getLearningHistory, saveProgress };
}

// ---------- Static tools ----------

const generateLesson = tool({
  name: "generate_lesson",
  description: "Genera una clase personalizada adaptada al nivel, tema y errores previos del estudiante.",
  inputSchema: z.object({
    nivel: z.string(),
    tema: z.string(),
    erroresPrevios: z.array(z.string()).optional(),
    objetivos: z.array(z.string()).optional(),
  }),
  callback: async ({ nivel, tema, erroresPrevios = [], objetivos = [] }) => {
    return await bedrockText(
      "Eres un experto en didactica de idiomas. Genera una clase de ingles concisa en espanol. " +
      "Responde SOLO con JSON valido con esta estructura: " +
      "{\"objetivo\":\"\",\"conceptoClave\":\"\",\"explicacion\":\"\",\"ejemplos\":[],\"vocabulario\":[],\"tip\":\"\"}",
      "Nivel: " + nivel + ". Tema: " + tema + ". " +
      (erroresPrevios.length ? "Errores previos: " + erroresPrevios.join(", ") + ". " : "") +
      (objetivos.length ? "Objetivos: " + objetivos.join(", ") : "")
    );
  },
});

const generateExercise = tool({
  name: "generate_exercise",
  description: "Genera 4 ejercicios interactivos segun el error o tema a practicar.",
  inputSchema: z.object({
    nivel: z.string(),
    tipoError: z.string(),
    tipoEjercicio: z.enum(["fill-in", "error-correction", "translation", "multiple-choice"]),
    contexto: z.string().optional(),
  }),
  callback: async ({ nivel, tipoError, tipoEjercicio, contexto = "cotidiano" }) => {
    return await bedrockText(
      "Eres un experto en ejercicios de idiomas. Genera exactamente 4 items. " +
      "Responde SOLO con JSON valido: " +
      "{\"instruccion\":\"\",\"items\":[],\"respuestas\":[],\"explicacion\":\"\",\"regla\":\"\"}",
      "Nivel: " + nivel + ". Error/tema: " + tipoError + ". Tipo: " + tipoEjercicio + ". Contexto: " + contexto
    );
  },
});

const analyzePronunciation = tool({
  name: "analyze_pronunciation",
  description: "Analiza la pronunciacion del usuario a partir de la transcripcion de su voz.",
  inputSchema: z.object({
    transcript: z.string().describe("Texto que el usuario dijo"),
    textoEsperado: z.string().optional(),
  }),
  callback: async ({ transcript, textoEsperado }) => {
    return await bedrockText(
      "Eres un experto en fonetica del ingles. Analiza la pronunciacion. " +
      "Responde SOLO con JSON valido: " +
      "{\"precision\":\"\",\"problemas\":[{\"sonido\":\"\",\"ejemplo\":\"\",\"correccion\":\"\"}]," +
      "\"fluidez\":\"\",\"recomendaciones\":[]}",
      "El estudiante dijo: \"" + transcript + "\"" +
      (textoEsperado ? ". Se esperaba: \"" + textoEsperado + "\"" : "")
    );
  },
});

const translateContent = tool({
  name: "translate_content",
  description: "Traduce palabras o frases con contexto y ejemplo de uso. No traduce conversaciones completas.",
  inputSchema: z.object({
    texto: z.string(),
    de: z.string().default("en"),
    a: z.string().default("es"),
  }),
  callback: async ({ texto, de, a }) => {
    return await bedrockText(
      "Eres un diccionario bilingue experto. Responde SOLO con JSON valido: " +
      "{\"traduccion\":\"\",\"ejemploEn\":\"\",\"ejemploEs\":\"\",\"sinonimos\":[],\"nivel\":\"\"}",
      "Traduce del " + de + " al " + a + ": \"" + texto + "\". Incluye un ejemplo de uso natural."
    );
  },
});

const schedulePractice = tool({
  name: "schedule_practice",
  description: "Programa un recordatorio de practica futura.",
  inputSchema: z.object({
    cuando: z.string(),
    motivo: z.string().optional(),
  }),
  callback: ({ cuando, motivo }) => JSON.stringify({
    programado: true,
    cuando,
    motivo: motivo ?? "Practica diaria de ingles",
    mensaje: "Te recordare que practiques ingles " + cuando + ".",
  }),
});

// ---------- Prompts ----------

const GREET_PROMPT =
  "Eres Sofia, profesora virtual de idiomas. SIEMPRE hablas en espanol. " +
  "Primero usa get_user_profile() para saber si el estudiante es nuevo. " +

  "Si primeraVez es true (nunca ha usado la app): " +
  "Saludalo brevemente en espanol (1-2 oraciones) y dile que le haras un test rapido de texto para conocer su nivel real. " +
  "Antes de empezar el test, preguntale su nombre en espanol (solo eso, una oracion). Espera su respuesta. " +
  "Luego haz exactamente 5 preguntas EN INGLES, UNA POR VEZ — espera su respuesta antes de continuar. " +
  "Antes de cada pregunta escribe en espanol: 'Pregunta X de 5:' (donde X es el numero actual). " +
  "P1: 'Nice to meet you! Where are you from?' (nivel A1) " +
  "P2: 'Describe your daily routine using at least 3 sentences.' (nivel A2) " +
  "P3: 'Tell me about something interesting you did last year.' (nivel B1) " +
  "P4: 'What would you do if you could live in any country? Why?' (nivel B2) " +
  "P5: 'Explain the difference between \"although\" and \"however\" and use each in a sentence.' (nivel C1) " +
  "Al recibir las 5 respuestas, analiza gramatica, vocabulario y coherencia. " +
  "Determina el nivel (A1/A2/B1/B2/C1) y explicale el resultado en espanol con entusiasmo, llamandolo por su nombre. " +
  "Usa save_progress() para guardar el nivel real. En el campo 'palabrasNuevas' incluye el nombre del estudiante con el prefijo 'nombre:' (ej: 'nombre:Maria') para recordarlo. " +

  "Si primeraVez es false (ya tiene historial): " +
  "Saludalo por nombre si esta disponible, menciona su nivel y racha de sesiones en espanol, " +
  "y preguntale que quiere practicar hoy. Maximo 3 oraciones.";

const SYSTEM_PROMPT =
  "Eres Sofia, una profesora virtual de idiomas experta, paciente y motivadora. " +
  "Tu mision es ayudar al estudiante a aprender un idioma mediante conversacion natural y ejercicios adaptativos. " +

  "REGLAS: " +
  "1. Usa tus herramientas cuando necesites datos del estudiante — nunca inventes informacion. " +
  "2. Haz UNA sola pregunta o actividad por turno. " +
  "3. Cuando el estudiante cometa un error importante: repite la version correcta primero, luego explica la regla brevemente. " +
  "4. Si detectas el mismo error tres veces seguidas, usa generate_exercise() para ese concepto inmediatamente. " +
  "5. Cuando el estudiante pida una clase o tema nuevo, usa generate_lesson(). " +
  "6. Cuando el estudiante pida ejercicios, usa generate_exercise(). " +
  "7. Cuando el estudiante no entienda una palabra, usa translate_content(). " +
  "8. Si el mensaje empieza con '[audio:' es transcripcion de voz — analiza pronunciacion primero con analyze_pronunciation(). " +
  "9. Al terminar la sesion, resume el progreso y usa save_progress(). " +
  "10. Nunca menciones los nombres internos de las herramientas. " +
  "11. Responde SIEMPRE en espanol. Solo usa ingles cuando el estudiante practique frases o ejercicios en ingles.";

// ---------- Handler ----------

export async function* answerWith(message, sessionId, userId = "anonymous") {
  const history = await loadHistory(sessionId);
  const isGreet = message === "__greet__";
  const { getUserProfile, getLearningHistory, saveProgress } = makeStudentTools(userId);

  const agent = new Agent({
    model,
    systemPrompt: isGreet ? GREET_PROMPT : SYSTEM_PROMPT,
    messages: history,
    tools: [getUserProfile, getLearningHistory, saveProgress,
            generateLesson, generateExercise, analyzePronunciation,
            translateContent, schedulePractice],
    printer: false,
  });

  for await (const ev of agent.stream(isGreet ? "Inicia la sesion." : message)) {
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
