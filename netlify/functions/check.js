
const fs = require("node:fs");
const path = require("node:path");

const dataPath = path.join(process.cwd(), "data", "anagrams.json");
const { anagrams, commonWords: commonList } = JSON.parse(
  fs.readFileSync(dataPath, "utf8")
);

const commonWords = new Set(commonList);
const MAX_CANDIDATES = 60;
const TIMEOUT_MS = 8000;

function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
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

async function getDefinition(word, failures) {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    if (response.status === 404) return null;

    if (!response.ok) {
      failures[word] = `HTTP ${response.status}`;
      return null;
    }

    const entries = await response.json();

    for (const entry of entries) {
      for (const meaning of entry.meanings || []) {
        for (const item of meaning.definitions || []) {
          if (item.definition) return item.definition;
        }
      }
    }

    return null;
  } catch (error) {
    failures[word] = error.name || "Lookup failed";
    return null;
  }
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

  allCandidates.sort((a, b) => {
    if (a === word) return -1;
    if (b === word) return 1;

    const commonDifference =
      Number(commonWords.has(b)) - Number(commonWords.has(a));

    return commonDifference || a.localeCompare(b);
  });

  const truncated = allCandidates.length > MAX_CANDIDATES;
  const candidates = allCandidates.slice(0, MAX_CANDIDATES);
  const failures = {};

  const checked = await mapWithConcurrency(
    candidates,
    3,
    async candidate => {
      const definition = await getDefinition(candidate, failures);

      if (!definition) return null;

      return {
        word: candidate,
        isCommon: commonWords.has(candidate),
        definition
      };
    }
  );

  const annotatedAnagrams = checked.filter(Boolean);

  const result = {
    word,
    sortedKey: key,
    totalPermutations: totalUniquePermutations(word),
    annotatedAnagrams,
    validCount: annotatedAnagrams.length,
    isPrime:
      !truncated &&
      annotatedAnagrams.length === 1 &&
      annotatedAnagrams[0].word === word,
    truncated
  };

  if (event.queryStringParameters?.debug === "1") {
    result.indexCandidates = candidates;
    result.lookupFailures = failures;
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(result)
  };
};
