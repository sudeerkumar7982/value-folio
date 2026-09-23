/**
 * Intelligent AI Sentiment Analysis & Life Event Classifier Engine
 * Analyzes personal human life events, detects context, numbers, negations,
 * determines sentiment, importance weight, stock impact %, and sector rating adjustments.
 */

const POSITIVE_LEXICON = [
  // Career
  { word: 'offer', weight: 4.5, sector: 'Career', importance: 'HIGH' },
  { word: 'offers', weight: 4.8, sector: 'Career', importance: 'HIGH' },
  { word: 'job', weight: 3.5, sector: 'Career', importance: 'HIGH' },
  { word: 'promotion', weight: 4.8, sector: 'Career', importance: 'HIGH' },
  { word: 'hired', weight: 4.2, sector: 'Career', importance: 'HIGH' },
  { word: 'interview cleared', weight: 4.0, sector: 'Career', importance: 'HIGH' },
  { word: 'placed', weight: 4.0, sector: 'Career', importance: 'HIGH' },
  { word: 'appraisal', weight: 3.5, sector: 'Career', importance: 'MEDIUM' },
  { word: 'raise', weight: 4.0, sector: 'Career', importance: 'HIGH' },
  { word: 'bonus', weight: 3.8, sector: 'Career', importance: 'MEDIUM' },
  { word: 'increment', weight: 3.5, sector: 'Career', importance: 'MEDIUM' },
  { word: 'internship', weight: 3.2, sector: 'Career', importance: 'MEDIUM' },
  { word: 'ctc', weight: 4.0, sector: 'Career', importance: 'HIGH' },
  { word: 'lpa', weight: 4.2, sector: 'Career', importance: 'HIGH' },

  // Education
  { word: 'exam', weight: 3.0, sector: 'Education', importance: 'MEDIUM' },
  { word: 'passed', weight: 3.5, sector: 'Education', importance: 'MEDIUM' },
  { word: 'degree', weight: 4.0, sector: 'Education', importance: 'HIGH' },
  { word: 'graduated', weight: 4.5, sector: 'Education', importance: 'HIGH' },
  { word: 'gpa', weight: 3.5, sector: 'Education', importance: 'MEDIUM' },
  { word: 'topper', weight: 4.5, sector: 'Education', importance: 'HIGH' },
  { word: 'distinction', weight: 4.0, sector: 'Education', importance: 'HIGH' },
  { word: 'scholarship', weight: 4.2, sector: 'Education', importance: 'HIGH' },

  // Projects
  { word: 'project completed', weight: 4.0, sector: 'Projects', importance: 'HIGH' },
  { word: 'launched', weight: 3.8, sector: 'Projects', importance: 'HIGH' },
  { word: 'deployed', weight: 3.5, sector: 'Projects', importance: 'MEDIUM' },
  { word: 'built', weight: 3.0, sector: 'Projects', importance: 'MEDIUM' },
  { word: 'created', weight: 2.8, sector: 'Projects', importance: 'MEDIUM' },
  { word: 'open source', weight: 3.2, sector: 'Projects', importance: 'MEDIUM' },
  { word: 'startup', weight: 4.5, sector: 'Projects', importance: 'HIGH' },
  { word: 'app live', weight: 3.8, sector: 'Projects', importance: 'HIGH' },

  // Skills
  { word: 'learned', weight: 2.5, sector: 'Skills', importance: 'LOW' },
  { word: 'certified', weight: 3.5, sector: 'Skills', importance: 'MEDIUM' },
  { word: 'certification', weight: 3.5, sector: 'Skills', importance: 'MEDIUM' },
  { word: 'mastered', weight: 3.8, sector: 'Skills', importance: 'MEDIUM' },
  { word: 'skill', weight: 2.5, sector: 'Skills', importance: 'LOW' },
  { word: 'hackathon', weight: 4.2, sector: 'Skills', importance: 'HIGH' },
  { word: 'aws', weight: 3.2, sector: 'Skills', importance: 'MEDIUM' },
  { word: 'react', weight: 3.0, sector: 'Skills', importance: 'MEDIUM' },
  { word: 'python', weight: 3.0, sector: 'Skills', importance: 'MEDIUM' },

  // Finance
  { word: 'profit', weight: 4.2, sector: 'Finance', importance: 'HIGH' },
  { word: 'profits', weight: 4.2, sector: 'Finance', importance: 'HIGH' },
  { word: 'gain', weight: 3.8, sector: 'Finance', importance: 'MEDIUM' },
  { word: 'gains', weight: 3.8, sector: 'Finance', importance: 'MEDIUM' },
  { word: 'salary', weight: 4.0, sector: 'Finance', importance: 'HIGH' },
  { word: 'savings', weight: 3.2, sector: 'Finance', importance: 'MEDIUM' },
  { word: 'investment', weight: 3.5, sector: 'Finance', importance: 'MEDIUM' },
  { word: 'invested', weight: 3.0, sector: 'Finance', importance: 'MEDIUM' },
  { word: 'stipend', weight: 3.0, sector: 'Finance', importance: 'MEDIUM' },
  { word: 'return', weight: 3.5, sector: 'Finance', importance: 'MEDIUM' },

  // Social
  { word: 'award', weight: 4.5, sector: 'Social', importance: 'HIGH' },
  { word: 'win', weight: 4.2, sector: 'Social', importance: 'HIGH' },
  { word: 'won', weight: 4.2, sector: 'Social', importance: 'HIGH' },
  { word: 'recognized', weight: 3.5, sector: 'Social', importance: 'MEDIUM' },
  { word: 'featured', weight: 3.8, sector: 'Social', importance: 'HIGH' },
  { word: 'speaker', weight: 3.5, sector: 'Social', importance: 'MEDIUM' },

  // Wellbeing
  { word: 'workout', weight: 2.5, sector: 'Wellbeing', importance: 'LOW' },
  { word: 'marathon', weight: 3.8, sector: 'Wellbeing', importance: 'HIGH' },
  { word: 'recovered', weight: 4.0, sector: 'Wellbeing', importance: 'HIGH' },
  { word: 'health', weight: 3.0, sector: 'Wellbeing', importance: 'LOW' },
  { word: 'gym', weight: 2.5, sector: 'Wellbeing', importance: 'LOW' },
  { word: 'fit', weight: 2.5, sector: 'Wellbeing', importance: 'LOW' }
];

const NEGATIVE_LEXICON = [
  // Career
  { word: 'rejected', weight: -3.8, sector: 'Career', importance: 'HIGH' },
  { word: 'rejection', weight: -3.8, sector: 'Career', importance: 'HIGH' },
  { word: 'fired', weight: -5.0, sector: 'Career', importance: 'CRITICAL' },
  { word: 'layoff', weight: -4.8, sector: 'Career', importance: 'CRITICAL' },
  { word: 'failed interview', weight: -3.8, sector: 'Career', importance: 'HIGH' },
  { word: 'offer lost', weight: -4.5, sector: 'Career', importance: 'HIGH' },
  { word: 'offer gets lost', weight: -4.5, sector: 'Career', importance: 'HIGH' },

  // Education
  { word: 'failed exam', weight: -4.0, sector: 'Education', importance: 'HIGH' },
  { word: 'dropped out', weight: -4.5, sector: 'Education', importance: 'HIGH' },
  { word: 'bad grade', weight: -2.8, sector: 'Education', importance: 'LOW' },
  { word: 'backlog', weight: -3.5, sector: 'Education', importance: 'MEDIUM' },
  { word: 'fail in training', weight: -4.2, sector: 'Education', importance: 'HIGH' },

  // Projects
  { word: 'bug', weight: -2.0, sector: 'Projects', importance: 'LOW' },
  { word: 'outage', weight: -3.8, sector: 'Projects', importance: 'HIGH' },
  { word: 'crash', weight: -3.5, sector: 'Projects', importance: 'MEDIUM' },
  { word: 'project failure', weight: -4.2, sector: 'Projects', importance: 'HIGH' },
  { word: 'cancelled', weight: -3.0, sector: 'Projects', importance: 'MEDIUM' },

  // Finance
  { word: 'scam', weight: -4.5, sector: 'Finance', importance: 'HIGH' },
  { word: 'debt', weight: -3.5, sector: 'Finance', importance: 'MEDIUM' },
  { word: 'penalty', weight: -3.0, sector: 'Finance', importance: 'LOW' },
  { word: 'stolen', weight: -4.5, sector: 'Finance', importance: 'HIGH' },
  { word: 'bankrupt', weight: -5.0, sector: 'Finance', importance: 'CRITICAL' },

  // Social
  { word: 'argument', weight: -2.5, sector: 'Social', importance: 'LOW' },
  { word: 'conflict', weight: -2.8, sector: 'Social', importance: 'MEDIUM' },
  { word: 'criticism', weight: -2.0, sector: 'Social', importance: 'LOW' },

  // Wellbeing
  { word: 'sick', weight: -2.8, sector: 'Wellbeing', importance: 'LOW' },
  { word: 'burnout', weight: -4.0, sector: 'Wellbeing', importance: 'HIGH' },
  { word: 'injury', weight: -3.5, sector: 'Wellbeing', importance: 'MEDIUM' },
  { word: 'hospital', weight: -4.5, sector: 'Wellbeing', importance: 'HIGH' }
];

const IMPORTANCE_MULTIPLIERS = {
  LOW: 0.7,
  MEDIUM: 1.0,
  HIGH: 1.6,
  CRITICAL: 2.2
};

export async function analyzeLifeEvent(eventTitle, description = '', preferredSector = null, apiKey = null) {
  const fullText = `${eventTitle} ${description}`.trim();
  const text = fullText.toLowerCase();

  // Attempt external Gemini API call if API Key is available
  if (apiKey) {
    try {
      const geminiResult = await analyzeWithGemini(eventTitle, description, apiKey);
      if (geminiResult) return geminiResult;
    } catch (e) {
      console.warn('Gemini API failed, using Enhanced Local Engine:', e.message);
    }
  }

  // --- Context & Financial Pattern Parser ---
  let score = 0;
  let matches = [];
  let detectedSectors = {};
  let maxImportance = 'LOW';

  // 1. Financial & Investment Pattern Check (e.g. "Invested: 51260, profit/loss: 44308")
  const isFinanceContext = text.includes('invested') || text.includes('profit') || text.includes('finance data') || text.includes('portfolio');
  let financeOverrideScore = null;

  if (isFinanceContext) {
    // Check if profit/gains or positive figures are stated
    const hasProfit = text.includes('profit') || text.includes('gain') || text.includes('returns');
    const hasLossOnly = (text.includes('loss') || text.includes('lost')) && !text.includes('profit/loss') && !text.includes('profit');

    if (hasProfit && !hasLossOnly) {
      financeOverrideScore = 4.2;
      detectedSectors['Finance'] = (detectedSectors['Finance'] || 0) + 5.0;
      maxImportance = 'HIGH';
    } else if (hasLossOnly) {
      financeOverrideScore = -3.8;
      detectedSectors['Finance'] = (detectedSectors['Finance'] || 0) + 5.0;
      maxImportance = 'HIGH';
    }
  }

  // 2. Lexicon Search with Negation Filter
  const checkLexicon = (list) => {
    for (const item of list) {
      // Ignore standalone 'loss' if it appears as part of 'profit/loss' phrase
      if (item.word === 'loss' && (text.includes('profit/loss') || text.includes('profit / loss') || text.includes('profit'))) {
        continue;
      }

      if (text.includes(item.word)) {
        // Negation check (e.g. "no bugs", "not rejected")
        const idx = text.indexOf(item.word);
        const sub = text.slice(Math.max(0, idx - 15), idx);
        const isNegated = sub.includes('no ') || sub.includes('not ') || sub.includes('never ') || sub.includes('zero ');

        const effectiveWeight = isNegated ? -item.weight * 0.5 : item.weight;

        score += effectiveWeight;
        matches.push({ ...item, weight: effectiveWeight });
        detectedSectors[item.sector] = (detectedSectors[item.sector] || 0) + Math.abs(effectiveWeight);

        const impOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
        if (impOrder.indexOf(item.importance) > impOrder.indexOf(maxImportance)) {
          maxImportance = item.importance;
        }
      }
    }
  };

  checkLexicon(POSITIVE_LEXICON);
  checkLexicon(NEGATIVE_LEXICON);

  if (financeOverrideScore !== null && matches.length === 0) {
    score = financeOverrideScore;
  }

  // 3. Fallback Keyword Heuristics
  if (matches.length === 0 && financeOverrideScore === null) {
    if (text.includes('great') || text.includes('good') || text.includes('success') || text.includes('passed') || text.includes('happy') || text.includes('selected') || text.includes('cleared')) {
      score += 3.2;
      maxImportance = 'MEDIUM';
    } else if (text.includes('bad') || text.includes('fail') || text.includes('lost') || text.includes('missed') || text.includes('sad') || text.includes('rejected')) {
      score -= 3.2;
      maxImportance = 'MEDIUM';
    } else {
      score += 1.5;
      maxImportance = 'LOW';
    }
  }

  // 4. Quantity Multiplier Check (e.g. "2 offers", "3 certifications")
  const numberMatch = text.match(/(\d+)\s*(offer|offers|certification|job|project|win|award)/i);
  if (numberMatch && numberMatch[1]) {
    const qty = parseInt(numberMatch[1], 10);
    if (qty > 1) {
      score *= Math.min(1.2 + (qty - 1) * 0.25, 2.2);
    }
  }

  // Determine Primary Sector
  let primarySector = preferredSector;
  if (!primarySector || primarySector === 'Auto') {
    let topSector = 'Projects';
    let topVal = -1;
    for (const [sec, val] of Object.entries(detectedSectors)) {
      if (val > topVal) {
        topVal = val;
        topSector = sec;
      }
    }
    primarySector = topSector;
  }

  // Sentiment Classification
  let sentiment = 'NEUTRAL';
  if (score > 0.3) sentiment = 'POSITIVE';
  else if (score < -0.3) sentiment = 'NEGATIVE';

  // Intensity modifier detection
  let intensity = 1.0;
  if (text.includes('major') || text.includes('massive') || text.includes('huge') || text.includes('first place') || text.includes('critical') || text.includes('top')) {
    intensity = 1.45;
  } else if (text.includes('minor') || text.includes('small') || text.includes('slight') || text.includes('part-time')) {
    intensity = 0.65;
  }

  // Calculate Dynamic Impact %
  const impMultiplier = IMPORTANCE_MULTIPLIERS[maxImportance] || 1.0;
  let dynamicImpact = score * 1.6 * intensity * impMultiplier;

  // Add organic micro-variance based on text hash
  const textHash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const organicVariance = ((textHash % 100) / 100) * 0.8 - 0.4;
  let impactPercent = Number((dynamicImpact + organicVariance).toFixed(2));

  // Cap between -25% and +35%
  impactPercent = Math.min(Math.max(impactPercent, -25.0), 35.0);

  // Confidence calculation
  const confidence = Math.min(Math.round(70 + matches.length * 7 + Math.abs(score) * 2.5), 99);

  // Sector Score adjustment (+/- rating points for the sector)
  const sectorDelta = Math.round(impactPercent * 0.75);

  const summary = `${sentiment === 'POSITIVE' ? '📈' : sentiment === 'NEGATIVE' ? '📉' : '➖'} AI classified as ${sentiment} (${confidence}% confidence, ${maxImportance} importance) impacting ${primarySector} sector by ${impactPercent > 0 ? '+' : ''}${impactPercent}%.`;

  return {
    sentiment,
    confidence,
    importance: maxImportance,
    impactPercent,
    primarySector,
    sectorDelta,
    summary,
    keywordsMatched: matches.map(m => m.word)
  };
}

async function analyzeWithGemini(eventTitle, description, apiKey) {
  const prompt = `Analyze this human life event for a Virtual Human Life Stock Market platform:
Event Title: "${eventTitle}"
Description: "${description}"

Return ONLY valid JSON matching this schema:
{
  "sentiment": "POSITIVE" | "NEGATIVE" | "NEUTRAL",
  "confidence": number between 50 and 99,
  "importance": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "impactPercent": number between -20.0 and 25.0,
  "primarySector": "Career" | "Education" | "Skills" | "Projects" | "Finance" | "Social" | "Wellbeing",
  "sectorDelta": number between -15 and 15,
  "summary": "Short 1-sentence market explanation"
}`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!res.ok) throw new Error(`Gemini HTTP error ${res.status}`);
  const data = await res.json();
  const textOut = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleanJson = textOut.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleanJson);
}
