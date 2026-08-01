# Lingua — Tu profesora virtual de idiomas

Lingua es un tutor de idiomas con inteligencia artificial, construido sobre AWS Serverless. Conversa en tiempo real, evalua tu nivel y adapta cada sesion a tu progreso.

---

## Demo

**URL:** https://5lps0yqk1k.execute-api.us-east-1.amazonaws.com/prod/

---

## Que hace

- **Test de nivel automatico** — al ingresar por primera vez, Sofia te hace 5 preguntas en ingles (A1 a C1) y determina tu nivel real
- **Conversacion adaptativa** — las clases y ejercicios se ajustan a tus errores y objetivos
- **Voz en tiempo real** — Sofia habla usando Web Speech Synthesis; tu puedes responder con el microfono
- **4 idiomas** — selector de voz para ingles, espanol, frances e italiano (3 voces por idioma)
- **Perfil persistente** — tu nivel, errores frecuentes y vocabulario aprendido se guardan entre sesiones
- **Respuestas en streaming** — los mensajes aparecen token por token, sin esperar

---

## Arquitectura

```
Browser
  │
  ├── GET  /          → HTML de la app (servido desde Lambda)
  └── POST /chat      → Respuesta streaming NDJSON
        │
        ▼
API Gateway (REST, streaming habilitado)
        │
        ▼
Lambda  nube-agent  (Node.js 22, arm64, 512 MB, 120 s)
        │
        ├── Strands Agent SDK  →  Amazon Bedrock
        │                         Claude Haiku 4.5
        │
        └── DynamoDB  agent-sessions
              ├── session#<id>     historial de conversacion
              └── profile#<userId> perfil del estudiante
```

---

## Stack tecnologico

| Capa | Tecnologia |
|---|---|
| Infraestructura | AWS SAM (CloudFormation) |
| Computo | AWS Lambda (Node.js 22, arm64) |
| API | Amazon API Gateway REST (streaming) |
| IA | Amazon Bedrock — Claude Haiku 4.5 |
| Agente | Strands Agents SDK |
| Base de datos | Amazon DynamoDB |
| Voz (salida) | Web Speech Synthesis API |
| Voz (entrada) | Web Speech Recognition API |

---

## Herramientas del agente

Sofia dispone de 8 herramientas que usa segun el contexto:

| Herramienta | Funcion |
|---|---|
| `get_user_profile` | Lee nivel, objetivos y racha del estudiante |
| `get_learning_history` | Recupera errores frecuentes y vocabulario aprendido |
| `save_progress` | Guarda nivel, errores y palabras nuevas al terminar la sesion |
| `generate_lesson` | Genera una clase personalizada via Bedrock |
| `generate_exercise` | Crea 4 ejercicios interactivos segun el error detectado |
| `analyze_pronunciation` | Analiza la transcripcion de voz del estudiante |
| `translate_content` | Traduce palabras con contexto y ejemplos |
| `schedule_practice` | Programa recordatorios de practica |

---

## Flujo de una sesion

```
1. Usuario abre la app
        │
        ▼
2. Sofia llama get_user_profile()
        │
        ├── Primera vez → Test de nivel (5 preguntas, una por vez)
        │                  Resultado: nivel A1 / A2 / B1 / B2 / C1
        │                  Se guarda con save_progress()
        │
        └── Usuario conocido → Saludo personalizado con resumen de progreso
        │
        ▼
3. Sesion de practica
   - Conversacion libre o ejercicios dirigidos
   - Correccion de errores en tiempo real
   - Clases y ejercicios generados por Bedrock segun el nivel
        │
        ▼
4. Al finalizar → save_progress() actualiza el perfil
```

---

## Estructura del proyecto

```
workshop/
├── template.yaml          # Infraestructura SAM (Lambda + API Gateway + DynamoDB refs)
└── src/
    ├── index.mjs          # Handler Lambda — enruta GET / y POST /chat
    ├── agent.mjs          # Logica del agente Sofia, herramientas, prompts
    └── chat-page.mjs      # UI completa en HTML/CSS/JS (servida desde Lambda)
```

---

## Despliegue

```bash
# Copiar fuentes al directorio de build de SAM
cp src/*.mjs .aws-sam/build/AgentFunction/

# Empaquetar y desplegar
cd .aws-sam/build/AgentFunction
zip -r /tmp/deploy.zip .
aws lambda update-function-code \
  --function-name nube-agent \
  --zip-file fileb:///tmp/deploy.zip \
  --region us-east-1
```

---

## Construido en

AWS Serverless AI Hackathon — agosto 2026
