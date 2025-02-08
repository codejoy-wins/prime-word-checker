const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Use global fetch (Node 18+); if not, fall back to node-fetch.
const fetch = global.fetch || require('node-fetch');

let dictionary = new Set();
let anagramMap = {};
let commonWords = new Set();

/**
 * Helper: Retrieve a definition for a word using dictionaryapi.dev.
 * Returns a string definition or a fallback message.
 */
async function getDefinition(word) {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return "Definition not found.";
    }
    const json = await response.json();
    if (json && Array.isArray(json) && json.length > 0 && json[0].meanings && json[0].meanings.length > 0) {
      const meaning = json[0].meanings[0];
      if (meaning.definitions && meaning.definitions.length > 0) {
        return meaning.definitions[0].definition || "Definition not available.";
      }
    }
    return "Definition not available.";
  } catch (error) {
    return "Definition not available.";
  }
}

/**
 * Fetches an online word list and builds:
 *  - A dictionary (Set) of lower-case words.
 *  - An anagram mapping that groups words by their sorted letters.
 */
async function loadDictionaryFromWeb() {
  const dictionaryURL = 'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt';
  try {
    console.log(`Fetching dictionary from ${dictionaryURL}...`);
    const response = await fetch(dictionaryURL);
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.status}`);
    }
    const text = await response.text();
    const words = text.split(/\r?\n/);
    words.forEach(word => {
      const trimmed = word.trim();
      if (trimmed.length > 0) {
        const lower = trimmed.toLowerCase();
        dictionary.add(lower);
        const key = lower.split('').sort().join('');
        if (!anagramMap[key]) {
          anagramMap[key] = new Set();
        }
        anagramMap[key].add(lower);
      }
    });
    console.log('Dictionary loaded with', dictionary.size, 'words.');
  } catch (err) {
    console.error('Error fetching dictionary:', err);
  }
}

/**
 * Loads a list of common English words from an external source into a Set.
 * (Here we use the Google-10000-English list from GitHub.)
 */
async function loadCommonWords() {
  const commonWordsURL = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english.txt';
  try {
    console.log(`Fetching common words from ${commonWordsURL}...`);
    const response = await fetch(commonWordsURL);
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.status}`);
    }
    const text = await response.text();
    const words = text.split(/\r?\n/);
    words.forEach(word => {
      const trimmed = word.trim().toLowerCase();
      if (trimmed.length > 0) {
        commonWords.add(trimmed);
      }
    });
    console.log('Common words loaded with', commonWords.size, 'words.');
  } catch (err) {
    console.error('Error fetching common words:', err);
  }
}

// Serve static files from the "public" folder.
app.use(express.static('public'));

/**
 * Helper: Compute factorial of a number.
 */
function factorial(n) {
  if (n === 0) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

/**
 * Compute the number of unique permutations for a word.
 * For words with duplicate letters, this is: n! / (f1! * f2! * ...),
 * where f1, f2, … are the frequencies of each letter.
 */
function totalUniquePermutations(word) {
  const freq = {};
  for (const char of word) {
    freq[char] = (freq[char] || 0) + 1;
  }
  let numerator = factorial(word.length);
  let denominator = 1;
  for (const key in freq) {
    denominator *= factorial(freq[key]);
  }
  return numerator / denominator;
}

/**
 * API endpoint: /api/check?word=yourword
 * Returns a JSON object with:
 *  - word: the input word (lower-case)
 *  - sortedKey: the letters sorted alphabetically
 *  - totalPermutations: total unique arrangements (e.g., 120 for a 5-letter word with distinct letters)
 *  - annotatedAnagrams: an array of objects for each valid anagram:
 *       { word: <string>, isCommon: <boolean>, definition: <string> }
 *  - validCount: the number of valid words (with definitions) found
 *  - isPrime: true if the only anagram (with a definition) is the input word itself
 */
app.get('/api/check', async (req, res) => {
  const word = req.query.word;
  if (!word) {
    return res.status(400).json({ error: 'No word provided.' });
  }
  const lower = word.toLowerCase();
  const sortedKey = lower.split('').sort().join('');
  
  let validAnagrams = [];
  if (anagramMap[sortedKey]) {
    validAnagrams = Array.from(anagramMap[sortedKey]);
  }
  
  const totalPermutations = totalUniquePermutations(lower);
  
  // Annotate each anagram with an isCommon flag.
  const annotatedAnagrams = validAnagrams.map(w => {
    return { word: w, isCommon: commonWords.has(w) };
  });
  
  // Fetch definitions for each annotated anagram.
  const annotatedWithDefinitions = await Promise.all(
    annotatedAnagrams.map(async (item) => {
      const definition = await getDefinition(item.word);
      return { ...item, definition };
    })
  );
  
  // Filter out anagrams without a valid definition.
  const filteredAnnotated = annotatedWithDefinitions.filter(item => 
    item.definition !== "Definition not found." && item.definition !== "Definition not available."
  );
  
  // Determine if the word is prime: it's prime if the only anagram (with a definition) is the input word.
  const isPrime = (filteredAnnotated.length === 1 && filteredAnnotated[0].word === lower);
  
  res.json({
    word: lower,
    sortedKey: sortedKey,
    totalPermutations: totalPermutations,
    annotatedAnagrams: filteredAnnotated,
    validCount: filteredAnnotated.length,
    isPrime: isPrime
  });
});

// Start the server after loading the dictionaries.
(async function startServer() {
  await loadDictionaryFromWeb();
  await loadCommonWords();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})();
