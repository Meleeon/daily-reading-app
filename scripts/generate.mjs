/**
 * Daily Passage Generator 鈥?Real Article Edition
 *
 * Fetches real articles from open-access RSS feeds (MIT Press Reader,
 * The Paris Review, Aeon), extracts excerpts, generates Chinese
 * translations via DeepSeek, and stores in Supabase.
 *
 * Environment variables:
 *   SUPABASE_URL         - Supabase project URL
 *   SUPABASE_SERVICE_KEY - Supabase service_role key
 *   DEEPSEEK_API_KEY     - DeepSeek API key
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// 鈹€鈹€鈹€ Config 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: DEEPSEEK_API_KEY,
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// 鈹€鈹€鈹€ RSS Feeds (all open-access) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const RSS_FEEDS = [
  {
    name: 'The MIT Press Reader',
    url: 'https://thereader.mitpress.mit.edu/feed/',
    category: 'academic',
  },
  {
    name: 'The Paris Review',
    url: 'https://www.theparisreview.org/blog/feed/',
    category: 'literary',
  },
  {
    name: 'Aeon',
    url: 'https://aeon.co/feed.rss',
    category: 'essay',
  },
];

// 鈹€鈹€鈹€ Fetch & Parse RSS 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
async function fetchRSS(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'DailyReadingApp/1.0 (educational tool)' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return await resp.text();
}

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    items.push({
      title: extractTag(itemXml, 'title'),
      link: extractTag(itemXml, 'link'),
      creator: extractTag(itemXml, 'dc:creator') || extractTag(itemXml, 'author'),
      pubDate: extractTag(itemXml, 'pubDate'),
      description: extractTag(itemXml, 'description'),
      contentEncoded: extractTag(itemXml, 'content:encoded'),
    });
  }
  return items;
}

function extractTag(xml, tag) {
  // Handle tags with or without CDATA
  const cdataMatch = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, 'i');
  const cdataResult = xml.match(cdataMatch);
  if (cdataResult) return cdataResult[1].trim();

  const plainMatch = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const plainResult = xml.match(plainMatch);
  if (plainResult) return plainResult[1].replace(/<[^>]+>/g, '').trim();

  return '';
}

// 鈹€鈹€鈹€ Extract Clean Text 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, '...')
    .replace(/&#8212;/g, '鈥?)
    .replace(/&#8211;/g, '鈥?)
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractExcerpt(text, maxWords = 420) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  // Find a good sentence boundary near maxWords
  let count = 0;
  let excerpt = '';
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  for (const sentence of sentences) {
    const sentenceWords = sentence.trim().split(/\s+/).length;
    if (count + sentenceWords > maxWords && count > maxWords * 0.6) break;
    excerpt += sentence + ' ';
    count += sentenceWords;
  }
  // Fallback: just take first maxWords words
  if (count < 100) {
    excerpt = words.slice(0, maxWords).join(' ');
    count = Math.min(maxWords, words.length);
  }
  return { excerpt: excerpt.trim(), wordCount: count };
}

// 鈹€鈹€鈹€ Generate Chinese Translation 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
async function translate(text, title) {
  const response = await deepseek.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: `You are a professional literary translator translating English to Chinese (Simplified). 
Translate the following English passage into natural, fluent Chinese. 
Preserve the academic/literary tone. Use appropriate Chinese idioms and expressions.
Return ONLY the Chinese translation, nothing else. No JSON, no explanation.`,
      },
      {
        role: 'user',
        content: `Translate this passage into Chinese:\n\nTitle: ${title}\n\n${text}`,
      },
    ],
    temperature: 0.4,
    max_tokens: 4096,
  });
  return response.choices[0].message.content.trim();
}

function generateTags(text, sourceName) {
  const tags = [];
  const lower = text.slice(0, 500).toLowerCase();

  const tagMap = {
    architecture: ['architecture', 'architect', 'building', 'urban', 'design', 'spatial', 'built environment'],
    technology: ['technology', 'digital', 'computer', 'software', 'code', 'internet', 'algorithm', 'ai', 'machine learning'],
    literature: ['novel', 'fiction', 'narrative', 'author', 'writer', 'poetry', 'literary', 'story'],
    politics: ['political', 'government', 'democracy', 'power', 'democratic', 'republican', 'policy', 'election', 'state'],
    philosophy: ['philosophy', 'philosopher', 'ethics', 'moral', 'consciousness', 'existential', 'epistemology'],
    history: ['history', 'historical', 'ancient', 'century', 'medieval', 'modern', 'era', 'age'],
    science: ['science', 'scientific', 'biology', 'physics', 'chemistry', 'research', 'experiment', 'theory'],
    environment: ['climate', 'environmental', 'carbon', 'emission', 'sustainability', 'ecology', 'nature', 'earth'],
    art: ['art', 'artist', 'painting', 'sculpture', 'aesthetic', 'gallery', 'museum', 'visual'],
    psychology: ['psychology', 'cognitive', 'behavior', 'mental', 'brain', 'neuroscience', 'emotion', 'mind'],
    society: ['social', 'society', 'community', 'culture', 'cultural', 'identity', 'race', 'gender', 'class', 'public'],
    economics: ['economic', 'economy', 'market', 'capital', 'finance', 'labor', 'work', 'trade'],
    space: ['space', 'moon', 'mars', 'nasa', 'astronaut', 'galaxy', 'cosmic', 'planet', 'orbit'],
    medicine: ['medicine', 'medical', 'health', 'disease', 'patient', 'clinical', 'treatment', 'therapy', 'surgery'],
    law: ['law', 'legal', 'court', 'justice', 'rights', 'constitution', 'supreme', 'judge'],
    education: ['education', 'school', 'student', 'teacher', 'learning', 'university', 'academic', 'curriculum'],
    music: ['music', 'musical', 'composer', 'song', 'sound', 'melody', 'orchestra', 'concert'],
  };

  for (const [tag, keywords] of Object.entries(tagMap)) {
    if (keywords.some(k => lower.includes(k))) {
      tags.push(tag);
    }
  }

  // Ensure at least some tags
  if (tags.length === 0) tags.push('essay');
  if (sourceName) tags.push(sourceName.toLowerCase().replace(/\s+/g, ''));
  return [...new Set(tags)].slice(0, 5);
}

// 鈹€鈹€鈹€ Already-seen URL tracking 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
async function getKnownUrls() {
  const { data, error } = await supabase
    .from('passages')
    .select('source');
  if (error) return new Set();
  const urls = new Set();
  for (const row of data || []) {
    // Extract URL from source citation
    const urlMatch = row.source?.match(/https?:\/\/[^\s"]+/);
    if (urlMatch) urls.add(urlMatch[0]);
    // Also check raw source field if it is a URL
    if (row.source?.startsWith('http')) urls.add(row.source);
  }
  return urls;
}

// 鈹€鈹€鈹€ Main 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
async function main() {
  console.log('=== Daily Reading Generator (Real Articles) ===');
  console.log(`Time: ${new Date().toISOString()}`);

  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_KEY');
  if (!DEEPSEEK_API_KEY) missing.push('DEEPSEEK_API_KEY');
  if (missing.length > 0) {
    console.error(`Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  const knownUrls = await getKnownUrls();
  console.log(`Known articles in DB: ${knownUrls.size}`);

  // Collect all articles from all feeds
  let allArticles = [];
  for (const feed of RSS_FEEDS) {
    try {
      console.log(`\nFetching ${feed.name}...`);
      const xml = await fetchRSS(feed.url);
      const items = parseRSS(xml);
      console.log(`  Found ${items.length} items`);

      for (const item of items) {
        // Skip if we've already seen this article
        if (knownUrls.has(item.link)) {
          continue;
        }

        const rawText = item.contentEncoded || item.description || '';
        const cleanText = stripHtml(rawText);

        if (cleanText.length < 200) continue;

        const { excerpt, wordCount } = extractExcerpt(cleanText, 420);

        allArticles.push({
          title: item.title,
          en: excerpt,
          wordCount,
          source: item.link,
          author: item.creator || '',
          publication: feed.name,
          pubDate: item.pubDate,
          category: feed.category,
        });
      }
    } catch (err) {
      console.error(`  Error fetching ${feed.name}:`, err.message);
    }
  }

  // Deduplicate by title similarity
  const seenTitles = new Set();
  allArticles = allArticles.filter(a => {
    const key = a.title.slice(0, 40).toLowerCase();
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });

  console.log(`\nTotal new articles available: ${allArticles.length}`);

  if (allArticles.length === 0) {
    console.log('No new articles to process. Skipping.');
    return;
  }

  // Process the best article (prefer MIT Press Reader for quality)
  const sorted = allArticles.sort((a, b) => {
    const order = { academic: 1, essay: 2, literary: 3 };
    return (order[a.category] || 4) - (order[b.category] || 4);
  });

  const chosen = sorted[0];
  console.log(`\nProcessing: "${chosen.title}"`);
  console.log(`  Source: ${chosen.publication}`);
  console.log(`  Author: ${chosen.author || 'Unknown'}`);
  console.log(`  Words: ${chosen.wordCount}`);
  console.log(`  URL: ${chosen.source}`);

  // Generate Chinese translation
  console.log('\n[1/2] Translating via DeepSeek...');
  let zh;
  try {
    zh = await translate(chosen.en, chosen.title);
  } catch (err) {
    console.error('  Translation failed:', err.message);
    // Fallback: skip the translation and insert with a placeholder
    zh = '锛堢炕璇戠敓鎴愬け璐ワ紝璇风◢鍚庨噸璇曘€傦級';
  }

  // Build citation
  const sourceCitation = chosen.author
    ? `${chosen.author}, "${chosen.title}," ${chosen.publication}, ${chosen.pubDate ? new Date(chosen.pubDate).getFullYear() : new Date().getFullYear()}. ${chosen.source}`
    : `"${chosen.title}," ${chosen.publication}. ${chosen.source}`;

  const tags = chosen.category === 'essay'
    ? generateTags(chosen.en, chosen.publication)
    : [chosen.category, chosen.publication.toLowerCase().replace(/\s+/g, '-')];

  // Insert into Supabase
  console.log('\n[2/2] Inserting into Supabase...');
  const { data, error } = await supabase
    .from('passages')
    .insert({
      title: chosen.title,
      en: chosen.en,
      zh: zh,
      source: sourceCitation,
      tags: tags,
      difficulty: 'advanced',
      word_count: chosen.wordCount,
    })
    .select()
    .single();

  if (error) {
    console.error('  Insert failed:', error.message);
    process.exit(1);
  }

  console.log(`\nDone! Passage #${data.id} inserted.`);
  console.log(`  Title: "${data.title}"`);
  console.log(`  URL: ${chosen.source}`);
}

main();
