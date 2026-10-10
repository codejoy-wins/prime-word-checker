const fs = require("node:fs");
const path = require("node:path");

const dataPath = path.join(process.cwd(), "data", "anagrams.json");
const { anagrams, commonWords: commonList } = JSON.parse(
  fs.readFileSync(dataPath, "utf8")
);

const commonWords = new Set(commonList);
const definitionCache = new Map();
const MAX_CANDIDATES = 60;

function factorial(n) {
  let result = 1;

  for (let i = 2; i <= n; i++) {
    result *= i;
  }

  return result;
}

function totalUniquePermutations(word) {
  let result = factorial(word.length);
  const frequencies = {};

  for (const letter of word) {
    frequencies[letter] = (frequencies[letter] || 0) + 1;
  }

  for (const count of Object.values(frequencies)) {
    result /= factorial(count);
  }

  return result;
}

async function getDefinition(word) {
  if (definitionCache.has(word)) {
    return definitionCache.get(word);
  }

  const promise = (async () => {
    try {
      const response = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
        { signal: AbortSignal.timeout(3500) }
      );

      if (!response.ok) return null;

      const entries = await response.json();

      for (const entry of entries) {
        for (const meaning of entry.meanings || []) {
          const definition = meaning.definitions?.[0]?.definition;

          if (definition) return definition;
        }
      }

      return null;
    } catch {
      return null;
    }
  })();

  definitionCache.set(word, promise);
  return promise;
}

async function mapWithConcurrency(items, limit, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;

      results[index] = await callback(items[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(limit, items.length) },
      () => worker()
    )
  );

  return results;
}

exports.handler = async function (event) {
  const rawWord = event.queryStringParameters?.word || "";
  const word = rawWord.trim().toLowerCase();

  if (!/^[a-z]{2,20}$/.test(word)) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Enter a word containing 2–20 English letters."
      })
    };
  }

  const key = [...word].sort().join("");
  const allCandidates = [...(anagrams[key] || [])];

  // Put the searched word first, then common words, then other candidates.
  allCandidates.sort((a, b) => {
    if (a === word) return -1;
    if (b === word) return 1;

    const commonDifference =
      Number(commonWords.has(b)) - Number(commonWords.has(a));

    return commonDifference || a.localeCompare(b);
  });

  const truncated = allCandidates.length > MAX_CANDIDATES;
  const candidates = allCandidates.slice(0, MAX_CANDIDATES);

  const checked = await mapWithConcurrency(candidates, 10, async candidate => {
    const definition = await getDefinition(candidate);

    if (!definition) return null;

    return {
      word: candidate,
      isCommon: commonWords.has(candidate),
      definition
    };
  });

  const annotatedAnagrams = checked.filter(Boolean);

  const isPrime =
    !truncated &&
    annotatedAnagrams.length === 1 &&
    annotatedAnagrams[0].word === word;

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60"
    },
    body: JSON.stringify({
      word,
      sortedKey: key,
      totalPermutations: totalUniquePermutations(word),
      annotatedAnagrams,
      validCount: annotatedAnagrams.length,
      isPrime,
      truncated
    })
  };
};