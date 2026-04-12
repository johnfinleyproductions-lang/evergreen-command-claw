/**
 * Tier 1 task seed — 15 starter tasks for Evergreen Command
 *
 * Source: Skool vault ingest (🏦 Vault / aa1f50e5), curated 2026-04-11.
 * These are the highest-signal prompts from ~168 lessons of AI automation courses.
 * Six are lifted from standalone prompt PDFs; nine are extracted from embedded
 * n8n / Make blueprint JSON nodes.
 *
 * Run with:
 *   npm run db:seed:tier1
 *
 * The script is idempotent — tasks are matched by name and skipped if already
 * present. Re-running will only insert tasks that don't yet exist.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";

import { db } from "../client";
import { tasks, type NewTask } from "../schema/tasks";

// --------------------------------------------------------------------------
// Asset loading
// --------------------------------------------------------------------------

const ASSETS_DIR = join(process.cwd(), "lib", "db", "seed", "assets");
const hormoziVoiceGuide = readFileSync(
  join(ASSETS_DIR, "hormozi-voice-guide.md"),
  "utf-8",
);

// --------------------------------------------------------------------------
// Task definitions
//
// Variables follow Evergreen Command's {{snake_case}} template syntax
// (see lib/prompt-template.ts). Every task carries a "tier1" tag plus
// one or two domain tags for easy filtering in the UI.
// --------------------------------------------------------------------------

const SEED_TASKS: NewTask[] = [
  // ========================================================================
  // 1. MetaPrompt Creator
  // ========================================================================
  {
    name: "MetaPrompt Creator",
    description:
      "Generates a high-quality, explicit prompt for any task you throw at it. Use this when you want to build a new task but don't know how to phrase it — feed in a rough description and you'll get a production-grade prompt back. Source: Vault / 🏆 MetaPrompt Creator.",
    prompt: `You are a world-class prompt engineer tasked with creating the ideal prompt for instructing an AI assistant to complete a task. Your prompt should provide crystal-clear guidance and relevant examples to help the AI understand exactly how to approach the task to generate the best possible output. The key is to be extremely thorough and explicit.

Your objective is to create a comprehensive prompt that will enable the AI assistant to complete the following task:

{{task}}

The output must meet the following requirements:

{{requirements}}

To engineer the optimal prompt, follow these steps:

1. Meticulously analyze the task to identify:
   - Primary objective and desired output format
   - All key information, inputs, or context the AI will need
   - Any constraints, pitfalls, or special considerations to keep in mind

2. Provide an exhaustive, step-by-step blueprint for the AI to follow from start to finish:
   - How to parse and utilize each input
   - Optimal algorithms, approaches, or reasoning to employ at each step
   - Concrete interim goals or checkpoints to hit
   - Potential edge cases, exceptions, or deviations to handle
   - Specific things to avoid or watch out for

3. Illustrate the desired output with several representative examples:
   - Thoughtfully select examples that cover key variations and edge cases
   - Explain precisely how each example fulfills the requirements
   - Highlight nuances that distinguish great outputs from mediocre ones

4. Lay out meticulous formatting requirements for the AI's output:
   - Preferred grammar, tone, style guides to follow
   - Specific sections, headings, or components to include
   - Any special notation or markers to use

5. Close with a detailed recap of key objectives and instructions.

Place the finished prompt inside a \`<prompt>\` section.`,
    systemPrompt: null,
    toolsAllowed: [],
    inputSchema: {
      type: "object",
      required: ["task"],
      properties: {
        task: {
          type: "string",
          description: "Plain-language description of what you want the target AI to do.",
        },
        requirements: {
          type: "string",
          description: "Any constraints on output — format, length, tone, structure.",
        },
      },
    },
    tags: ["tier1", "meta", "prompt-engineering"],
  },

  // ========================================================================
  // 2. YouTube Title Generator
  // ========================================================================
  {
    name: "YouTube Title Generator",
    description:
      "Produces 20 curiosity-inducing YouTube titles under 50 characters. Uses the curiosity-gap framework with title-case, numbers, and strong adjectives. Source: Vault / 📈 YouTube Title Generator.",
    prompt: `Your task is to generate curiosity-inducing, high quality titles for YouTube videos that are 50 characters or less. To create an effective title, follow these steps:

1. Identify the core topic or subject matter of the video.
2. Brainstorm several potential "curiosity gaps" or open loops related to that topic — intriguing questions or mysteries that will make the viewer want to click to find out the answer. For example:
   - What surprising thing happened?
   - Why is this thing the way it is?
   - How was an "impossible" feat achieved?
   - What secret or insider knowledge will be revealed?
3. Craft a punchy title that clearly sets up the curiosity gap, while still being informative about the video's topic. Omit needless words.
4. If possible, include numbers, superlatives, or strong adjectives to make the title more compelling. But avoid resorting to obvious clickbait.
5. Capitalize the first letter of each major word, except for short connector words like "of", "in", "for", etc.
6. Double check that the title is under 50 characters. Shorten it further if needed.
7. Ensure the title reads smoothly and is free of grammatical errors.

Here are some examples of effective titles:
- The #1 Sign Your Phone Was Hacked
- What NASA Isn't Telling Us About Mars
- Why Bees Are Disappearing Worldwide
- The Myth You Were Taught About Breakfast
- 5 Habits of Highly Productive People
- 8 YouTube Lessons I Wish I Knew Sooner
- Why is This Number Everywhere?
- Why It Was Almost Impossible to Make the Blue LED
- The Oldest Unsolved Problem in Math

Traits of great titles:
- Sparks immediate curiosity that compels clicking
- Concisely sets up an interesting premise
- Includes specific details or vivid language
- Follows proper title case and grammar
- Leaves the curiosity loop open for the video to close

My video is about:

{{video_description}}

Please generate 20 curiosity-inducing YouTube video titles while strictly adhering to the guidelines and format specified above.`,
    systemPrompt: null,
    toolsAllowed: [],
    inputSchema: {
      type: "object",
      required: ["video_description"],
      properties: {
        video_description: {
          type: "string",
          description: "A paragraph describing what the video is about — topic, key points, target audience.",
        },
      },
    },
    tags: ["tier1", "youtube", "copywriting"],
  },

  // ========================================================================
  // 3. RAG Master Prompt
  // ========================================================================
  {
    name: "RAG Master Prompt",
    description:
      "Answers a question using ONLY retrieved context, with inline (Doc #) citations and a Standard Evidence Summary structure. Pair with the RAG Query Rewriter upstream. Source: Vault / 🧽 109) Build RAG systems.",
    prompt: `You are a {{expert_role}}. Your task is to answer the user's question using ONLY the retrieved context provided below.

MODE: Local-Grounded — use only the retrieved context. You may paraphrase and summarize, but do not introduce any information that isn't directly supported by the context. If needed information is missing, say: "No supporting evidence found in the retrieved sources."

Never fabricate citations or content. If documents conflict, show both sides and note your confidence level.

---

USER QUESTION:
{{question}}

---

RETRIEVED CONTEXT:
{{retrieved_context}}

---

RESPONSE STRUCTURE — Standard Evidence Summary:

1. Intro (1–2 sentences): A short overview of what the retrieved context shows.

2. Evidence-Backed Findings:
   - [Point 1] (Doc #)
   - [Point 2] (Doc #)
   - [Point 3] (Doc #)

3. Action Steps / Recommendations (if applicable)

4. Confidence / Limitations: Note any missing data, conflicting findings, or uncertainty.

Format as markdown. Require inline citations for each factual claim using (Doc #).`,
    systemPrompt: null,
    toolsAllowed: [],
    inputSchema: {
      type: "object",
      required: ["expert_role", "question", "retrieved_context"],
      properties: {
        expert_role: {
          type: "string",
          description: "The role the model should adopt, e.g., 'Domain Expert in constitutional law' or 'Data Analyst'.",
        },
        question: {
          type: "string",
          description: "The user's actual question to be answered.",
        },
        retrieved_context: {
          type: "string",
          description: "Documents retrieved from the vector store, formatted as (Doc 1) ... (Doc 2) ... etc.",
        },
      },
    },
    tags: ["tier1", "rag", "research"],
  },

  // ========================================================================
  // 4. RAG Query Rewriter
  // ========================================================================
  {
    name: "RAG Query Rewriter",
    description:
      "Rewrites a user query into 2–3 semantically rich variants optimized for vector search. Runs upstream of the RAG Master Prompt. Source: Vault / 🧽 109) Build RAG systems.",
    prompt: `You are the Query Rewriting Agent in a Retrieval-Augmented Generation (RAG) system.

Your purpose is to take a user query and produce rewritten variants that improve how the system retrieves information.

Domain Context — for disambiguation only, most user queries relate to:

{{domain_context}}

If the query clearly falls outside this domain, ignore this context and treat it neutrally.

INSTRUCTIONS:

1. Read the user's query carefully and understand its meaning.
2. Rewrite it into 2–3 concise, clear, and semantically rich alternatives.
3. Keep the original intent identical.
4. Avoid adding context, commentary, explanations, or metadata — only produce rewritten text.
5. Each rewritten query should be 10–25 words long and phrased naturally for database or vector search.
6. Ensure the variants are meaningfully different — vary wording and phrasing, not intent.
7. If the query appears vague, expand pronouns or shorthand using logical context.
8. Do not include formatting, numbering, or markdown — only clean text lines, one per line.

USER QUERY:
{{user_query}}`,
    systemPrompt: null,
    toolsAllowed: [],
    inputSchema: {
      type: "object",
      required: ["user_query"],
      properties: {
        user_query: {
          type: "string",
          description: "The original user query to rewrite.",
        },
        domain_context: {
          type: "string",
          description: "Two sentences describing the RAG knowledge base domain (e.g., 'Medical literature on cardiovascular health').",
        },
      },
    },
    tags: ["tier1", "rag", "preprocessing"],
  },

  // ========================================================================
  // 5. Alex Hormozi Tone of Voice
  // ========================================================================
  {
    name: "Alex Hormozi Tone of Voice",
    description:
      "Rewrites or generates content in Alex Hormozi's voice. System prompt carries the full 22-element style guide (vocabulary, sentence structure, punctuation, dialogue, figurative language). Source: Vault / 👨‍✈️ 44) 100X Your LinkedIn + AI.",
    prompt: `Using the Alex Hormozi tone of voice defined in your system prompt, write a {{content_type}} about the following topic:

{{topic}}

Additional context or requirements:

{{additional_context}}

Hold strictly to the style guidelines — simple direct language, active voice, conversational tone, specific numbers, contrarian takes, and the repeated emphasis on "value," "dream outcome," and "leverage." Aim for the rhythm and punch of Hormozi's actual writing.`,
    systemPrompt: hormoziVoiceGuide,
    toolsAllowed: [],
    inputSchema: {
      type: "object",
      required: ["content_type", "topic"],
      properties: {
        content_type: {
          type: "string",
          description: "What you want written — e.g., 'LinkedIn post', 'cold email', '500-word essay', 'sales page section'.",
        },
        topic: {
          type: "string",
          description: "The subject matter to write about.",
        },
        additional_context: {
          type: "string",
          description: "Any extra constraints, facts, or angles to incorporate.",
        },
      },
    },
    tags: ["tier1", "voice", "copywriting"],
  },

  // ========================================================================
  // 6. Veo 3 Lead Magnet Prompt
  // ========================================================================
  {
    name: "Veo 3 Lead Magnet Prompt",
    description:
      "Generates a personalized 8-second selfie-style Veo 3 video prompt for outbound lead generation. Takes a target company, pain point, and absurd avatar; returns a detailed prompt ready to paste into Veo. Source: Vault / 🤩 93) Google Veo 3.",
    prompt: `You are an AI designed to generate personalized business outreach videos. Your output must be a detailed video description, ready to paste into Veo 3, following all rules below exactly.

INPUT VARIABLES:
- Client Name: {{client_name}}
- Pain Point: {{pain_point}}
- Avatar: {{avatar}}

CORE REQUIREMENTS:

1. Fixed Message: "I don't think {{client_name}} is {{pain_point}}. Take it from a wise {{avatar}}, you're leaving money on the table."
2. Duration: 8 seconds maximum
3. Style: Raw, authentic SELFIE video — character recording themselves on their own phone
4. Movement: Character walks while filming themselves, natural selfie shake and movement
5. Setting: Always outdoors regardless of avatar type (prefer absurd/unexpected locations)
6. Money Visual: Include a humorous visual element involving money during the "leaving money on the table" line, within the selfie frame

PROMPT STRUCTURE RULES:
- TRUE SELFIE POV — shot entirely from the character's own phone camera perspective
- Character based on Avatar input, always professional but with humorous elements
- ALWAYS outdoors — adapt any avatar to an outdoor setting
- Raw, authentic selfie style — slightly shaky, natural phone movement
- Character speaks with a posh British accent directly to their own camera while walking
- Include natural outdoor background noise and ambience
- During the "leaving money on the table" line, incorporate a visual money gag within the selfie frame
- Direct address using Client Name creates personal connection
- "Wise [Avatar]" phrasing adds humor regardless of avatar type
- Maintain confident, slightly cheeky tone with British sophistication
- Describe as authentic selfie video with natural lighting and movement
- NO third-person perspective — everything from character's own phone view

OUTPUT FORMAT:
Provide a detailed video description including: character appearance and attire, outdoor setting details, walking movement, specific spoken message, camera perspective and movement, lighting, weather conditions, and background audio/ambience. Must be comprehensive enough for Veo 3 to generate the video.

EXAMPLE — for Client: "Smith & Associates", Pain: "getting enough clients", Avatar: "Yeti":

Raw selfie video of a professional yeti in a business suit recording himself while walking across a massive glacier. The video is shot entirely from the yeti's own phone camera — authentic selfie style with natural shake and movement as he walks on the ice and talks to his camera. Bright, crisp daylight with wind sounds and the distant cracking of ice. The yeti looks directly into his phone camera with a posh British accent saying "I don't think Smith & Associates is getting enough clients. Take it from a wise yeti, you're leaving money on the table" — and during the money line, he casually pulls out dollar bills with his free hand and lets them flutter away across the icy landscape, all captured in the selfie frame. Authentic, unpolished selfie aesthetic with slight camera wobble, natural arctic lighting, and the absurd contrast of a suited British yeti giving business advice on a glacier.

Generate your video prompt now based on the provided inputs.`,
    systemPrompt: null,
    toolsAllowed: [],
    inputSchema: {
      type: "object",
      required: ["client_name", "pain_point", "avatar"],
      properties: {
        client_name: {
          type: "string",
          description: "Target company or person name.",
        },
        pain_point: {
          type: "string",
          description: "Specific business challenge they face, phrased to fit 'is [pain_point]'.",
        },
        avatar: {
          type: "string",
          description: "Absurd character type or appearance (e.g., 'yeti', 'astronaut', 'medieval knight').",
        },
      },
    },
    tags: ["tier1", "video", "veo", "outbound"],
  },

  // ========================================================================
  // 7. Expert Panel Creator
  // ========================================================================
  {
    name: "Expert Panel Creator",
    description:
      "Generates three world-class expert personas for a hypothetical round-table discussion on any topic. This is step 1 of a 10-prompt chain — the downstream prompts spin up each persona, run three discussion rounds, and synthesize a final answer. Source: Vault / 🧑‍💻 36) How to Build an AI Web App.",
    prompt: `You are an Expert Panel Creator. Your task is to generate three exceptionally qualified expert roles for a hypothetical round-table discussion on a given topic. When provided with a question, you will output three distinct roles of world-class experts who would offer the most authoritative, diverse, and insightful perspectives on the subject.

QUESTION:
{{question}}

Based on this question, generate three expert roles. These can be specific individuals (real or hypothetical) or positions that represent the absolute pinnacle of expertise in their respective fields. Aim for diversity in background and perspective while maintaining supreme relevance to the topic.

Output your response in JSON format as follows:

{
  "role_1": "Name or title of the first expert",
  "expertise_1": "Brief description of their field and why they are uniquely qualified",
  "role_2": "Name or title of the second expert",
  "expertise_2": "Brief description of their field and why they are uniquely qualified",
  "role_3": "Name or title of the third expert",
  "expertise_3": "Brief description of their field and why they are uniquely qualified"
}

Ensure the three experts bring genuinely different angles — for example, a practitioner, an academic, and a contrarian — rather than three people who would all say the same thing.`,
    systemPrompt: null,
    toolsAllowed: [],
    inputSchema: {
      type: "object",
      required: ["question"],
      properties: {
        question: {
          type: "string",
          description: "The question or topic to convene the expert panel around.",
        },
      },
    },
    tags: ["tier1", "research", "multi-persona"],
  },

  // ========================================================================
  // 8. Viral Short-Form Script Writer
  // ========================================================================
  {
    name: "Viral Short-Form Script Writer",
    description:
      "Writes the body of a short-form video script (Context → Why It Matters → Mini Hook, repeated) using the 14–18 word sentence, 14-year-old reading level framework. Hook is NOT included — provide that separately. Source: Vault / 🚀 28) GPT-4o Viral System.",
    prompt: `You are a VIRAL script writer with 30 years of experience, specializing in crafting engaging scripts for short-form content. Communicate in a clear, straightforward style that a 14-year-old can easily understand. Use everyday words, short sentences (14–18 words on average), and concise paragraphs. Be positive, optimistic, and celebrate successes. Avoid criticism or negative talk.

The opening hook will be provided separately, so you do not need to create it. Follow this framework for each section:

1. CONTEXT 🤔 (30–70 words max)
   - Give relevant background info
   - Explain key concepts simply
   - Keep it brief and focused

2. WHY IT MATTERS 🔮 (30–70 words max)
   - Explain the topic's importance
   - Highlight potential impact
   - Answer "Why should I care?"

3. MINI HOOK 🪝 (18 words max)
   - Introduce a compelling idea
   - Create curiosity for the next part
   - Ensure a smooth, logical transition

Repeat this structure for additional sections based on key points in the source material. End the final section with [CTA] instead of a mini hook.

EXAMPLE SECTION:
[Context] Coconut oil has gained popularity in recent years as a healthy cooking oil. It's made by pressing fresh coconut meat or dried coconut. Coconut oil is high in healthy saturated fats.

[Why It Matters] Choosing the right cooking oil is important for your health. Coconut oil's unique fat structure may boost metabolism and help with weight loss. It also raises good HDL cholesterol levels.

[Mini Hook] But not all coconut oil is created equal.

STYLE RULES:
- Active voice, direct and transparent
- Use contractions and casual phrasing
- Break complex ideas down step-by-step
- Avoid idioms, jargon, and figures of speech that could trip up non-native speakers
- No criticism or negative talk
- Build trust and connection with the viewer

SOURCE ARTICLE:
{{article}}

ADDITIONAL RESEARCH NOTES:
{{research_notes}}

Write the full script body following the framework above.`,
    systemPrompt: null,
    toolsAllowed: [],
    inputSchema: {
      type: "object",
      required: ["article"],
      properties: {
        article: {
          type: "string",
          description: "The source article, transcript, or topic write-up the script is based on.",
        },
        research_notes: {
          type: "string",
          description: "Optional additional research or facts to weave in.",
        },
      },
    },
    tags: ["tier1", "video", "copywriting"],
  },

  // ========================================================================
  // 9. Quote Extractor
  // ========================================================================
  {
    name: "Quote Extractor",
    description:
      "Takes a podcast or long-form transcript and returns 10 tweetable quotes — bite-sized, impactful, with line breaks for readability. Source: Vault / 🚀 18) Make 50+ Posts by Scraping ANY Video.",
    prompt: `You are a quote expert. Please review this transcript:

{{transcript}}

You must create 10 insightful, concise quotes from the content. You can rephrase slightly to improve readability but only if necessary. Do not change the meaning of the quote. Each quote should be a maximum of 200 characters.

FORMATTING RULES:
- Use short, impactful sentences for each quote
- If a quote has more than one sentence, put a single line break after each period
- Avoid filler words, repetition, or unnecessary context
- Maintain the original meaning and intent of the speaker
- Do not include quotes that are incomplete or lack clarity when taken out of context
- Aim for a mix of quotes that capture key insights, actionable advice, and memorable phrases

Focus on capturing the essence of key ideas while maintaining brevity and accuracy. The final result should be a collection of powerful, bite-sized quotes that encapsulate the main insights from the transcript.

GOOD EXAMPLES (drawn from successful viral posts):

"Money loves speed.
Wealth loves time.
Poverty loves indecision."

"A focused fool can accomplish more than a distracted genius."

"The fact that you don't know if it's gonna work — is exactly what makes it worth doing.
It's why entrepreneurship isn't for the faint of heart.
Embrace uncertainty."

"If you're willing to suck at anything for 100 days in a row, you can beat most people at most things."

Output the 10 quotes as a numbered list, each quote on its own with the internal line breaks preserved.`,
    systemPrompt: null,
    toolsAllowed: [],
    inputSchema: {
      type: "object",
      required: ["transcript"],
      properties: {
        transcript: {
          type: "string",
          description: "The full transcript or long-form text to mine for quotes.",
        },
      },
    },
    tags: ["tier1", "content", "extraction"],
  },

  // ========================================================================
  // 10. YouTube Thumbnail Analyzer
  // ========================================================================
  {
    name: "YouTube Thumbnail Analyzer",
    description:
      "Takes a text description of a YouTube thumbnail (or an image once vision is wired up) and returns a structured breakdown of vibe, focal point, color palette, text, background, composition, lighting, and curiosity gap. Source: Vault / 🤩 74) Create VIRAL Thumbnails.",
    prompt: `You are tasked with analyzing a YouTube thumbnail and providing a detailed, structured description of its visual and design elements. Your goal is to capture every important aspect so that it could be recreated or understood fully based on your description.

THUMBNAIL DESCRIPTION (or attached image):
{{thumbnail_description}}

Follow this structure carefully:

1. OVERALL VIBE / EMOTION
Describe the overall mood or emotion conveyed. Is it exciting, mysterious, humorous, dramatic, or something else? What feeling does it evoke?

2. CENTRAL SUBJECT / FOCAL POINT
Identify the main subject or focal point. Describe their appearance, pose, expression, and any standout features (exaggerated facial expressions, dynamic poses, etc.).

3. COLOR PALETTE
List the dominant colors used. Mention how they contrast with each other and whether they create a vibrant, muted, warm, cool, or high-contrast look.

4. TEXT ELEMENTS
If there is text, describe it in detail:
- What does the text say?
- What font style is used (bold, italicized, serif, sans-serif)?
- Where is the text placed within the frame?
- How does the color of the text contrast with the background?

5. BACKGROUND / SETTING
Describe the background or environment. Is it blurred, solid-colored, patterned, or detailed? Any specific props, symbols, or scenery that contribute to the story or theme?

6. COMPOSITION / LAYOUT
Explain how the elements are arranged. Centered, off-center, layered, or overlapping? Is there use of negative space? How do the elements interact visually?

7. LIGHTING AND EFFECTS
Note any lighting effects, shadows, glows, or filters. Polished, cinematic, gritty, or cartoonish aesthetic?

8. CURIOSITY GAP / STORYTELLING
Analyze how the thumbnail creates intrigue. What questions might it raise? Does it hint at a story, challenge, or outcome without giving everything away?

Output as markdown with each numbered section as a heading.`,
    systemPrompt: null,
    toolsAllowed: [],
    inputSchema: {
      type: "object",
      required: ["thumbnail_description"],
      properties: {
        thumbnail_description: {
          type: "string",
          description: "A description of the thumbnail to analyze (or, once vision is wired up, the image URL or base64 data).",
        },
      },
    },
    tags: ["tier1", "youtube", "visual"],
  },

  // ========================================================================
  // 11. Research Analyst
  // ========================================================================
  {
    name: "Research Analyst",
    description:
      "Identifies 3 relevant news topics from the last 7 days for a target audience, with angles, key details, and relevance explanations. Requires a web-search tool (Tavily, Brave, etc.). Source: Vault / 🤩 88) Replace your $10k Marketing Team.",
    prompt: `You are a specialized Research Analyst. Your sole purpose is to identify and research recent news topics relevant to a specific professional audience and compile the findings into a structured JSON output. You do not create final content — only provide the research material.

INPUTS:
- Target Avatar: {{avatar}}
- Problem We Solve: {{problem}}
- Target Country: {{country}}
- Current Date: {{current_date}}

YOUR TASK:

1. Determine the date range covering the 7 days immediately preceding {{current_date}}.

2. Use your web search tool to scan reputable online news sources for articles published within that 7-day range. Identify exactly three (3) distinct news topics that are highly relevant to the Target Avatar ({{avatar}}) operating in {{country}}. Focus on topics impacting their industry, business operations, challenges, or opportunities, particularly relating to how {{problem}}.

3. For each topic, extract a concise summary, a potential angle/hook, key details, and its relevance to the target audience.

Critically, ensure the three topics offer DIFFERENT perspectives or focus areas to provide genuine variety.

REQUIRED OUTPUT FORMAT — return ONLY this JSON (no markdown, no commentary):

{
  "idea_1": {
    "concise_summary": "1–2 sentence overview of the news topic.",
    "angle_approach": "1–2 sentences suggesting a specific angle or hook for framing this topic for the target avatar.",
    "details": "2–4 bullet points or sentences with specific statistics, names, findings, data points, or source names.",
    "relevance": "2–3 sentences explaining why this topic and its details are relevant and insightful for the target avatar."
  },
  "idea_2": { ...same structure... },
  "idea_3": { ...same structure... }
}

Constraint check before you output:
- Output is ONLY valid JSON
- Three distinct topics with genuinely different angles
- Content is based on research within the 7-day window
- No conversational text before or after the JSON`,
    systemPrompt: null,
    toolsAllowed: ["web_search"],
    inputSchema: {
      type: "object",
      required: ["avatar", "problem", "country", "current_date"],
      properties: {
        avatar: {
          type: "string",
          description: "Target audience description (e.g., 'UK-based aesthetic clinic owners').",
        },
        problem: {
          type: "string",
          description: "The problem your offer solves for them.",
        },
        country: {
          type: "string",
          description: "Target country (ISO name, e.g., 'UK', 'US').",
        },
        current_date: {
          type: "string",
          description: "Today's date in YYYY-MM-DD format.",
        },
      },
    },
    tags: ["tier1", "research", "news"],
  },

  // ========================================================================
  // 12. LinkedIn Comment Writer
  // ========================================================================
  {
    name: "LinkedIn Comment Writer",
    description:
      "Generates 3 on-brand LinkedIn comments for a given post: one short (3–8 words) and two mid-length (2–4 sentences). Takes a tone-of-voice guide so comments sound like you. Source: Vault / 👨‍✈️ 44) 100X Your LinkedIn.",
    prompt: `You are an AI tasked with creating three LinkedIn comment responses that add value to a conversation. You are only capable of responding in the tone of voice provided below. Your primary goal is to create engaging, authentic comments that align with the tone of voice and contribute meaningfully to the conversation.

TONE OF VOICE:
{{tone_of_voice}}

POST:
{{post_text}}

EXISTING COMMENTS ON THE POST:
{{existing_comments}}

INSTRUCTIONS:

1. Carefully read and internalize the tone of voice above. All three comments must adhere to it.
2. Generate exactly 3 responses:
   - One short response (3–8 words)
   - Two mid-length responses (2–4 sentences each)
3. You MUST add value. Vary the tone and perspective — a value-add, a question, and optionally some humor if appropriate.
4. Occasionally refer to specific points from the post, where helpful.
5. Analyze the existing comments for themes and sentiments. Avoid repeating ideas that have already been extensively discussed. You can build on them but don't reference them directly.
6. Address any unanswered questions or unexplored angles related to the post's topic.
7. For longer responses, use emojis or bullet points if it aligns with the tone of voice.

OUTPUT FORMAT — return ONLY this JSON, no other text:

{
  "1": "Short response here",
  "2": "Mid-length response here",
  "3": "Mid-length response here"
}`,
    systemPrompt: null,
    toolsAllowed: [],
    inputSchema: {
      type: "object",
      required: ["post_text", "tone_of_voice"],
      properties: {
        post_text: {
          type: "string",
          description: "The full text of the LinkedIn post you want to comment on.",
        },
        existing_comments: {
          type: "string",
          description: "Existing top comments on the post (to avoid repeating them).",
        },
        tone_of_voice: {
          type: "string",
          description: "Your tone of voice guidelines. Paste in a style guide or short description of how you write.",
        },
      },
    },
    tags: ["tier1", "linkedin", "comments"],
  },

  // ========================================================================
  // 13. Sales Intelligence Analyst (Subject Line + I-Noticed Opener)
  // ========================================================================
  {
    name: "Sales Intelligence Analyst",
    description:
      "Takes prospect research and generates the subject line + 'I noticed' opener for a cold email, following the ACQ formula. Output is a tight, casual, factual trigger-event line — not a congratulations. Source: Vault / 💷 110) UNLIMITED leads for FREE.",
    prompt: `You are a sales intelligence analyst. You've been given comprehensive research data about a prospect.

PROSPECT: {{company_name}}

RESEARCH DATA:
{{prospect_research}}

CONTEXT — THE FULL EMAIL TEMPLATE THIS FEEDS INTO:

Hi {FirstName},
I noticed {Company} recently {specific trigger event}.
Most companies scaling this fast hit the same bottleneck: {pain point}.
We helped {similar company} solve this and saw {metric} in 60 days.
Worth a 15-min chat to see if we can do the same for {Company}?

YOUR JOB: Create the subject line and the "I noticed" trigger event line.

═══════════════════════════════════════════════════════════

1) SUBJECT LINE

Format: "Quick question about {{company_name}}'s [trigger event]"

RULES:
- MUST start with: "Quick question about {{company_name}}'s"
- Fill in the trigger event at the end
- Total subject line: 11 words maximum
- Trigger event starts with lowercase (unless proper noun)

GOOD EXAMPLES:
- "Quick question about Tesla's new Texas Gigafactory"
- "Quick question about Stripe's Mastercard partnership"
- "Quick question about Executive Leaders Network's London summit"

═══════════════════════════════════════════════════════════

2) BODY LINE — The "I noticed" opener

Format: "I noticed {{company_name}} recently [factual insight about growth/activity]."

CRITICAL:
- This line flows INTO "Most companies scaling this fast hit the same bottleneck..."
- You are NOT congratulating them
- You are NOT making a complete thought
- You are just stating a FACT about what they recently did
- This fact should indicate growth/activity that might create pain points

RULES:
- MUST start with: "I noticed {{company_name}} recently"
- Use PAST TENSE verb (hosted, raised, expanded, launched, opened, hired, added)
- CASUAL and SHORT (under 15 words total)
- State a FACT, not an opinion
- No congratulations, no compliments
- No exact dates, no country codes, no formal location formats

GOOD EXAMPLES:
- "I noticed Tesla recently opened their fifth Gigafactory in Texas."
- "I noticed Stripe recently expanded into 3 new European markets."
- "I noticed your team recently hired 50+ sales reps in Q4."

WHAT TO LOOK FOR IN THE DATA — recent activities indicating GROWTH:
- Hosted a big event
- Raised funding
- Expanded to new markets
- Hired lots of people
- Launched new product/service
- Opened new office
- Partnered with a big company
- Hit a revenue/user milestone

OUTPUT — ONLY this JSON (no markdown, no code blocks):

{
  "subject": "Quick question about {{company_name}}'s [trigger event]",
  "body": "I noticed {{company_name}} recently [factual insight]."
}`,
    systemPrompt: null,
    toolsAllowed: [],
    inputSchema: {
      type: "object",
      required: ["company_name", "prospect_research"],
      properties: {
        company_name: {
          type: "string",
          description: "The prospect company name exactly as you want it to appear.",
        },
        prospect_research: {
          type: "string",
          description: "Raw research data about the prospect — recent news, funding, hires, expansions, launches, etc.",
        },
      },
    },
    tags: ["tier1", "sales", "email"],
  },

  // ========================================================================
  // 14. Website Content Summarizer
  // ========================================================================
  {
    name: "Website Content Summarizer",
    description:
      "Takes raw website text and returns a 50-word summary plus up to 5 distinctive facts as structured JSON. Good preprocessing step for any sales or research pipeline. Source: Vault / 💷 110) UNLIMITED leads for FREE.",
    prompt: `You are an AI assistant tasked with analyzing website content. You will receive text extracted from a website.

WEBSITE TEXT:
{{website_text}}

YOUR TASK:

1. SUMMARY (50 words maximum)
Write a concise summary of the company/organization, including what they do, who they serve, and their main value proposition.

2. FACTS (up to 5 bullet points)
Identify distinctive characteristics such as:
- Recent awards or recognition
- Unique selling propositions
- Notable achievements or milestones
- Specialized services or products
- Industry differentiators

You MUST respond with ONLY valid JSON in this exact format:

{
  "summary": "Your 50-word summary here",
  "facts": [
    "Fact 1",
    "Fact 2",
    "Fact 3",
    "Fact 4",
    "Fact 5"
  ]
}

Do not include any text before or after the JSON. If fewer than 5 facts are found, include only what's available.

EXAMPLE OUTPUT:

{
  "summary": "GreenTech Solutions is a sustainable energy company founded in 2018, specializing in solar panel installation for residential and commercial properties across California. They offer end-to-end services including consultation, installation, and maintenance, with a focus on reducing carbon footprints while lowering energy costs for their 5,000+ clients.",
  "facts": [
    "Winner of the 2024 California Clean Energy Award",
    "Proprietary AI-powered energy optimization system that increases efficiency by 30%",
    "First solar company in the state to achieve B-Corp certification",
    "25-year warranty on all installations, 5 years above industry standard",
    "Partnership with local schools to provide free solar education programs"
  ]
}`,
    systemPrompt: null,
    toolsAllowed: [],
    inputSchema: {
      type: "object",
      required: ["website_text"],
      properties: {
        website_text: {
          type: "string",
          description: "Raw text extracted from a website (home page, about page, etc.).",
        },
      },
    },
    tags: ["tier1", "research", "summarization"],
  },

  // ========================================================================
  // 15. Spark Email Writer
  // ========================================================================
  {
    name: "Spark Email Writer",
    description:
      "Writes a short, punchy email body tailored to a recipient, given a campaign idea, company info, and personal details. Output is just the body — subject and signature live elsewhere. Source: Vault / 🥷🏿 61) AI Client Intelligence System.",
    prompt: `You are an email writer. Generate a concise and impactful email body designed to achieve a specified objective.

Ensure the email is:
- Short, punchy, and adheres to email best practices (strong call-to-action, scannable formatting)
- Aligned with the intended tone of voice (professional, friendly, persuasive, etc.)
- Tailored to maximize relevance for the recipient, personalizing only when necessary
- Clear, engaging, and effective — focused and actionable

You will write ONLY the body of the email. No subject line, no greeting, no signature.

INPUTS:

1) Email idea / campaign objective:
{{email_idea}}

2) Relevant info about the company being contacted:
{{company_info}}

3) Recipient details — personalize for {{recipient_name}}, using this information about them where it helps:
{{recipient_info}}

Write the email body now.`,
    systemPrompt: null,
    toolsAllowed: [],
    inputSchema: {
      type: "object",
      required: ["email_idea", "recipient_name"],
      properties: {
        email_idea: {
          type: "string",
          description: "The campaign idea or objective of this email.",
        },
        company_info: {
          type: "string",
          description: "Relevant info about the company being contacted.",
        },
        recipient_name: {
          type: "string",
          description: "First name of the recipient.",
        },
        recipient_info: {
          type: "string",
          description: "Personal details about the recipient for personalization.",
        },
      },
    },
    tags: ["tier1", "email", "copywriting"],
  },
];

// --------------------------------------------------------------------------
// Runner
// --------------------------------------------------------------------------

async function main() {
  console.log(`[tier1-seed] inserting ${SEED_TASKS.length} tasks...`);

  let inserted = 0;
  let skipped = 0;

  for (const task of SEED_TASKS) {
    const existing = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(sql`${tasks.name} = ${task.name}`);

    if (existing.length > 0) {
      console.log(`  [skip] ${task.name} (already exists)`);
      skipped++;
      continue;
    }

    const [row] = await db.insert(tasks).values(task).returning();
    console.log(`  [ok]   ${row.name}  ·  ${(row.tags ?? []).join(", ")}`);
    inserted++;
  }

  console.log(
    `[tier1-seed] done · inserted ${inserted} · skipped ${skipped} (already existed)`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[tier1-seed] failed:", err);
  process.exit(1);
});
