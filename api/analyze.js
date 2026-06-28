// ====================================================
// GOOGLE DOCS — твои источники данных
// ====================================================
const GOOGLE_DOCS = [
  "https://docs.google.com/document/d/10pTYe4LHdNI5Hjuuk9wcK0airdkDdegglLkxYuWHRbU/edit?usp=sharing",
  "https://docs.google.com/document/d/1awJJymLhGYQKJqVEhMn-DV7A4ROafZ5UNiZHBk8cPr4/edit?usp=sharing",
  "https://docs.google.com/document/d/1p4QqGCSF32tuYfETVUdrpmz9wbhfLin6Jev0lfEop7k/edit?usp=sharing",
  "https://docs.google.com/document/d/1mytnd0ZwuwgpmMLPl0YQFTdFJfgd8_e-isElQb33he0/edit?usp=sharing",
  "https://docs.google.com/document/d/1C18hXJNV1SMIMzI2z6prv3g9_g6MEY1kX9WmUlqRBSA/edit?usp=sharing",
  // Добавляй новые документы сюда:
  // "https://docs.google.com/document/d/ВАШ_ID/edit?usp=sharing",
];

// ====================================================
// ПРОВАЙДЕРЫ — порядок ротации
// ====================================================
function getProviders(env) {
  const providers = [];

  // Groq — основной (быстрый, щедрый лимит)
  if (env.GROQ_API_KEY) {
    providers.push({ type: 'groq', key: env.GROQ_API_KEY });
  }

  // Gemini — запасные ключи
  const geminiKeys = [
    env.GEMINI_API_KEY,
    env.GEMINI_API_KEY_kuchuguraanna,
    env.GEMINI_API_KEY_hannakuchuhura,
    env.GEMINI_API_KEY_anna_0951118939,
    env.GEMINI_API_KEY_anyauwow,
    env.GEMINI_API_KEY_viacarotta,
    env.GEMINI_API_KEY_acket_rom,
  ].filter(Boolean);

  for (const key of geminiKeys) {
    providers.push({ type: 'gemini', key });
  }

  return providers;
}

// ====================================================
// GOOGLE DOCS — читаем текст
// ====================================================
function getDocExportUrl(shareUrl) {
  const match = shareUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  return `https://docs.google.com/document/d/${match[1]}/export?format=txt`;
}

async function fetchDoc(url) {
  try {
    const exportUrl = getDocExportUrl(url);
    if (!exportUrl) return '';
    const res = await fetch(exportUrl);
    if (!res.ok) return '';
    return await res.text();
  } catch { return ''; }
}

async function fetchAllDocs() {
  const texts = await Promise.all(GOOGLE_DOCS.map(fetchDoc));
  return texts.filter(t => t.length > 0).join('\n\n---\n\n');
}

// ====================================================
// ЗАПРОС К GROQ
// ====================================================
async function askGroq(prompt, key) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.3,
    })
  });
  const data = await res.json();
  if (data.error) {
    const isQuota = data.error.code === 'rate_limit_exceeded' || 
                    data.error.type === 'tokens' ||
                    res.status === 429;
    if (isQuota) throw new Error('QUOTA');
    throw new Error(data.error.message);
  }
  return data?.choices?.[0]?.message?.content || 'Нет ответа.';
}

// ====================================================
// ЗАПРОС К GEMINI
// ====================================================
async function askGemini(prompt, key) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2000, temperature: 0.3 }
      })
    }
  );
  const data = await res.json();
  if (data.error) {
    const isQuota = data.error.code === 429 || 
                    (data.error.message || '').includes('quota') ||
                    (data.error.message || '').includes('RESOURCE_EXHAUSTED');
    if (isQuota) throw new Error('QUOTA');
    throw new Error(data.error.message);
  }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Нет ответа.';
}

// ====================================================
// РОТАЦИЯ ПРОВАЙДЕРОВ
// ====================================================
async function askAI(prompt, providers) {
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    try {
      if (p.type === 'groq') return await askGroq(prompt, p.key);
      if (p.type === 'gemini') return await askGemini(prompt, p.key);
    } catch (err) {
      if (err.message === 'QUOTA') {
        console.log(`Провайдер ${i + 1} (${p.type}) исчерпан, пробуем следующий...`);
        continue;
      }
      throw err;
    }
  }
  throw new Error('QUOTA_EXHAUSTED');
}

// ====================================================
// VERCEL HANDLER
// ====================================================
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { mode, troop, season, combatType, combat, hero1, hero2 } = req.body;

    const seasonLabel = { s1: 'Сезон 1', s2: 'Сезон 2', s3: 'Сезон 3', sc: 'Сезон завоеваний' }[season];
    const troopLabel = { infantry: 'Пехота', spearmen: 'Пикинеры', archers: 'Лучники', mixed: 'Смешанный' }[troop];
    const combatTypeLabel = combatType === 'pvp' ? 'PvP' : 'PvE';

    const gameData = await fetchAllDocs();
    const providers = getProviders(process.env);

    if (providers.length === 0) {
      return res.status(500).json({ error: 'Нет доступных API ключей' });
    }

    let query = '';

    if (mode === 'build') {
      query = `Составь полную боевую связку для следующих условий:
- Тип войск: ${troopLabel}
- Сезон: ${seasonLabel}
- Режим боя: ${combatTypeLabel} — ${combat}
- Главный герой: ${hero1}
- Второй герой: ${hero2}

Дай результат в следующем формате:

⚔️ КАПИТАН МАРША
Укажи кто должен быть капитаном и почему (одно предложение).

🔗 СИНЕРГИЯ СВЯЗКИ
Объясни как герои дополняют друг друга (1-2 предложения).

📖 УМЕНИЯ (минимум 4, в порядке приоритета)
Для каждого умения: название — одно предложение обоснования.

🔄 АЛЬТЕРНАТИВНЫЕ УМЕНИЯ (1-4 по твоему выбору)
Для каждого: название — какое из основных заменяет — что это даёт.

🛡️ СНАРЯЖЕНИЕ
Для каждой серии (Благословенное, Монстров, Основное): наиболее подходящий набор.

🐴 СКАКУН
АТК или ЗАЩ — с кратким обоснованием.`;
    }

    const prompt = `Ты — аналитик игры Viking Rise. Используй ТОЛЬКО предоставленные данные. Не придумывай ничего чего нет в источниках. Отвечай на русском языке.

ДАННЫЕ ОБ ИГРЕ:
${gameData}

ЗАПРОС:
${query}`;

    const answer = await askAI(prompt, providers);
    return res.status(200).json({ result: answer });

  } catch (err) {
    console.error('API error:', err.message);
    if (err.message === 'QUOTA_EXHAUSTED') {
      return res.status(503).json({ error: 'QUOTA_EXHAUSTED' });
    }
    return res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
}
