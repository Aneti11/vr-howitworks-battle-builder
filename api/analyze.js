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
// КЛЮЧИ GEMINI — ротация при исчерпании квоты
// ====================================================
function getGeminiKeys(env) {
  const keys = [
    env.GEMINI_API_KEY,
    env.GEMINI_API_KEY_kuchuguraanna,
    env.GEMINI_API_KEY_hannakuchuhura,
    env.GEMINI_API_KEY_anna_0951118939,
    env.GEMINI_API_KEY_anyauwow,
    env.GEMINI_API_KEY_viacarotta,
    env.GEMINI_API_KEY_acket_rom,
  ].filter(Boolean);
  return keys;
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
// GEMINI — с автоматической ротацией ключей
// ====================================================
function isQuotaError(data) {
  if (!data.error) return false;
  const msg = data.error.message || '';
  return msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED') || data.error.code === 429;
}

async function askGemini(prompt, keys) {
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
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

      if (isQuotaError(data)) {
        console.log(`Ключ ${i + 1} исчерпан, пробуем следующий...`);
        continue;
      }

      if (data.error) throw new Error(data.error.message);
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Нет ответа.';
    } catch (err) {
      if (i === keys.length - 1) throw err;
      console.log(`Ключ ${i + 1} ошибка, пробуем следующий...`);
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
    const keys = getGeminiKeys(req.env || process.env);

    if (keys.length === 0) {
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

    const answer = await askGemini(prompt, keys);
    return res.status(200).json({ result: answer });

  } catch (err) {
    console.error('API error:', err.message);
    if (err.message === 'QUOTA_EXHAUSTED') {
      return res.status(503).json({ error: 'QUOTA_EXHAUSTED' });
    }
    return res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
}
