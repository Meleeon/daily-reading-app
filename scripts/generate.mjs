/**
 * Daily Passage Generator - Real Article Edition
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
import { writeFileSync } from 'node:fs';

// ---- Config ---------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: DEEPSEEK_API_KEY,
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ---- RSS Feeds (all open-access) ------------------------------------------
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

// ---- Fetch & Parse RSS ----------------------------------------------------
async function fetchRSS(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'DailyReadingApp/1.0 (educational tool)' },
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' for ' + url);
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
  // Handle tags with CDATA
  const cdataPattern = '<' + tag + '[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>';
  const cdataMatch = xml.match(new RegExp(cdataPattern, 'i'));
  if (cdataMatch) return cdataMatch[1].trim();

  // Handle plain tags
  const plainPattern = '<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>';
  const plainMatch = xml.match(new RegExp(plainPattern, 'i'));
  if (plainMatch) return plainMatch[1].replace(/<[^>]+>/g, '').trim();

  return '';
}

// ---- Extract Clean Text ---------------------------------------------------
function asciify(text) {
  // Convert Unicode punctuation and special characters to ASCII equivalents
  return text
    .replace(/\u2018|\u2019|\u201A|\u2032/g, "'")
    .replace(/\u201C|\u201D|\u201E|\u2033/g, '"')
    .replace(/\u2014|\u2015/g, '---')
    .replace(/\u2013|\u2012/g, '--')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/\u00AD/g, '')
    .replace(/\u200B/g, '')
    .replace(/[\u0080-\u00FF]/g, function(c) {
      // Latin-1 supplement: try to keep basic chars
      return c;
    })
    .replace(/[\u0100-\uFFFF]/g, '');
}

function stripHtml(html) {
  return asciify(html
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
    .replace(/&#8212;/g, '---')
    .replace(/&#8211;/g, '--')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, function(_, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/\s+/g, ' ')
    .trim());
}

function extractExcerpt(text, maxWords) {
  maxWords = maxWords || 420;
  const words = text.split(/\s+/).filter(function(w) { return w.length > 0; });
  // Find a good sentence boundary near maxWords
  var count = 0;
  var excerpt = '';
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  for (var i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
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

// ---- Generate Chinese Translation -----------------------------------------
async function translate(text, title) {
  const response = await deepseek.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: 'You are a professional literary translator translating English to Chinese (Simplified). Translate the following English passage into natural, fluent Chinese. Preserve the academic/literary tone. Use appropriate Chinese idioms and expressions. Return ONLY the Chinese translation, nothing else. NO JSON, NO explanation.',
      },
      {
        role: 'user',
        content: 'Translate this passage into Chinese:\n\nTitle: ' + title + '\n\n' + text,
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
    technology: ['technology', 'digital', 'computer', 'software', 'code', 'internet', 'algorithm', 'machine learning'],
    literature: ['novel', 'fiction', 'narrative', 'author', 'writer', 'poetry', 'literary', 'story'],
    politics: ['political', 'government', 'democracy', 'power', 'democratic', 'policy', 'election', 'state'],
    philosophy: ['philosophy', 'philosopher', 'ethics', 'moral', 'consciousness', 'existential', 'epistemology'],
    history: ['history', 'historical', 'ancient', 'century', 'medieval', 'modern', 'era'],
    science: ['science', 'scientific', 'biology', 'physics', 'chemistry', 'research', 'experiment', 'theory'],
    environment: ['climate', 'environmental', 'carbon', 'emission', 'sustainability', 'ecology', 'nature'],
    art: ['art', 'artist', 'painting', 'sculpture', 'aesthetic', 'gallery', 'museum', 'visual'],
    psychology: ['psychology', 'cognitive', 'behavior', 'mental', 'brain', 'neuroscience', 'emotion', 'mind'],
    society: ['social', 'society', 'community', 'culture', 'cultural', 'identity', 'race', 'gender', 'class', 'public'],
    economics: ['economic', 'economy', 'market', 'capital', 'finance', 'labor', 'work', 'trade'],
    space: ['space', 'moon', 'mars', 'nasa', 'astronaut', 'galaxy', 'cosmic', 'planet', 'orbit'],
    medicine: ['medicine', 'medical', 'health', 'disease', 'patient', 'clinical', 'treatment', 'therapy'],
    education: ['education', 'school', 'student', 'teacher', 'learning', 'university', 'academic'],
    music: ['music', 'musical', 'composer', 'song', 'sound', 'melody', 'orchestra', 'concert'],
  };

  for (var key in tagMap) {
    if (tagMap[key].some(function(k) { return lower.indexOf(k) !== -1; })) {
      tags.push(key);
    }
  }

  if (tags.length === 0) tags.push('essay');
  if (sourceName) tags.push(sourceName.toLowerCase().replace(/\s+/g, ''));
  return tags.slice(0, 5).filter(function(v, i, a) { return a.indexOf(v) === i; });
}

// ---- Already-seen URL tracking --------------------------------------------
async function getKnownUrls() {
  const { data, error } = await supabase
    .from('passages')
    .select('source');
  if (error) return new Set();
  const urls = new Set();
  for (var i = 0; i < (data || []).length; i++) {
    const row = data[i];
    const urlMatch = row.source && row.source.match(/https?:\/\/[^\s"]+/);
    if (urlMatch) urls.add(urlMatch[0]);
    if (row.source && row.source.startsWith('http')) urls.add(row.source);
  }
  return urls;
}

// ---- Main -----------------------------------------------------------------
async function main() {
  console.log('=== Daily Reading Generator (Real Articles) ===');
  console.log('Time: ' + new Date().toISOString());

  var missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_KEY');
  if (!DEEPSEEK_API_KEY) missing.push('DEEPSEEK_API_KEY');
  if (missing.length > 0) {
    console.error('Missing env vars: ' + missing.join(', '));
    process.exit(1);
  }

  const knownUrls = await getKnownUrls();
  console.log('Known articles in DB: ' + knownUrls.size);

  // Collect all articles from all feeds
  var allArticles = [];
  for (var f = 0; f < RSS_FEEDS.length; f++) {
    const feed = RSS_FEEDS[f];
    try {
      console.log('\nFetching ' + feed.name + '...');
      const xml = await fetchRSS(feed.url);
      const items = parseRSS(xml);
      console.log('  Found ' + items.length + ' items');

      for (var j = 0; j < items.length; j++) {
        const item = items[j];
        if (knownUrls.has(item.link)) continue;

        const rawText = item.contentEncoded || item.description || '';
        const cleanText = stripHtml(rawText);

        if (cleanText.length < 200) continue;

        const result = extractExcerpt(cleanText, 420);

        allArticles.push({
          title: item.title,
          en: result.excerpt,
          wordCount: result.wordCount,
          source: item.link,
          author: item.creator || '',
          publication: feed.name,
          pubDate: item.pubDate,
          category: feed.category,
        });
      }
    } catch (err) {
      console.error('  Error fetching ' + feed.name + ': ' + err.message);
    }
  }

  // Deduplicate by title
  var seenTitles = new Set();
  allArticles = allArticles.filter(function(a) {
    var key = a.title.slice(0, 40).toLowerCase();
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });

  console.log('\nTotal new articles available: ' + allArticles.length);

  if (allArticles.length === 0) {
    console.log('No new articles to process. Skipping.');
    return;
  }

  // Process the best article
  allArticles.sort(function(a, b) {
    var order = { academic: 1, essay: 2, literary: 3 };
    return (order[a.category] || 4) - (order[b.category] || 4);
  });

  const chosen = allArticles[0];
  console.log('\nProcessing: "' + chosen.title + '"');
  console.log('  Source: ' + chosen.publication);
  console.log('  Author: ' + (chosen.author || 'Unknown'));
  console.log('  Words: ' + chosen.wordCount);
  console.log('  URL: ' + chosen.source);

  // Generate Chinese translation
  console.log('\n[1/2] Translating via DeepSeek...');
  var zh;
  try {
    zh = await translate(chosen.en, chosen.title);
  } catch (err) {
    console.error('  Translation failed: ' + err.message);
    zh = '(Translation unavailable, please try again later.)';
  }

  // Build citation
  var year = chosen.pubDate ? new Date(chosen.pubDate).getFullYear() : new Date().getFullYear();
  var sourceCitation;
  if (chosen.author) {
    sourceCitation = chosen.author + ', "' + chosen.title + '," ' + chosen.publication + ', ' + year + '. ' + chosen.source;
  } else {
    sourceCitation = '"' + chosen.title + '," ' + chosen.publication + '. ' + chosen.source;
  }

  var tags = [chosen.category, chosen.publication.toLowerCase().replace(/\s+/g, '-')];
  // Add auto-detected tags
  var detectedTags = generateTags(chosen.en, chosen.publication);
  tags = tags.concat(detectedTags).filter(function(v, i, a) { return a.indexOf(v) === i; }).slice(0, 6);

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
    console.error('  Insert failed: ' + error.message);
    process.exit(1);
  }

  console.log('\nDone! Passage #' + data.id + ' inserted.');
  console.log('  Title: "' + data.title + '"');
  console.log('  URL: ' + chosen.source);

  // Export all passages to JSON for offline/China fallback
  const { data: allPassages, error: fetchErr } = await supabase
    .from('passages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (!fetchErr && allPassages) {
    writeFileSync('passages-data.json', JSON.stringify(allPassages, null, 2));
    console.log('  Exported ' + allPassages.length + ' passages to passages-data.json');
  }
}

main();
