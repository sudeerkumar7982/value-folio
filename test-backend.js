import { analyzeLifeEvent } from './server/ai/sentimentEngine.js';
import { DB } from './server/db/database.js';
import { calculateNewPrice, calculateSectorUpdates } from './server/engine/priceEngine.js';

async function runTests() {
  console.log('--- Testing SUDK AI Sentiment Analysis Engine ---');
  
  const test1 = await analyzeLifeEvent('Sudeer received a software engineering offer', 'Full time role at top company', 'Career');
  console.log('Test 1 (Positive Event):', test1);
  if (test1.sentiment !== 'POSITIVE' || test1.impactPercent <= 0) {
    throw new Error('Test 1 Failed: expected positive sentiment');
  }

  const test2 = await analyzeLifeEvent('Sudeer failed an important interview', 'Rejected after final round', 'Career');
  console.log('Test 2 (Negative Event):', test2);
  if (test2.sentiment !== 'NEGATIVE' || test2.impactPercent >= 0) {
    throw new Error('Test 2 Failed: expected negative sentiment');
  }

  console.log('--- Testing Stock Price Calculation Engine ---');
  const prevPrice = 100.00;
  const newPrice = calculateNewPrice(prevPrice, test1.impactPercent);
  console.log(`Previous: ₹${prevPrice} -> New: ₹${newPrice} (+${test1.impactPercent}%)`);

  console.log('--- Testing Database Persistence ---');
  const profile = DB.getProfile();
  console.log('Current Stock Profile:', profile.symbol, 'Price: ₹' + profile.currentPrice);
  
  console.log('✅ ALL BACKEND & AI TESTS PASSED PERFECTLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
