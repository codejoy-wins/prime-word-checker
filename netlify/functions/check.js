const fs = require("node:fs");
const path = require("node:path");

const dataPath = path.join(process.cwd(), "data", "anagrams.json");
const { anagrams, commonWords: commonList } = JSON.parse(
  fs.readFileSync(dataPath, "utf8")
);

const commonWords = new Set(commonList);
const MAX_CANDIDATES = 60;

// First test: fetch definitions for one anagram only.
const MAX_DEFINITION_LOOKUPS = 1;

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

async function fetchDefinition(word) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      console.log(`Dictionary lookup for "${word}" returned HTTP ${response.status}`);
      return "";
    }

    const entries = await response.json();

    for (const entry of entries) {
      for (const meaning of entry.meanings || []) {
        for (const item of meaning.definitions || []) {
          if (item.definition) {
            return item.definition.trim();
          }
        }
      }
    }

    console.log(`No definition found for "${word}".`);
    return "";
  } catch (error) {
    console.log(`Dictionary lookup failed for "${word}": ${error.message}`);
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

exports.handler = async function (event) {
  const word = (event.queryStringParameters?.word || "")
    .trim()
    .toLowerCase();

  if (!/^[a-z]{2,20}$/.test(word)) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        error: "Enter a word using 2–20 English letters, with no spaces or numbers."
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

  const annotatedAnagrams = candidates.map(candidate => ({
    word: candidate,
    isCommon: commonWords.has(candidate),
    definition: ""
  }));

  const lookupCandidates = annotatedAnagrams
    .filter(item => item.word !== word)
    .slice(0, MAX_DEFINITION_LOOKUPS);

  await Promise.all(
    lookupCandidates.map(async item => {
      item.definition = await fetchDefinition(item.word);
    })
  );

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify({
      word,
      sortedKey: key,
      totalPermutations: totalUniquePermutations(word),
      annotatedAnagrams,
      validCount: annotatedAnagrams.length,
      isPrime:
        !truncated &&
        annotatedAnagrams.length === 1 &&
        annotatedAnagrams[0].word === word,
      truncated,
      resultTitle: "Results for " + word.toUpperCase(),
      letterLabel: "Alphabetized letters",
      permutationLabel: "Possible letter arrangements",
      wordCountLabel: "Valid words found",
      anagramHeading: "Valid Anagrams",
      primeLabel: "Prime Word"
    })
  };
};