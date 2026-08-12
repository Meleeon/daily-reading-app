/**
 * Daily Passage Generator using DeepSeek API
 *
 * Runs daily via GitHub Actions to generate a new English reading passage
 * and insert it into Supabase.
 *
 * Environment variables:
 *   SUPABASE_URL        - Your Supabase project URL
 *   SUPABASE_SERVICE_KEY - Supabase service_role key (not anon key!)
 *   DEEPSEEK_API_KEY    - DeepSeek API key
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ─── Config ────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: DEEPSEEK_API_KEY,
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Topics pool for variety ──────────────────────────────────────────────
const TOPICS = [
  'contemporary architectural theory and phenomenology of space',
  'sustainable materials and ecological design in architecture',
  'urban planning, public space, and the right to the city',
  'digital fabrication, parametric design, and computational architecture',
  'vernacular architecture and climate-responsive design in developing regions',
  'adaptive reuse of industrial heritage and post-industrial landscapes',
  'the relationship between infrastructure, landscape, and urban ecology',
  'architectural acoustics and sensory experience of built environments',
  'social housing experiments and affordable housing innovations',
  'contemporary literature exploring diaspora, migration, and cultural identity',
  'architectural criticism and the ethics of contemporary practice',
  'biophilic design and the integration of nature into the built environment',
  'museum and library architecture as heterotopic public spaces',
  'timber construction and mass wood technologies in high-rise buildings',
  'postmodern literary aesthetics in Anglophone fiction',
  'the intersection of AI, generative design, and architectural authorship',
];

const AUTHORS = [
  'Juhani Pallasmaa',
  'Kenneth Frampton',
  'Rem Koolhaas',
  'Keller Easterling',
  'Mario Carpo',
  'Bjarke Ingels',
  'Elisa Iturbe',
  'Reinier de Graaf',
  'Beatriz Colomina',
  'Mark Wigley',
  'Joan Didion',
  'Zadie Smith',
  'Teju Cole',
  'Jhumpa Lahiri',
  'Chimamanda Ngozi Adichie',
  'Ocean Vuong',
];

const JOURNALS = [
  'Log',
  'Architectural Review',
  'AA Files',
  'Harvard Design Magazine',
  'e-flux Architecture',
  'The Architectural Review',
  'Domus',
  'El Croquis',
  'Architectural Design (AD)',
  'Journal of Architectural Education',
  'Places Journal',
];

// ─── Generate passage ──────────────────────────────────────────────────────
async function generatePassage() {
  const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  const author = AUTHORS[Math.floor(Math.random() * AUTHORS.length)];
  const journal = JOURNALS[Math.floor(Math.random() * JOURNALS.length)];
  const year = 2020 + Math.floor(Math.random() * 6);

  const systemPrompt = `You are an expert writer and architectural scholar. Generate a high-quality English passage for daily reading practice.
The passage must:
- Be approximately 380-420 words
- Sound like a genuine excerpt from a scholarly article, essay, or book chapter
- Use sophisticated vocabulary (GRE/advanced level), complex sentence structures with subordinate clauses, and academic register
- NOT use overly simple sentences or basic vocabulary
- Include nuanced arguments, theoretical depth, and precise terminology
- Follow the stylistic conventions of architectural theory or literary criticism
- End with a natural, satisfying conclusion to the excerpt

Respond with a JSON object containing:
{
  "title": "A compelling academic-style title",
  "en": "The English passage (380-420 words)",
  "zh": "Accurate, literary-quality Chinese translation",
  "source": "A realistic citation (Author, \"Work Title\", Publisher/Journal, Year)",
  "tags": ["3-5", "relevant", "tags"]
}`;

  const userPrompt = `Write an excerpt in the style of ${author}, about: ${topic}.
Cite the source as if published in ${journal} (${year}).
The vocabulary should be at GRE/graduate level difficulty.`;

  console.log(`Generating passage on: ${topic}`);
  console.log(`Style: ${author} | Journal: ${journal} | Year: ${year}`);

  const response = await deepseek.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.9,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0].message.content;
  console.log('Raw response length:', raw.length);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // Try to extract JSON from markdown code blocks
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      parsed = JSON.parse(match[1]);
    } else {
      throw new Error(`Failed to parse response: ${raw.substring(0, 200)}`);
    }
  }

  // Validate required fields
  if (!parsed.title || !parsed.en || !parsed.zh || !parsed.source) {
    throw new Error(`Missing required fields. Got: ${Object.keys(parsed).join(', ')}`);
  }

  const wordCount = parsed.en.split(/\s+/).filter(w => w.length > 0).length;
  parsed.word_count = wordCount;
  parsed.difficulty = 'advanced';
  parsed.tags = parsed.tags || [];

  console.log(`Generated: "${parsed.title}" (${wordCount} words)`);
  return parsed;
}

// ─── Insert into Supabase ──────────────────────────────────────────────────
async function insertPassage(passage) {
  const { data, error } = await supabase
    .from('passages')
    .insert({
      title: passage.title,
      en: passage.en,
      zh: passage.zh,
      source: passage.source,
      tags: passage.tags,
      difficulty: passage.difficulty,
      word_count: passage.word_count,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }

  console.log(`Inserted passage #${data.id}: "${data.title}"`);
  return data;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Daily Reading Generator ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // Check env vars
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_KEY');
  if (!DEEPSEEK_API_KEY) missing.push('DEEPSEEK_API_KEY');
  if (missing.length > 0) {
    console.error(`Missing environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  try {
    // 1. Generate passage
    console.log('\n[1/3] Generating passage via DeepSeek...');
    const passage = await generatePassage();

    // 2. Insert into database
    console.log('\n[2/3] Inserting into Supabase...');
    const result = await insertPassage(passage);

    // 3. Verify
    console.log(`\n[3/3] Done! Passage #${result.id} is now live.`);
    console.log(`Total passages in database: will be available on frontend.`);
  } catch (err) {
    console.error('\nFatal error:', err.message);
    process.exit(1);
  }
}

main();
