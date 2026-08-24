# VORTIS AI

**VORTIS AI** is an AI-powered workspace built to bring conversation, coding, research, web search, image generation, voice interaction, and multiple AI models into one unified platform.

VORTIS is designed around **intelligent model routing, automatic fallbacks, streaming responses, persistent conversations, and a multi-provider AI architecture** to provide a fast and reliable AI experience.

> **Faster. Simpler. More Productive.**

---

## ✨ Features

### 🤖 AI Chat

Have conversations with AI for:

- General questions
- Explanations
- Writing and brainstorming
- Problem solving
- Technical assistance
- Everyday tasks

VORTIS automatically determines an appropriate model route instead of requiring users to manually select a model for every conversation.

### 🧠 Intelligent Model Routing

VORTIS analyzes incoming requests and classifies them according to their complexity.

```text
User Request
     │
     ▼
Request Analysis
     │
     ├── Trivial
     ├── Normal
     └── Heavy
     │
     ▼
Model Selection
     │
     ▼
Primary Model
     │
     ├── Success ───────────────► Response
     │
     └── Failure
            │
            ▼
       Fallback Chain
            │
            ▼
         Response
```

This allows VORTIS to use faster models for simple requests while reserving more capable models for demanding tasks.

### 🔄 Automatic Fallback System

VORTIS is not dependent on a single model or provider.

If a selected model becomes unavailable or returns an error, the backend can automatically continue through the configured fallback chain.

This helps maintain availability during:

- Temporary provider outages
- Model unavailability
- Server errors
- Provider-side failures
- Other transient issues

### 💻 VORTIS Code Chat

A dedicated coding environment for working with AI on software-development tasks.

Code Chat can be used for:

- Code generation
- Code explanation
- Debugging
- Modifications
- Programming questions
- Larger coding tasks
- Streaming code responses

VORTIS can route complex coding requests through dedicated coding/reasoning model chains.

### 🌐 Web Search

VORTIS supports real-time web search for requests that require current or external information.

The web-search infrastructure uses:

- **Tavily** — AI-focused web search and research
- **Serper** — Google Search-based web search

### 🔎 Deep Search

VORTIS provides a deeper research workflow for tasks that require more extensive information gathering.

Deep Search can use the configured web-search infrastructure, including Tavily and Serper, to gather relevant information before generating a final response.

### 🖼️ AI Image Generation

VORTIS supports AI-powered image generation directly from the platform.

Users can move between conversational AI and image generation without needing a separate application.

### 🎙️ Voice Interaction

VORTIS includes voice capabilities for interacting with AI through speech.

The frontend contains dedicated voice-processing components for handling the voice pipeline and Whisper-based processing.

### 🧠 Memory & Conversations

VORTIS is designed around persistent conversations rather than isolated one-off prompts.

Features include:

- Conversation history
- Previous chats
- Persistent chat sessions
- Conversation context
- AI memory functionality
- Automatic conversation titles

This allows users to return to previous conversations and continue working from where they left off.

### 🏷️ Automatic Chat Titles

VORTIS can automatically generate conversation titles so that chats are easier to identify and organize.

Title generation also has fallback handling when the primary title-generation provider is unavailable.

### 🔐 Authentication

VORTIS provides a complete account experience including:

- Landing page
- Sign Up
- Sign In
- Google Sign-In
- Authenticated user experience
- User-specific conversations

### ⚙️ User Preferences

VORTIS includes a preferences/onboarding experience that allows the application to adapt to user choices.

Preferences are handled separately from the main conversation interface.

### 📤 Conversation Export

Conversations can be exported through the built-in chat export functionality.

This makes it easier to preserve or reuse conversations outside the application.

### 🎨 Rich Response Formatting

VORTIS includes custom response formatting for displaying AI output, including rich text and code-oriented responses.

### ⚡ Streaming Responses

AI responses can be streamed to the interface rather than waiting for the entire response to finish.

This improves perceived response speed and allows users to see generation progress in real time.

---

# 🏗️ Architecture

VORTIS uses a frontend/backend architecture.

```text
┌──────────────────────────────┐
│          VORTIS AI           │
│        React + Vite          │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       VORTIS Backend         │
│          Node.js             │
│                              │
│  Routing • Streaming         │
│  Fallbacks • API Handling    │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       AI Provider Layer      │
│                              │
│ NVIDIA • Groq • Cloudflare   │
│ Vertex AI • Other Services   │
└──────────────────────────────┘
```

The frontend communicates with the VORTIS backend instead of exposing provider credentials directly to the browser.

---

# 🧠 AI Provider & Routing Architecture

VORTIS uses multiple AI providers and models instead of depending on one provider.

Examples of providers and model infrastructure used by VORTIS include:

- **NVIDIA**
- **Groq**
- **Cloudflare**
- **Vertex AI**

The exact model used for a request can depend on the request category, model availability, and fallback configuration.

### Routing Example

```text
Simple request
      │
      ▼
 Fast / lightweight model
      │
      ▼
   Response

Complex request
      │
      ▼
 Advanced model
      │
      ├── Available ──► Response
      │
      └── Unavailable
              │
              ▼
        Fallback model
              │
              ▼
           Response
```

This architecture allows VORTIS to balance:

- Speed
- Quality
- Availability
- Model capability
- Provider reliability

---

# 📁 Project Structure

```text
VORTIS/
│
├── vortis-vite/                         # Frontend application
│   │
│   ├── public/                         # Static assets
│   │
│   ├── src/
│   │   ├── assets/                     # Frontend assets
│   │   │
│   │   ├── AICore.jsx                  # Core AI interaction logic
│   │   ├── App.jsx                     # Main application
│   │   ├── CodeChat.jsx                # Coding workspace
│   │   ├── Login-Component.jsx         # Authentication UI
│   │   ├── chatExport.js               # Conversation export
│   │   ├── docUtils.js                 # Document utilities
│   │   ├── hero-1.jsx                  # UI component
│   │   ├── index.css                   # Global styles
│   │   ├── App.css                     # Application styles
│   │   ├── index.js                    # Frontend support
│   │   ├── main.jsx                    # Application entry point
│   │   ├── NotFound.jsx                # 404 page
│   │   ├── Privacy.jsx                 # Privacy Policy
│   │   ├── Terms.jsx                   # Terms of Service
│   │   ├── richFormat.jsx              # Rich response formatting
│   │   ├── voicePipeline.js            # Voice processing pipeline
│   │   ├── whisper.js                  # Whisper integration
│   │   ├── postcss.config.cjs          # PostCSS configuration
│   │   └── useDevToolsGuard.js         # Frontend protection utility
│   │
│   ├── index.html                      # HTML entry point
│   ├── package.json                    # Frontend dependencies/scripts
│   ├── vite.config.js                  # Vite configuration
│   └── vercel.json                     # Frontend deployment config
│
├── vortis-backend/                     # Backend/API
│   ├── server.js                       # Main backend server
│   ├── .env.example                    # Environment variable template
│   ├── .gitignore                      # Backend ignore rules
│   ├── .node-version                   # Node.js version configuration
│   ├── package.json                    # Backend dependencies/scripts
│   ├── package-lock.json               # Locked dependencies
│   └── vercel.json                     # Backend deployment config
│
├── LICENSE                             # VORTIS license
├── README.md                           # Project documentation
├── .gitignore                          # Repository ignore rules
└── package-lock.json                   # Root dependency lockfile
```

---

# 🎨 Frontend

The VORTIS frontend is built using:

- React
- Vite
- JavaScript
- JSX
- CSS

The frontend handles the user-facing experience including:

- Landing page
- Authentication
- Chat interface
- Code Chat
- Conversations
- Streaming responses
- Voice interaction
- Image generation interface
- Search interfaces
- Preferences
- Account experience
- Legal pages

---

# ⚙️ Backend

The backend is implemented using Node.js.

The backend is responsible for the core server-side AI infrastructure, including:

- AI provider communication
- Model routing
- Fallback chains
- Streaming
- Request classification
- Title generation
- Provider error handling
- Server-side API credentials
- AI service integration

The backend acts as the secure boundary between the client and external AI providers.

---

# 🔐 Environment Variables

VORTIS uses environment variables for sensitive configuration.

A template is provided at:

```text
vortis-backend/.env.example
```

For local development, create your own environment file and provide the required credentials.

**Never commit real API keys or production credentials to Git.**

The repository intentionally ignores environment files such as:

```text
.env
.env.local
.env.production
.env.vercel-backup-prod
```

Only the example configuration should be committed.

---

# 🚀 Running VORTIS Locally

## Frontend

```bash
cd vortis-vite
npm install
npm run dev
```

## Backend

Open another terminal:

```bash
cd vortis-backend
npm install
npm start
```

Use the scripts defined in each `package.json` if your local configuration provides a different development command.

---

# ☁️ Deployment

VORTIS uses Vercel-compatible deployment configurations for its frontend and backend.

Frontend:

```text
vortis-vite/vercel.json
```

Backend:

```text
vortis-backend/vercel.json
```

Production secrets should be configured through the deployment environment and should never be committed to Git.

---

# 💳 Plans

VORTIS currently includes a **demonstration plan system** for showcasing how different usage tiers can work.

> **Note:** The plans displayed in the current application are for demonstration/product presentation purposes and should not be interpreted as a live commercial billing system unless explicitly enabled.

The plan system is designed to support differentiated usage limits and capabilities.

---

# 🛡️ Security

VORTIS follows several practices to reduce unnecessary exposure of sensitive information.

- Provider API keys remain on the backend.
- Environment files are excluded from Git.
- Production credentials are not stored in frontend source code.
- `.env.example` contains configuration guidance rather than real credentials.
- AI provider communication is handled through the backend.
- Authentication and user-specific functionality are separated from public frontend content.

No application can guarantee complete security, and users should avoid entering sensitive credentials or confidential information into AI conversations.

---

# 📜 Legal

VORTIS includes dedicated legal pages:

- [Terms of Service](./vortis-vite/src/Terms.jsx)
- [Privacy Policy](./vortis-vite/src/Privacy.jsx)

The complete licensing terms are available in:

```text
LICENSE
```

---

# 📄 License

VORTIS is proprietary software.

**Copyright © 2026 Raghav Prabhakar. All rights reserved.**

See the [LICENSE](./LICENSE) file for the complete license terms.

Unauthorized copying, redistribution, modification, or commercial use is prohibited unless explicitly permitted by the license.

---

# ⚠️ Disclaimer

VORTIS AI is an independent project and is not affiliated with, endorsed by, or sponsored by NVIDIA, Groq, Cloudflare, Google, Vercel, or other third-party services used by the application.

AI-generated information may contain errors or inaccuracies. Important information should be independently verified.

Third-party models and services are subject to their respective providers' availability, terms, and policies.

---

# 🌐 Project

**VORTIS AI**

An AI workspace focused on bringing multiple AI capabilities into one place while using intelligent routing and fallback infrastructure behind the scenes.

> **Faster. Simpler. More Productive.**