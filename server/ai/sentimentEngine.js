/**
 * AI Sentiment Analysis & Life Event Classifier Engine
 * Analyzes personal life events, determines sentiment, importance weight,
 * stock impact %, and sector rating adjustments.
 */

// Lexicons & Weights for Built-in NLP Model
const POSITIVE_LEXICON = [
  { word: 'offer', weight: 4.5, sector: 'Career', importance: 'HIGH' },
  { word: 'job', weight: 3.5, sector: 'Career', importance: 'HIGH' },
  { word: 'promotion', weight: 4.8, sector: 'Career', importance: 'HIGH' },
  { word: 'hired', weight: 4.2, sector: 'Career', importance: 'HIGH' },
  { word: 'interview cleared', weight: 3.5, sector: 'Career', importance: 'MEDIUM' },
  { word: 'placed', weight: 4.0, sector: 'Career', importance: 'HIGH' },
  
  { word: 'exam', weight: 3.0, sector: 'Education', importance: 'MEDIUM' },
  { word: 'degree', weight: 4.0, sector: 'Education', importance: 'HIGH' },
  { word: 'graduated', weight: 4.5, sector: 'Education', importance: 'HIGH' },
  { word: 'gpa', weight: 3.2, sector: 'Education', importance: 'MEDIUM' },
  { word: 'topper', weight: 4.0, sector: 'Education', importance: 'HIGH' },
  { word: 'distinction', weight: 3.8, sector: 'Education', importance: 'MEDIUM' },

  { word: 'project completed', weight: 3.8, sector: 'Projects', importance: 'HIGH' },
  { word: 'launched', weight: 3.5, sector: 'Projects', importance: 'HIGH' },
  { word: 'deployed', weight: 3.2, sector: 'Projects', importance: 'MEDIUM' },
  { word: 'built', weight: 2.8, sector: 'Projects', importance: 'MEDIUM' },
  { word: 'created', weight: 2.5, sector: 'Projects', importance: 'MEDIUM' },
  { word: 'open source', weight: 3.0, sector: 'Projects', importance: 'MEDIUM' },

  { word: 'learned', weight: 2.5, sector: 'Skills', importance: 'LOW' },
  { word: 'certified', weight: 3.2, sector: 'Skills', importance: 'MEDIUM' },
  { word: 'mastered', weight: 3.5, sector: 'Skills', importance: 'MEDIUM' },
  { word: 'skill', weight: 2.2, sector: 'Skills', importance: 'LOW' },
  { word: 'hackathon', weight: 4.0, sector: 'Skills', importance: 'HIGH' },

  { word: 'profit', weight: 3.5, sector: 'Finance', importance: 'MEDIUM' },
  { word: 'salary', weight: 4.0, sector: 'Finance', importance: 'HIGH' },
  { word: 'savings', weight: 2.8, sector: 'Finance', importance: 'MEDIUM' },
  { word: 'investment', weight: 3.0, sector: 'Finance', importance: 'MEDIUM' },
  { word: 'stipend', weight: 2.5, sector: 'Finance', importance: 'LOW' },

  { word: 'award', weight: 4.2, sector: 'Social', importance: 'HIGH' },
  { word: 'win', weight: 4.0, sector: 'Social', importance: 'HIGH' },
  { word: 'won', weight: 4.0, sector: 'Social', importance: 'HIGH' },
  { word: 'recognized', weight: 3.0, sector: 'Social', importance: 'MEDIUM' },
  { word: 'friend', weight: 2.0, sector: 'Social', importance: 'LOW' },
  { word: 'network', weight: 2.2, sector: 'Social', importance: 'LOW' },

  { word: 'workout', weight: 2.0, sector: 'Wellbeing', importance: 'LOW' },
  { word: 'marathon', weight: 3.5, sector: 'Wellbeing', importance: 'MEDIUM' },
  { word: 'recovered', weight: 3.8, sector: 'Wellbeing', importance: 'HIGH' },
  { word: 'health', weight: 2.5, sector: 'Wellbeing', importance: 'LOW' },
  { word: 'meditation', weight: 2.0, sector: 'Wellbeing', importance: 'LOW' },
];

const NEGATIVE_LEXICON = [
  { word: 'rejected', weight: -3.8, sector: 'Career', importance: 'HIGH' },
  { word: 'rejection', weight: -3.8, sector: 'Career', importance: 'HIGH' },
  { word: 'fired', weight: -5.0, sector: 'Career', importance: 'CRITICAL' },
  { word: 'layoff', weight: -4.8, sector: 'Career', importance: 'CRITICAL' },
  { word: 'failed interview', weight: -3.5, sector: 'Career', importance: 'MEDIUM' },

  { word: 'failed exam', weight: -4.0, sector: 'Education', importance: 'HIGH' },
  { word: 'dropped out', weight: -4.5, sector: 'Education', importance: 'HIGH' },
  { word: 'bad grade', weight: -2.5, sector: 'Education', importance: 'LOW' },
  { word: 'backlog', weight: -3.5, sector: 'Education', importance: 'MEDIUM' },

  { word: 'bug', weight: -2.0, sector: 'Projects', importance: 'LOW' },
  { word: 'outage', weight: -3.8, sector: 'Projects', importance: 'HIGH' },
  { word: 'crash', weight: -3.5, sector: 'Projects', importance: 'MEDIUM' },
  { word: 'project failure', weight: -4.2, sector: 'Projects', importance: 'HIGH' },
  { word: 'cancelled', weight: -3.0, sector: 'Projects', importance: 'MEDIUM' },

  { word: 'loss', weight: -3.5, sector: 'Finance', importance: 'HIGH' },
  { word: 'scam', weight: -4.5, sector: 'Finance', importance: 'HIGH' },
  { word: 'debt', weight: -3.2, sector: 'Finance', importance: 'MEDIUM' },
  { word: 'penalty', weight: -2.8, sector: 'Finance', importance: 'LOW' },

  { word: 'argument', weight: -2.2, sector: 'Social', importance: 'LOW' },
  { word: 'conflict', weight: -2.5, sector: 'Social', importance: 'MEDIUM' },
  { word: 'criticism', weight: -2.0, sector: 'Social', importance: 'LOW' },

  { word: 'sick', weight: -2.5, sector: 'Wellbeing', importance: 'LOW' },
  { word: 'burnout', weight: -4.0, sector: 'Wellbeing', importance: 'HIGH' },
  { word: 'injury', weight: -3.5, sector: 'Wellbeing', importance: 'MEDIUM' },
  { word: 'hospital', weight: -4.5, sector: 'Wellbeing', importance: 'HIGH' },
];

const IMPORTANCE_MULTIPLIERS = {
  LOW: 0.6,
  MEDIUM: 1.0,
  HIGH: 1.6,
  CRITICAL: 2.2
};

export async function analyzeLifeEvent(eventTitle, description = '', preferredSector = null, apiKey = null) {
  const text = `${eventTitle} ${description}`.toLowerCase();

  // If external Gemini API Key is provided, attempt external LLM call first
  if (apiKey) {
    try {
      const geminiResult = await analyzeWithGemini(eventTitle, description, apiKey);
      if (geminiResult) return geminiResult;
    } catch (e) {
      console.warn('Gemini API failed, falling back to Local Engine:', e.message);
    }
  }

  // --- Local NLP Sentiment & Importance Model ---
  let score = 0;
  let matches = [];
  let detectedSectors = {};
  let maxImportance = 'LOW';

  const checkLexicon = (list, isPositive) => {
    for (const item of list) {
      if (text.includes(item.word)) {
        score += item.weight;
        matches.push(item);
        detectedSectors[item.sector] = (detectedSectors[item.sector] || 0) + Math.abs(item.weight);
        
        // Elevate importance level if match is higher
        const impOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
        if (impOrder.indexOf(item.importance) > impOrder.indexOf(maxImportance)) {
          maxImportance = item.importance;
        }
      }
    }
  };

  checkLexicon(POSITIVE_LEXICON, true);
  checkLexicon(NEGATIVE_LEXICON, false);

  // Default fallback heuristics if text has custom words
  if (matches.length === 0) {
    if (text.includes('great') || text.includes('good') || text.includes('success') || text.includes('passed') || text.includes('happy')) {
      score += 2.5;
      maxImportance = 'MEDIUM';
    } else if (text.includes('bad') || text.includes('fail') || text.includes('lost') || text.includes('missed') || text.includes('sad')) {
      score -= 2.5;
      maxImportance = 'MEDIUM';
    } else {
      score += 1.0; // slight positive bias for logging life steps
      maxImportance = 'LOW';
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
  if (score > 0.4) sentiment = 'POSITIVE';
  else if (score < -0.4) sentiment = 'NEGATIVE';

  // Intensity modifier detection (e.g. "major", "massive", "small", "first place", "critical")
  let intensity = 1.0;
  if (text.includes('major') || text.includes('massive') || text.includes('huge') || text.includes('first place') || text.includes('critical')) {
    intensity = 1.45;
  } else if (text.includes('minor') || text.includes('small') || text.includes('slight') || text.includes('part-time')) {
    intensity = 0.65;
  }

  // Dynamic Impact Percentage Calculation (-25% to +30%)
  const impMultiplier = IMPORTANCE_MULTIPLIERS[maxImportance] || 1.0;
  let dynamicImpact = score * 1.65 * intensity * impMultiplier;
  
  // Add organic micro-variance based on text hash/length so every unique prompt yields a unique dynamic value
  const textHash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const organicVariance = ((textHash % 100) / 100) * 0.8 - 0.4;
  
  let impactPercent = Number((dynamicImpact + organicVariance).toFixed(2));

  // Cap within reasonable market boundaries (-25% to +35%)
  impactPercent = Math.min(Math.max(impactPercent, -25.0), 35.0);

  // Confidence Score calculation
  const confidence = Math.min(Math.round(65 + matches.length * 8 + Math.abs(score) * 3), 98);

  // Sector Score adjustment (+/- rating points for the sector)
  const sectorDelta = Math.round(impactPercent * 0.7);

  const summary = `${sentiment === 'POSITIVE' ? '📈' : sentiment === 'NEGATIVE' ? '📉' : '➖'} AI classified this as ${sentiment} (${confidence}% confidence, ${maxImportance} importance) impacting ${primarySector} sector by ${impactPercent > 0 ? '+' : ''}${impactPercent}%.`;

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
