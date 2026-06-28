const GOOGLE_DOCS = [
  "https://docs.google.com/document/d/10pTYe4LHdNI5Hjuuk9wcK0airdkDdegglLkxYuWHRbU/edit?usp=sharing",
  "https://docs.google.com/document/d/1awJJymLhGYQKJqVEhMn-DV7A4ROafZ5UNiZHBk8cPr4/edit?usp=sharing",
  "https://docs.google.com/document/d/1p4QqGCSF32tuYfETVUdrpmz9wbhfLin6Jev0lfEop7k/edit?usp=sharing",
  "https://docs.google.com/document/d/1mytnd0ZwuwgpmMLPl0YQFTdFJfgd8_e-isElQb33he0/edit?usp=sharing",
  "https://docs.google.com/document/d/1C18hXJNV1SMIMzI2z6prv3g9_g6MEY1kX9WmUlqRBSA/edit?usp=sharing",
  // Добавляй новые документы сюда:
  // "https://docs.google.com/document/d/ВАШ_ID/edit?usp=sharing",
];

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

async function askGemini(gameData, query) {
  const prompt = `Ты — аналитик игры Viking Rise. Используй ТОЛЬКО предоставленные данные.

ПРАВИЛА ОТВЕТА:
- Отвечай строго на основе данных. Не придумывай.
- Если данных недостаточно — честно скажи.
- Отвечай на русском языке.
- Используй эмодзи для оформления разделов.

ДАННЫЕ ОБ ИГРЕ:
${gameData}

ЗАПРОС:
${query}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
  if (data.error) throw new Error(data.error.message);
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Нет ответа.';
}

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

    let query = '';

    if (mode === 'build') {
      // Инструмент 2: Полная боевая связка
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

    const gameData = await fetchAllDocs();
    const answer = await askGemini(gameData, query);

    return res.status(200).json({ result: answer });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
}
